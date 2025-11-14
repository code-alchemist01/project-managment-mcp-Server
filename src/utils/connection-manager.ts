import { v4 as uuidv4 } from 'uuid';
import type { ConnectionConfig, ConnectionInfo, DatabaseType } from '../types/index.js';
import { DatabaseAdapter } from '../database/base-adapter.js';
import { PostgreSQLAdapter } from '../database/postgresql.js';
import { MySQLAdapter } from '../database/mysql.js';
import { SQLiteAdapter } from '../database/sqlite.js';
import { MSSQLAdapter } from '../database/mssql.js';
import { MongoDBAdapter } from '../database/mongodb.js';
import { RedisAdapter } from '../database/redis.js';

export class ConnectionManager {
  private connections: Map<string, { adapter: DatabaseAdapter; info: ConnectionInfo }> = new Map();
  private connectionTimeout: number = 300000; // 5 minutes default

  async createConnection(config: ConnectionConfig): Promise<string> {
    const connectionId = config.id || uuidv4();
    
    if (this.connections.has(connectionId)) {
      throw new Error(`Connection ${connectionId} already exists`);
    }

    const adapter = this.createAdapter(config.type, config);
    await adapter.connect();

    const info: ConnectionInfo = {
      id: connectionId,
      type: config.type,
      status: 'connected',
      connectedAt: new Date(),
      lastUsed: new Date(),
      config,
    };

    this.connections.set(connectionId, { adapter, info });
    return connectionId;
  }

  getConnection(connectionId: string): DatabaseAdapter | null {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return null;
    }

    // Update last used timestamp
    connection.info.lastUsed = new Date();
    return connection.adapter;
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    await connection.adapter.disconnect();
    this.connections.delete(connectionId);
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map((id) => this.disconnect(id));
    await Promise.all(disconnectPromises);
  }

  listConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values()).map((c) => c.info);
  }

  getConnectionInfo(connectionId: string): ConnectionInfo | null {
    const connection = this.connections.get(connectionId);
    return connection ? connection.info : null;
  }

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    let adapter: DatabaseAdapter | null = null;
    try {
      adapter = this.createAdapter(config.type, config);
      await adapter.connect();
      const isHealthy = await adapter.healthCheck();
      await adapter.disconnect();
      return isHealthy;
    } catch (error) {
      if (adapter) {
        try {
          await adapter.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      return false;
    }
  }

  private createAdapter(type: DatabaseType, config: ConnectionConfig): DatabaseAdapter {
    switch (type) {
      case 'postgresql':
        return new PostgreSQLAdapter(config);
      case 'mysql':
        return new MySQLAdapter(config);
      case 'sqlite':
        return new SQLiteAdapter(config);
      case 'mssql':
        return new MSSQLAdapter(config);
      case 'mongodb':
        return new MongoDBAdapter(config);
      case 'redis':
        return new RedisAdapter(config);
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

  // Cleanup idle connections
  async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const toDisconnect: string[] = [];

    for (const [id, connection] of this.connections.entries()) {
      if (connection.info.lastUsed) {
        const idleTime = now - connection.info.lastUsed.getTime();
        if (idleTime > this.connectionTimeout) {
          toDisconnect.push(id);
        }
      }
    }

    for (const id of toDisconnect) {
      try {
        await this.disconnect(id);
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  setConnectionTimeout(timeout: number): void {
    this.connectionTimeout = timeout;
  }

  // Parse connection string
  parseConnectionString(connectionString: string): Partial<ConnectionConfig> {
    try {
      const url = new URL(connectionString);
      const type = this.detectDatabaseType(url.protocol);
      
      return {
        type,
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : undefined,
        database: url.pathname.slice(1) || undefined,
        username: url.username || undefined,
        password: url.password || undefined,
        connectionString,
      };
    } catch {
      return { connectionString };
    }
  }

  private detectDatabaseType(protocol: string): DatabaseType {
    const protocolMap: Record<string, DatabaseType> = {
      'postgresql:': 'postgresql',
      'postgres:': 'postgresql',
      'mysql:': 'mysql',
      'mariadb:': 'mysql',
      'sqlite:': 'sqlite',
      'mssql:': 'mssql',
      'sqlserver:': 'mssql',
      'mongodb:': 'mongodb',
      'mongodb+srv:': 'mongodb',
      'redis:': 'redis',
      'rediss:': 'redis',
    };

    return protocolMap[protocol.toLowerCase()] || 'postgresql';
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();

