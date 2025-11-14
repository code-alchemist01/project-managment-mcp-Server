import Database from 'better-sqlite3';
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
} from '../types/index.js';

export class SQLiteAdapter extends DatabaseAdapter {
  private db?: Database.Database;

  async connect(): Promise<void> {
    this.validateConfig();

    const config = this.config;
    const dbPath = config.connectionString || config.database || ':memory:';
    
    this.db = new Database(dbPath, {
      timeout: (config.timeout || 30000),
      readonly: config.readOnly || false,
    });

    this.connected = true;
    this.connectionId = `sqlite_${Date.now()}`;
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
    this.connected = false;
  }

  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.db) {
      throw new Error('Not connected to database');
    }

    const startTime = Date.now();
    const stmt = this.db.prepare(query);
    const result = stmt.all(...(params || []));
    const executionTime = Date.now() - startTime;

    return {
      rows: result as Array<Record<string, unknown>>,
      rowCount: result.length,
      executionTime,
    };
  }

  async getSchema(_database?: string): Promise<Schema> {
    const tablesQuery = `
      SELECT 
        name,
        type
      FROM sqlite_master
      WHERE type IN ('table', 'view')
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `;

    const tablesResult = await this.executeQuery(tablesQuery);
    const tables: Table[] = [];

    for (const row of tablesResult.rows) {
      const tableName = row.name as string;
      const tableType = (row.type as string) === 'view' ? 'view' : 'table';

      const columns = await this.getColumns(tableName);
      const indexes = await this.getIndexes(tableName);
      const foreignKeys = await this.getForeignKeys(tableName);
      const constraints = await this.getConstraints(tableName);
      const primaryKey = await this.getPrimaryKey(tableName);
      const rowCount = await this.getRowCount(tableName);

      tables.push({
        name: tableName,
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
      database: this.config.database || 'main',
      tables: tables.filter((t) => t.type === 'table'),
      views: tables.filter((t) => t.type === 'view'),
    };
  }

  private async getColumns(table: string): Promise<Column[]> {
    const query = `PRAGMA table_info(${this.escapeIdentifier(table)})`;
    const result = await this.executeQuery(query);
    
    return result.rows.map((row) => ({
      name: row.name as string,
      type: row.type as string,
      nullable: !(row.notnull as boolean),
      defaultValue: row.dflt_value as string | null,
      isPrimaryKey: (row.pk as number) > 0,
    }));
  }

  private async getIndexes(table: string): Promise<Index[]> {
    const query = `PRAGMA index_list(${this.escapeIdentifier(table)})`;
    const result = await this.executeQuery(query);
    const indexes: Index[] = [];

    for (const row of result.rows) {
      const indexName = row.name as string;
      const indexInfoQuery = `PRAGMA index_info(${this.escapeIdentifier(indexName)})`;
      const indexInfo = await this.executeQuery(indexInfoQuery);
      
      indexes.push({
        name: indexName,
        columns: indexInfo.rows.map((r) => r.name as string),
        unique: (row.unique as number) === 1,
      });
    }

    return indexes;
  }

  private async getForeignKeys(table: string): Promise<ForeignKey[]> {
    const query = `PRAGMA foreign_key_list(${this.escapeIdentifier(table)})`;
    const result = await this.executeQuery(query);
    const fkMap = new Map<string, ForeignKey>();

    for (const row of result.rows) {
      const name = (row.id as number).toString();
      if (!fkMap.has(name)) {
        fkMap.set(name, {
          name: `fk_${table}_${name}`,
          table,
          columns: [],
          referencedTable: row.table as string,
          referencedColumns: [],
          onDelete: row.on_delete as string,
          onUpdate: row.on_update as string,
        });
      }
      const fk = fkMap.get(name)!;
      fk.columns.push(row.from as string);
      fk.referencedColumns.push(row.to as string);
    }

    return Array.from(fkMap.values());
  }

  private async getConstraints(_table: string): Promise<Constraint[]> {
    // SQLite doesn't expose CHECK constraints easily via PRAGMA
    // This is a simplified version
    return [];
  }

  private async getPrimaryKey(table: string): Promise<string[] | undefined> {
    const columns = await this.getColumns(table);
    const pkColumns = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    return pkColumns.length > 0 ? pkColumns : undefined;
  }

  private async getRowCount(table: string): Promise<number | undefined> {
    try {
      const query = `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(table)}`;
      const result = await this.executeQuery(query);
      return parseInt(result.rows[0]?.count as string, 10);
    } catch {
      return undefined;
    }
  }

  async explainQuery(query: string, params?: unknown[]): Promise<ExecutionPlan | null> {
    const explainQuery = `EXPLAIN QUERY PLAN ${query}`;
    const result = await this.executeQuery(explainQuery, params);
    
    if (result.rows.length === 0) return null;

    return {
      plan: (result.rows as unknown) as Record<string, unknown>,
      operations: this.parsePlanOperations(result.rows as Array<Record<string, unknown>>),
    };
  }

  private parsePlanOperations(rows: Array<Record<string, unknown>>): ExecutionPlan['operations'] {
    return rows.map((row) => ({
      type: (row.op as string) || 'unknown',
      cost: 0,
      rows: (row.rows as number) || 0,
      description: JSON.stringify(row),
    }));
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsTransactions: true,
      supportsSchemas: false,
      supportsIndexes: true,
      supportsForeignKeys: true,
      supportsViews: true,
      supportsFunctions: false,
      supportsProcedures: false,
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
    if (!this.db) throw new Error('Not connected');
    this.db.exec('BEGIN TRANSACTION');
  }

  async commitTransaction(): Promise<void> {
    if (!this.db) throw new Error('No active transaction');
    this.db.exec('COMMIT');
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.db) throw new Error('No active transaction');
    this.db.exec('ROLLBACK');
  }
}

