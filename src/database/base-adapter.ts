import type {
  ConnectionConfig,
  QueryResult,
  Schema,
  AdapterCapabilities,
  Table,
  ExecutionPlan,
} from '../types/index.js';

export abstract class DatabaseAdapter {
  protected config: ConnectionConfig;
  protected connected: boolean = false;
  protected connectionId?: string;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract executeQuery(query: string, params?: unknown[]): Promise<QueryResult>;
  abstract getSchema(database?: string): Promise<Schema>;
  abstract explainQuery(query: string, params?: unknown[]): Promise<ExecutionPlan | null>;
  abstract getCapabilities(): AdapterCapabilities;

  // Common utility methods
  isConnected(): boolean {
    return this.connected;
  }

  getConfig(): ConnectionConfig {
    return { ...this.config };
  }

  getConnectionId(): string | undefined {
    return this.connectionId;
  }

  // Transaction support (optional, override if supported)
  async beginTransaction(): Promise<void> {
    throw new Error('Transactions not supported by this adapter');
  }

  async commitTransaction(): Promise<void> {
    throw new Error('Transactions not supported by this adapter');
  }

  async rollbackTransaction(): Promise<void> {
    throw new Error('Transactions not supported by this adapter');
  }

  // Table operations
  async getTables(_schema?: string): Promise<Table[]> {
    const schemaInfo = await this.getSchema();
    return schemaInfo.tables;
  }

  async getTable(tableName: string, schema?: string): Promise<Table | null> {
    const tables = await this.getTables(schema);
    return tables.find((t) => t.name === tableName && (!schema || t.schema === schema)) || null;
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.executeQuery(this.getHealthCheckQuery());
      return true;
    } catch {
      return false;
    }
  }

  protected abstract getHealthCheckQuery(): string;

  // Query timeout handling
  protected createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  // Error handling
  protected handleError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }

  // Connection string parsing helpers
  protected parseConnectionString(connectionString: string): Partial<ConnectionConfig> {
    try {
      const url = new URL(connectionString);
      return {
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : undefined,
        database: url.pathname.slice(1) || undefined,
        username: url.username || undefined,
        password: url.password || undefined,
      };
    } catch {
      return {};
    }
  }

  // Validate configuration
  protected validateConfig(): void {
    if (!this.config.type) {
      throw new Error('Database type is required');
    }

    if (!this.config.connectionString && !this.config.host) {
      throw new Error('Either connectionString or host is required');
    }
  }
}

