import mysql from 'mysql2/promise';
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

export class MySQLAdapter extends DatabaseAdapter {
  private connection?: mysql.Connection;
  private pool?: mysql.Pool;

  async connect(): Promise<void> {
    this.validateConfig();

    const config = this.config;
    const poolConfig: mysql.PoolOptions = {
      host: config.host || 'localhost',
      port: config.port || 3306,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionLimit: config.poolSize || 10,
      connectTimeout: (config.timeout || 30000),
      ...(config.options as mysql.PoolOptions),
    };

    if (config.connectionString) {
      this.pool = mysql.createPool(config.connectionString);
    } else {
      this.pool = mysql.createPool(poolConfig);
    }

    // Test connection
    const conn = await this.pool.getConnection();
    conn.release();
    this.connected = true;
    this.connectionId = `mysql_${Date.now()}`;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
    if (this.connection) {
      await this.connection.end();
      this.connection = undefined;
    }
    this.connected = false;
  }

  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const startTime = Date.now();
    const [rows, fields] = await this.pool.execute(query, params || []);
    const executionTime = Date.now() - startTime;

    return {
      rows: rows as Array<Record<string, unknown>>,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      columns: fields?.map((f) => ({ name: f.name, type: (f.type || '').toString() })) || [],
      executionTime,
    };
  }

  async getSchema(database?: string): Promise<Schema> {
    const dbName = database || this.config.database || '';
    
    const tablesQuery = `
      SELECT 
        TABLE_SCHEMA as schema,
        TABLE_NAME as name,
        TABLE_TYPE as type
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY TABLE_SCHEMA, TABLE_NAME;
    `;

    const tablesResult = await this.executeQuery(tablesQuery, [dbName]);
    const tables: Table[] = [];

    for (const row of tablesResult.rows) {
      const schema = (row.schema as string) || '';
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
        COLUMN_NAME as name,
        DATA_TYPE as type,
        IS_NULLABLE = 'YES' as nullable,
        COLUMN_DEFAULT as default_value,
        CHARACTER_MAXIMUM_LENGTH as max_length,
        NUMERIC_PRECISION as precision,
        NUMERIC_SCALE as scale,
        COLUMN_COMMENT as comment
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION;
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
        INDEX_NAME as name,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
        NON_UNIQUE = 0 as unique,
        INDEX_TYPE as type
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE;
    `;

    const result = await this.executeQuery(query, [schema, table]);
    return result.rows.map((row) => ({
      name: row.name as string,
      columns: (row.columns as string)?.split(',') || [],
      unique: row.unique as boolean,
      type: row.type as string,
    }));
  }

  private async getForeignKeys(schema: string, table: string): Promise<ForeignKey[]> {
    const query = `
      SELECT
        CONSTRAINT_NAME as name,
        COLUMN_NAME as column,
        REFERENCED_TABLE_SCHEMA as referenced_schema,
        REFERENCED_TABLE_NAME as referenced_table,
        REFERENCED_COLUMN_NAME as referenced_column,
        DELETE_RULE as on_delete,
        UPDATE_RULE as on_update
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL;
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
        CONSTRAINT_NAME as name,
        CONSTRAINT_TYPE as type,
        CHECK_CLAUSE as definition
      FROM information_schema.TABLE_CONSTRAINTS tc
      LEFT JOIN information_schema.CHECK_CONSTRAINTS cc
        ON tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = cc.CONSTRAINT_SCHEMA
      WHERE tc.TABLE_SCHEMA = ?
        AND tc.TABLE_NAME = ?
        AND tc.CONSTRAINT_TYPE IN ('CHECK', 'UNIQUE');
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
      SELECT COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY ORDINAL_POSITION;
    `;

    const result = await this.executeQuery(query, [schema, table]);
    if (result.rows.length === 0) return undefined;
    return result.rows.map((row) => row.COLUMN_NAME as string);
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
    const explainQuery = `EXPLAIN ${query}`;
    const result = await this.executeQuery(explainQuery, params);
    
    if (result.rows.length === 0) return null;

    return {
      plan: result.rows[0] as Record<string, unknown>,
      operations: this.parsePlanOperations(result.rows as Array<Record<string, unknown>>),
    };
  }

  private parsePlanOperations(rows: Array<Record<string, unknown>>): ExecutionPlan['operations'] {
    return rows.map((row) => ({
      type: (row.select_type as string) || 'unknown',
      cost: (row.rows as number) || 0,
      rows: (row.rows as number) || 0,
      description: JSON.stringify(row),
    }));
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
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  async beginTransaction(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    this.connection = await this.pool.getConnection();
    await this.connection.beginTransaction();
  }

  async commitTransaction(): Promise<void> {
    if (!this.connection) throw new Error('No active transaction');
    await this.connection.commit();
    this.connection.end();
    this.connection = undefined;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.connection) throw new Error('No active transaction');
    await this.connection.rollback();
    this.connection.end();
    this.connection = undefined;
  }
}

