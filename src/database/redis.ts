import { createClient, RedisClientType } from 'redis';
import { DatabaseAdapter } from './base-adapter.js';
import type {
  QueryResult,
  Schema,
  Table,
  AdapterCapabilities,
  ExecutionPlan,
} from '../types/index.js';

export class RedisAdapter extends DatabaseAdapter {
  private client?: RedisClientType;

  async connect(): Promise<void> {
    this.validateConfig();

    const config = this.config;
    const connectionString = config.connectionString || 
      `redis://${config.username ? `${config.username}:${config.password}@` : ''}${config.host || 'localhost'}:${config.port || 6379}`;

    this.client = createClient({
      url: connectionString,
      socket: {
        connectTimeout: config.timeout || 30000,
      },
      ...(config.options as Record<string, unknown>),
    });

    await this.client.connect();
    this.connected = true;
    this.connectionId = `redis_${Date.now()}`;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = undefined;
    }
    this.connected = false;
  }

  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.client) {
      throw new Error('Not connected to database');
    }

    // Redis commands are parsed from query string
    const parts = query.trim().split(/\s+/);
    const command = parts[0]?.toUpperCase();
    const args = parts.slice(1).concat((params || []) as string[]).map(String);

    const startTime = Date.now();
    let result: unknown;

    switch (command) {
      case 'GET':
        result = await this.client.get(args[0] || '');
        break;
      case 'SET':
        result = await this.client.set(args[0] || '', args[1] || '');
        break;
      case 'DEL':
        result = await this.client.del(args);
        break;
      case 'KEYS':
        result = await this.client.keys(args[0] || '*');
        break;
      case 'HGETALL':
        result = await this.client.hGetAll(args[0] || '');
        break;
      case 'SMEMBERS':
        result = await this.client.sMembers(args[0] || '');
        break;
      case 'LRANGE':
        result = await this.client.lRange(args[0] || '', parseInt(args[1] || '0'), parseInt(args[2] || '-1'));
        break;
      case 'INFO':
        result = await this.client.info(args[0]);
        break;
      default:
        // Try to execute as raw command
        result = await this.client.sendCommand([command, ...args] as [string, ...string[]]);
    }

    const executionTime = Date.now() - startTime;

    // Normalize result to array format
    let rows: Array<Record<string, unknown>> = [];
    if (Array.isArray(result)) {
      rows = result.map((r, i) => ({ key: i, value: r }));
    } else if (typeof result === 'object' && result !== null) {
      rows = Object.entries(result).map(([key, value]) => ({ key, value }));
    } else {
      rows = [{ result }];
    }

    return {
      rows,
      rowCount: rows.length,
      executionTime,
    };
  }

  async getSchema(database?: string): Promise<Schema> {
    if (!this.client) {
      throw new Error('Not connected to database');
    }

    // Redis doesn't have a traditional schema
    // We'll list keys and infer structure
    const keys = await this.client.keys('*');
    const keyTypes = new Map<string, string>();

    for (const key of keys.slice(0, 1000)) { // Limit to 1000 keys
      const type = await this.client.type(key);
      keyTypes.set(key, type);
    }

    // Group by type
    const tables: Table[] = [];
    const typeGroups = new Map<string, string[]>();

    for (const [key, type] of keyTypes) {
      if (!typeGroups.has(type)) {
        typeGroups.set(type, []);
      }
      typeGroups.get(type)!.push(key);
    }

    for (const [type, keys] of typeGroups) {
      tables.push({
        name: `keys_${type}`,
        type: 'table',
        columns: [
          { name: 'key', type: 'string', nullable: false },
          { name: 'value', type: type, nullable: true },
        ],
        indexes: [],
        foreignKeys: [],
        constraints: [],
        rowCount: keys.length,
      });
    }

    return {
      database: database || 'default',
      tables,
      views: [],
    };
  }

  async explainQuery(query: string, _params?: unknown[]): Promise<ExecutionPlan | null> {
    // Redis doesn't have traditional explain, but we can provide basic info
    const parts = query.trim().split(/\s+/);
    const command = parts[0]?.toUpperCase();

    return {
      plan: { command, complexity: this.getCommandComplexity(command) },
      operations: [{
        type: command,
        cost: 0,
        rows: 0,
        description: `Redis ${command} command`,
      }],
    };
  }

  private getCommandComplexity(command: string): string {
    const complexities: Record<string, string> = {
      'GET': 'O(1)',
      'SET': 'O(1)',
      'DEL': 'O(N)',
      'KEYS': 'O(N)',
      'HGETALL': 'O(N)',
      'SMEMBERS': 'O(N)',
      'LRANGE': 'O(S+N)',
    };
    return complexities[command] || 'O(1)';
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsTransactions: true, // Redis transactions
      supportsSchemas: false,
      supportsIndexes: false,
      supportsForeignKeys: false,
      supportsViews: false,
      supportsFunctions: false,
      supportsProcedures: false,
      supportsExplain: false,
      supportsBackup: true,
    };
  }

  protected getHealthCheckQuery(): string {
    return 'PING';
  }
}

