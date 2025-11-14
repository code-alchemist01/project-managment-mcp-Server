import type { DatabaseAdapter } from '../database/base-adapter.js';
import type {
  TableStats,
  ColumnStat,
  DataQualityReport,
  DataQualityIssue,
  DuplicateResult,
} from '../types/index.js';

export class DataAnalyzer {
  constructor(private adapter: DatabaseAdapter) {}

  async getTableStats(tableName: string, schema?: string): Promise<TableStats> {
    const tables = await this.adapter.getTables(schema);
    const table = tables.find((t) => t.name === tableName && (!schema || t.schema === schema));
    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }

    const columnStats: ColumnStat[] = [];

    for (const column of table.columns) {
      const stats = await this.getColumnStats(tableName, column.name, schema);
      columnStats.push(stats);
    }

    return {
      table: tableName,
      rowCount: table.rowCount || 0,
      size: table.size || 0,
      columnStats,
      lastAnalyzed: new Date(),
    };
  }

  async analyzeDataQuality(tableName: string, schema?: string): Promise<DataQualityReport> {
    const issues: DataQualityIssue[] = [];
    const recommendations: string[] = [];
    const table = await this.adapter.getTable(tableName, schema);

    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }

    const stats = await this.getTableStats(tableName, schema);

    // Check for missing values
    for (const colStat of stats.columnStats) {
      if (colStat.nullPercentage > 50) {
        issues.push({
          type: 'missing',
          severity: colStat.nullPercentage > 90 ? 'high' : 'medium',
          description: `Column ${colStat.column} has ${colStat.nullPercentage.toFixed(1)}% null values`,
          affectedRows: Math.round((stats.rowCount * colStat.nullPercentage) / 100),
          affectedColumns: [colStat.column],
        });
      }

      if (colStat.nullPercentage > 20 && colStat.nullPercentage <= 50) {
        recommendations.push(`Consider investigating why ${colStat.column} has ${colStat.nullPercentage.toFixed(1)}% null values`);
      }
    }

    // Check for duplicates
    const duplicateResult = await this.findDuplicates(tableName, [], schema);
    if (duplicateResult.duplicateCount > 0) {
      const duplicatePercentage = (duplicateResult.duplicateCount / duplicateResult.totalRows) * 100;
      issues.push({
        type: 'duplicate',
        severity: duplicatePercentage > 10 ? 'high' : duplicatePercentage > 5 ? 'medium' : 'low',
        description: `Found ${duplicateResult.duplicateCount} duplicate rows (${duplicatePercentage.toFixed(1)}% of total)`,
        affectedRows: duplicateResult.duplicateCount,
        examples: duplicateResult.duplicates.slice(0, 5),
      });
    }

    // Check for inconsistent data
    for (const colStat of stats.columnStats) {
      if (colStat.distinctValues && stats.rowCount > 0) {
        const distinctRatio = colStat.distinctValues / stats.rowCount;
        if (distinctRatio < 0.1 && stats.rowCount > 100) {
          issues.push({
            type: 'inconsistent',
            severity: 'low',
            description: `Column ${colStat.column} has low distinct value ratio (${(distinctRatio * 100).toFixed(1)}%)`,
            affectedRows: stats.rowCount,
            affectedColumns: [colStat.column],
          });
        }
      }
    }

    // Calculate overall score
    const overallScore = this.calculateQualityScore(issues, stats.rowCount);

    return {
      table: tableName,
      overallScore,
      issues,
      recommendations,
    };
  }

  async findDuplicates(
    tableName: string,
    columns: string[],
    schema?: string,
    limit: number = 100
  ): Promise<DuplicateResult> {
    const tables = await this.adapter.getTables(schema);
    const table = tables.find((t) => t.name === tableName && (!schema || t.schema === schema));
    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }

    // If no columns specified, use all columns
    const checkColumns = columns.length > 0 ? columns : table.columns.map((c) => c.name);

    // Build duplicate detection query
    const columnList = checkColumns.map((c) => this.escapeIdentifier(c)).join(', ');
    const query = `
      SELECT ${columnList}, COUNT(*) as duplicate_count
      FROM ${this.escapeIdentifier(tableName)}
      GROUP BY ${columnList}
      HAVING COUNT(*) > 1
      LIMIT ${limit}
    `;

    const result = await this.adapter.executeQuery(query);
    const totalRows = table.rowCount || 0;

    return {
      table: tableName,
      columns: checkColumns,
      duplicateCount: result.rows.length,
      totalRows,
      duplicates: result.rows.map((row) => {
        const { duplicate_count, ...data } = row;
        return data;
      }) as Array<Record<string, unknown>>,
      sampleSize: limit,
    };
  }

  async sampleData(
    tableName: string,
    limit: number = 10,
    _schema?: string
  ): Promise<Array<Record<string, unknown>>> {
    const query = `SELECT * FROM ${this.escapeIdentifier(tableName)} LIMIT ${limit}`;
    const result = await this.adapter.executeQuery(query);
    return result.rows;
  }

  async getColumnStats(
    tableName: string,
    columnName: string,
    _schema?: string
  ): Promise<ColumnStat> {
    const escapedTable = this.escapeIdentifier(tableName);
    const escapedColumn = this.escapeIdentifier(columnName);

    // Get null count
    const nullQuery = `SELECT COUNT(*) as null_count FROM ${escapedTable} WHERE ${escapedColumn} IS NULL`;
    const nullResult = await this.adapter.executeQuery(nullQuery);
    const nullCount = parseInt(nullResult.rows[0]?.null_count as string, 10) || 0;

    // Get total count
    const totalQuery = `SELECT COUNT(*) as total FROM ${escapedTable}`;
    const totalResult = await this.adapter.executeQuery(totalQuery);
    const total = parseInt(totalResult.rows[0]?.total as string, 10) || 1;

    const nullPercentage = (nullCount / total) * 100;

    // Get unique count
    const uniqueQuery = `SELECT COUNT(DISTINCT ${escapedColumn}) as unique_count FROM ${escapedTable}`;
    const uniqueResult = await this.adapter.executeQuery(uniqueQuery);
    const uniqueCount = parseInt(uniqueResult.rows[0]?.unique_count as string, 10) || 0;
    const uniquePercentage = (uniqueCount / total) * 100;

    // Get min/max (for numeric/date columns)
    let minValue: string | number | undefined;
    let maxValue: string | number | undefined;
    try {
      const minMaxQuery = `SELECT MIN(${escapedColumn}) as min_val, MAX(${escapedColumn}) as max_val FROM ${escapedTable}`;
      const minMaxResult = await this.adapter.executeQuery(minMaxQuery);
      minValue = minMaxResult.rows[0]?.min_val as string | number | undefined;
      maxValue = minMaxResult.rows[0]?.max_val as string | number | undefined;
    } catch {
      // Ignore errors for non-numeric columns
    }

    // Get distinct values count
    const distinctQuery = `SELECT COUNT(DISTINCT ${escapedColumn}) as distinct_count FROM ${escapedTable}`;
    const distinctResult = await this.adapter.executeQuery(distinctQuery);
    const distinctValues = parseInt(distinctResult.rows[0]?.distinct_count as string, 10) || 0;

    // Get top values (sample)
    let topValues: Array<{ value: string | number; count: number }> | undefined;
    try {
      const topQuery = `
        SELECT ${escapedColumn} as value, COUNT(*) as count
        FROM ${escapedTable}
        WHERE ${escapedColumn} IS NOT NULL
        GROUP BY ${escapedColumn}
        ORDER BY count DESC
        LIMIT 10
      `;
      const topResult = await this.adapter.executeQuery(topQuery);
      topValues = topResult.rows.map((row) => ({
        value: row.value as string | number,
        count: parseInt(row.count as string, 10),
      }));
    } catch {
      // Ignore errors
    }

    return {
      column: columnName,
      nullCount,
      nullPercentage,
      uniqueCount,
      uniquePercentage,
      minValue,
      maxValue,
      distinctValues,
      topValues,
    };
  }

  private calculateQualityScore(issues: DataQualityIssue[], totalRows: number): number {
    let score = 100;

    for (const issue of issues) {
      const severityWeight = {
        low: 5,
        medium: 15,
        high: 30,
        critical: 50,
      };

      const weight = severityWeight[issue.severity] || 10;
      const impact = issue.affectedRows / Math.max(totalRows, 1);
      score -= weight * impact;
    }

    return Math.max(0, Math.min(100, score));
  }

  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

