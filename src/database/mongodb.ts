import { MongoClient, Db, Collection } from 'mongodb';
import { DatabaseAdapter } from './base-adapter.js';
import type {
  QueryResult,
  Schema,
  Table,
  Column,
  Index,
  AdapterCapabilities,
  ExecutionPlan,
} from '../types/index.js';

export class MongoDBAdapter extends DatabaseAdapter {
  private client?: MongoClient;
  private db?: Db;

  async connect(): Promise<void> {
    this.validateConfig();

    const config = this.config;
    const connectionString = config.connectionString || 
      `mongodb://${config.username ? `${config.username}:${config.password}@` : ''}${config.host || 'localhost'}:${config.port || 27017}/${config.database || ''}`;

    this.client = new MongoClient(connectionString, {
      maxPoolSize: config.poolSize || 10,
      connectTimeoutMS: config.timeout || 30000,
      ...(config.options as Record<string, unknown>),
    });

    await this.client.connect();
    this.db = this.client.db(config.database);
    this.connected = true;
    this.connectionId = `mongodb_${Date.now()}`;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
      this.db = undefined;
    }
    this.connected = false;
  }

  async executeQuery(query: string, _params?: unknown[]): Promise<QueryResult> {
    if (!this.db) {
      throw new Error('Not connected to database');
    }

    // MongoDB queries are JSON-based
    try {
      const queryObj = JSON.parse(query);
      const collectionName = queryObj.collection || queryObj.from;
      const collection = this.db.collection(collectionName);
      
      const startTime = Date.now();
      let result: unknown[] = [];
      
      if (queryObj.operation === 'find' || !queryObj.operation) {
        const cursor = collection.find(queryObj.filter || {}, queryObj.options || {});
        result = await cursor.toArray();
      } else if (queryObj.operation === 'aggregate') {
        result = await collection.aggregate(queryObj.pipeline || []).toArray();
      } else if (queryObj.operation === 'count') {
        const count = await collection.countDocuments(queryObj.filter || {});
        result = [{ count }];
      }

      const executionTime = Date.now() - startTime;

      return {
        rows: result as Array<Record<string, unknown>>,
        rowCount: result.length,
        executionTime,
      };
    } catch (error) {
      throw new Error(`Invalid MongoDB query: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSchema(database?: string): Promise<Schema> {
    if (!this.db) {
      throw new Error('Not connected to database');
    }

    const dbName = database || this.config.database || this.db.databaseName;
    const collections = await this.db.listCollections().toArray();
    const tables: Table[] = [];

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      const collection = this.db.collection(collectionName);
      
      // Sample documents to infer schema
      const sampleDocs = await collection.find({}).limit(10).toArray();
      const columns = this.inferColumns(sampleDocs);
      const rowCount = await collection.countDocuments();

      tables.push({
        name: collectionName,
        type: 'table',
        columns,
        indexes: await this.getIndexes(collection),
        foreignKeys: [], // MongoDB doesn't have foreign keys
        constraints: [],
        rowCount,
      });
    }

    return {
      database: dbName,
      tables,
      views: [], // MongoDB doesn't have views
    };
  }

  private inferColumns(documents: Array<Record<string, unknown>>): Column[] {
    const columnMap = new Map<string, Column>();

    for (const doc of documents) {
      this.extractFields(doc, '', columnMap);
    }

    return Array.from(columnMap.values());
  }

  private extractFields(obj: unknown, prefix: string, columnMap: Map<string, Column>): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof Date)) {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const type = this.getType(value);

        if (!columnMap.has(fullKey)) {
          columnMap.set(fullKey, {
            name: fullKey,
            type,
            nullable: true,
          });
        }

        if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
          this.extractFields(value, fullKey, columnMap);
        }
      }
    }
  }

  private getType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    if (typeof value === 'object') return 'object';
    return typeof value;
  }

  private async getIndexes(collection: Collection): Promise<Index[]> {
    const indexes = await collection.indexes();
    return indexes.map((idx) => ({
      name: idx.name || 'unnamed_index',
      columns: Object.keys(idx.key),
      unique: idx.unique === true,
      type: idx.type || 'btree',
    }));
  }

  async explainQuery(query: string, _params?: unknown[]): Promise<ExecutionPlan | null> {
    if (!this.db) {
      throw new Error('Not connected to database');
    }

    try {
      const queryObj = JSON.parse(query);
      const collectionName = queryObj.collection || queryObj.from;
      const collection = this.db.collection(collectionName);

      const explainResult = await collection.find(queryObj.filter || {}).explain('executionStats');
      
      return {
        plan: explainResult as Record<string, unknown>,
        operations: this.parsePlanOperations(explainResult as Record<string, unknown>),
      };
    } catch {
      return null;
    }
  }

  private parsePlanOperations(plan: Record<string, unknown>): ExecutionPlan['operations'] {
    const ops: ExecutionPlan['operations'] = [];
    
    if (plan.executionStats) {
      const stats = plan.executionStats as Record<string, unknown>;
      ops.push({
        type: 'query',
        cost: (stats.executionTimeMillis as number) || 0,
        rows: (stats.nReturned as number) || 0,
        description: JSON.stringify(stats),
      });
    }

    return ops;
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsTransactions: true, // MongoDB 4.0+
      supportsSchemas: false,
      supportsIndexes: true,
      supportsForeignKeys: false,
      supportsViews: false,
      supportsFunctions: false,
      supportsProcedures: false,
      supportsExplain: true,
      supportsBackup: true,
    };
  }

  protected getHealthCheckQuery(): string {
    return JSON.stringify({
      operation: 'count',
      collection: 'test',
      filter: {},
    });
  }

  async beginTransaction(): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const session = this.client.startSession();
    session.startTransaction();
  }

  async commitTransaction(): Promise<void> {
    throw new Error('Transaction management needs session reference');
  }

  async rollbackTransaction(): Promise<void> {
    throw new Error('Transaction management needs session reference');
  }
}

