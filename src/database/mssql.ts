import sql from 'mssql';
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

export class MSSQLAdapter extends DatabaseAdapter {
  private pool?: sql.ConnectionPool;

  async connect(): Promise<void> {
    this.validateConfig();

    const config = this.config;
    const poolConfig: sql.config = {
      server: config.host || 'localhost',
      port: config.port || 1433,
      database: config.database || '',
      user: config.username || '',
      password: config.password || '',
      pool: {
        max: config.poolSize || 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
      options: {
        encrypt: true,
        ...(config.options as sql.config['options']),
      },
      requestTimeout: config.timeout || 30000,
    };

    if (config.connectionString) {
      this.pool = new sql.ConnectionPool(config.connectionString);
    } else {
      this.pool = new sql.ConnectionPool(poolConfig);
    }
    
    await this.pool.connect();

    this.connected = true;
    this.connectionId = `mssql_${Date.now()}`;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
    }
    this.connected = false;
  }

  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const startTime = Date.now();
    const request = this.pool.request();
    
    // Add parameters if provided
    if (params) {
      params.forEach((param, index) => {
        request.input(`param${index}`, param);
      });
    }

    const result = await request.query(query);
    const executionTime = Date.now() - startTime;

    return {
      rows: result.recordset as Array<Record<string, unknown>>,
      rowCount: result.rowsAffected[0] || 0,
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
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY TABLE_SCHEMA, TABLE_NAME;
    `;

    const tablesResult = await this.executeQuery(tablesQuery);
    const tables: Table[] = [];

    for (const row of tablesResult.rows) {
      const schema = (row.schema as string) || 'dbo';
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
        NUMERIC_SCALE as scale
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
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
    }));
  }

  private async getIndexes(schema: string, table: string): Promise<Index[]> {
    const query = `
      SELECT
        i.name as name,
        STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) as columns,
        i.is_unique as unique,
        i.type_desc as type
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE s.name = @schema AND t.name = @table
      GROUP BY i.name, i.is_unique, i.type_desc;
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
        fk.name as name,
        c.name as column,
        rs.name as referenced_schema,
        rt.name as referenced_table,
        rc.name as referenced_column,
        fk.delete_referential_action_desc as on_delete,
        fk.update_referential_action_desc as on_update
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.tables t ON fkc.parent_object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      INNER JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
      INNER JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
      INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
      INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
      WHERE s.name = @schema AND t.name = @table;
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
        tc.CONSTRAINT_NAME as name,
        tc.CONSTRAINT_TYPE as type,
        cc.CHECK_CLAUSE as definition
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      LEFT JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
        ON tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
        AND tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
      WHERE tc.TABLE_SCHEMA = @schema
        AND tc.TABLE_NAME = @table
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
      SELECT c.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE c
        ON tc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        AND tc.TABLE_SCHEMA = @schema
        AND tc.TABLE_NAME = @table
      ORDER BY c.ORDINAL_POSITION;
    `;

    const result = await this.executeQuery(query, [schema, table]);
    if (result.rows.length === 0) return undefined;
    return result.rows.map((row) => row.COLUMN_NAME as string);
  }

  private async getRowCount(schema: string, table: string): Promise<number | undefined> {
    try {
      const query = `SELECT COUNT(*) as count FROM [${schema}].[${table}]`;
      const result = await this.executeQuery(query);
      return parseInt(result.rows[0]?.count as string, 10);
    } catch {
      return undefined;
    }
  }

  async explainQuery(query: string, params?: unknown[]): Promise<ExecutionPlan | null> {
    // SQL Server execution plan is complex, simplified version
    const result = await this.executeQuery(`SET SHOWPLAN_XML ON; ${query}; SET SHOWPLAN_XML OFF;`, params);
    
    if (result.rows.length === 0) return null;

    return {
      plan: result.rows[0] as Record<string, unknown>,
      operations: [],
    };
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
      supportsExplain: false, // Complex in SQL Server
      supportsBackup: true,
    };
  }

  protected getHealthCheckQuery(): string {
    return 'SELECT 1';
  }

  async beginTransaction(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
  }

  async commitTransaction(): Promise<void> {
    throw new Error('Transaction management needs connection reference');
  }

  async rollbackTransaction(): Promise<void> {
    throw new Error('Transaction management needs connection reference');
  }
}

