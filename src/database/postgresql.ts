import pg from 'pg';
import type { Pool, Client } from 'pg';
import { DatabaseAdapter } from './base-adapter.js';
import type {
  QueryResult,
  Schema,
  Table,
  Column,
  Index,
  ForeignKey,
  Constraint,
  AdapterCapabilities,
  ExecutionPlan,
  PlanOperation,
} from '../types/index.js';

export class PostgreSQLAdapter extends DatabaseAdapter {
  private pool?: Pool;
  private client?: Client;

  async connect(): Promise<void> {
    this.validateConfig();

    const config = this.config;
    const poolConfig: pg.PoolConfig = {
      host: config.host || 'localhost',
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      max: config.poolSize || 10,
      connectionTimeoutMillis: (config.timeout || 30000),
      idleTimeoutMillis: 30000,
      ...(config.options as pg.PoolConfig),
    };

    if (config.connectionString) {
      this.pool = new pg.Pool({ connectionString: config.connectionString, ...poolConfig });
    } else {
      this.pool = new pg.Pool(poolConfig);
    }

    // Test connection
    const client = await this.pool.connect();
    client.release();
    this.connected = true;
    this.connectionId = `pg_${Date.now()}`;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
    if (this.client) {
      await this.client.end();
      this.client = undefined;
    }
    this.connected = false;
  }

  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const startTime = Date.now();
    const result = await this.pool.query(query, params);
    const executionTime = Date.now() - startTime;

    return {
      rows: result.rows as Array<Record<string, unknown>>,
      rowCount: result.rowCount || 0,
      columns: result.fields.map((f: { name: string; dataTypeID: number }) => ({ name: f.name, type: f.dataTypeID.toString() })),
      executionTime,
    };
  }

  async getSchema(database?: string): Promise<Schema> {
    const dbName = database || this.config.database || 'postgres';
    
    const tablesQuery = `
      SELECT 
        t.table_schema as schema,
        t.table_name as name,
        t.table_type as type
      FROM information_schema.tables t
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY t.table_schema, t.table_name;
    `;

    const tablesResult = await this.executeQuery(tablesQuery);
    const tables: Table[] = [];

    for (const row of tablesResult.rows) {
      const schema = (row.schema as string) || 'public';
      const tableName = row.name as string;
      const tableType = (row.type as string) === 'VIEW' ? 'view' : 'table';

      const columns = await this.getColumns(schema, tableName);
      const indexes = await this.getIndexes(schema, tableName);
      const foreignKeys = await this.getForeignKeys(schema, tableName);
      const constraints = await this.getConstraints(schema, tableName);
      const primaryKey = await this.getPrimaryKey(schema, tableName);
      const rowCount = await this.getRowCount(schema, tableName);

      tables.push({
        name: tableName,
        schema,
        type: tableType,
        columns,
        indexes,
        foreignKeys,
        constraints,
        primaryKey,
        rowCount,
      });
    }

    return {
      database: dbName,
      tables: tables.filter((t) => t.type === 'table'),
      views: tables.filter((t) => t.type === 'view'),
    };
  }

  private async getColumns(schema: string, table: string): Promise<Column[]> {
    const query = `
      SELECT 
        c.column_name as name,
        c.data_type as type,
        c.is_nullable = 'YES' as nullable,
        c.column_default as default_value,
        c.character_maximum_length as max_length,
        c.numeric_precision as precision,
        c.numeric_scale as scale,
        c.column_comment as comment
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position;
    `;

    const result = await this.executeQuery(query, [schema, table]);
    return result.rows.map((row) => ({
      name: row.name as string,
      type: row.type as string,
      nullable: row.nullable as boolean,
      defaultValue: row.default_value as string | null,
      maxLength: row.max_length as number | undefined,
      precision: row.precision as number | undefined,
      scale: row.scale as number | undefined,
      comment: row.comment as string | undefined,
    }));
  }

  private async getIndexes(schema: string, table: string): Promise<Index[]> {
    const query = `
      SELECT
        i.indexname as name,
        i.indexdef as definition,
        ix.indisunique as unique
      FROM pg_indexes i
      JOIN pg_index ix ON i.indexname = (SELECT relname FROM pg_class WHERE oid = ix.indexrelid)
      WHERE i.schemaname = $1 AND i.tablename = $2;
    `;

    const result = await this.executeQuery(query, [schema, table]);
    return result.rows.map((row) => {
      const def = row.definition as string;
      const columns = def.match(/\(([^)]+)\)/)?.[1]?.split(',').map((c) => c.trim()) || [];
      
      return {
        name: row.name as string,
        columns,
        unique: row.unique as boolean,
      };
    });
  }

  private async getForeignKeys(schema: string, table: string): Promise<ForeignKey[]> {
    const query = `
      SELECT
        tc.constraint_name as name,
        kcu.column_name as column,
        ccu.table_schema as referenced_schema,
        ccu.table_name as referenced_table,
        ccu.column_name as referenced_column,
        rc.delete_rule as on_delete,
        rc.update_rule as on_update
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2;
    `;

    const result = await this.executeQuery(query, [schema, table]);
    const fkMap = new Map<string, ForeignKey>();

    for (const row of result.rows) {
      const name = row.name as string;
      if (!fkMap.has(name)) {
        fkMap.set(name, {
          name,
          table,
          columns: [],
          referencedTable: row.referenced_table as string,
          referencedColumns: [],
          onDelete: row.on_delete as string,
          onUpdate: row.on_update as string,
        });
      }
      const fk = fkMap.get(name)!;
      fk.columns.push(row.column as string);
      fk.referencedColumns.push(row.referenced_column as string);
    }

    return Array.from(fkMap.values());
  }

  private async getConstraints(schema: string, table: string): Promise<Constraint[]> {
    const query = `
      SELECT
        tc.constraint_name as name,
        tc.constraint_type as type,
        cc.check_clause as definition
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_schema = $1
        AND tc.table_name = $2
        AND tc.constraint_type IN ('CHECK', 'UNIQUE');
    `;

    const result = await this.executeQuery(query, [schema, table]);
    return result.rows.map((row) => ({
      name: row.name as string,
      type: (row.type as string).toLowerCase() as 'check' | 'unique',
      definition: row.definition as string | undefined,
    }));
  }

  private async getPrimaryKey(schema: string, table: string): Promise<string[] | undefined> {
    const query = `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY kcu.ordinal_position;
    `;

    const result = await this.executeQuery(query, [schema, table]);
    if (result.rows.length === 0) return undefined;
    return result.rows.map((row) => row.column_name as string);
  }

  private async getRowCount(schema: string, table: string): Promise<number | undefined> {
    try {
      const query = `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(schema)}.${this.escapeIdentifier(table)}`;
      const result = await this.executeQuery(query);
      return parseInt(result.rows[0]?.count as string, 10);
    } catch {
      return undefined;
    }
  }

  async explainQuery(query: string, params?: unknown[]): Promise<ExecutionPlan | null> {
    const explainQuery = `EXPLAIN (FORMAT JSON) ${query}`;
    const result = await this.executeQuery(explainQuery, params);
    
    if (result.rows.length === 0) return null;

    const plan = result.rows[0]?.['QUERY PLAN'] as unknown;
    const planObj = Array.isArray(plan) ? plan[0] : plan;
    
    return {
      plan: planObj as Record<string, unknown>,
      operations: this.parsePlanOperations(planObj as Record<string, unknown>),
    };
  }

  private parsePlanOperations(plan: Record<string, unknown>): PlanOperation[] {
    const ops: ExecutionPlan['operations'] = [];
    
    const parseNode = (node: Record<string, unknown>): PlanOperation => {
      const op: PlanOperation = {
        type: (node['Node Type'] as string) || 'unknown',
        cost: ((node['Total Cost'] as number) || 0) - ((node['Startup Cost'] as number) || 0),
        rows: (node['Plan Rows'] as number) || 0,
        description: (node['Node Type'] as string) || '',
      };

      if (node['Plans'] && Array.isArray(node['Plans'])) {
        op.children = (node['Plans'] as Record<string, unknown>[]).map(parseNode);
      }

      return op;
    };

    if (plan['Plan']) {
      ops.push(parseNode(plan['Plan'] as Record<string, unknown>));
    }

    return ops;
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsTransactions: true,
      supportsSchemas: true,
      supportsIndexes: true,
      supportsForeignKeys: true,
      supportsViews: true,
      supportsFunctions: true,
      supportsProcedures: true,
      supportsExplain: true,
      supportsBackup: true,
    };
  }

  protected getHealthCheckQuery(): string {
    return 'SELECT 1';
  }

  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  async beginTransaction(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    const poolClient = await this.pool.connect();
    this.client = poolClient as unknown as Client;
    await poolClient.query('BEGIN');
  }

  async commitTransaction(): Promise<void> {
    if (!this.client || !this.pool) throw new Error('No active transaction');
    const poolClient = this.client as unknown as pg.PoolClient;
    await poolClient.query('COMMIT');
    poolClient.release();
    this.client = undefined;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.client || !this.pool) throw new Error('No active transaction');
    const poolClient = this.client as unknown as pg.PoolClient;
    await poolClient.query('ROLLBACK');
    poolClient.release();
    this.client = undefined;
  }
}

