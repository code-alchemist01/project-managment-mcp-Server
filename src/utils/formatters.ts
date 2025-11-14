import type {
  QueryResult,
  TableStats,
  DataQualityReport,
  Schema,
  Report,
  ExecutionPlan,
} from '../types/index.js';

export function formatJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatMarkdownReport(report: DataQualityReport): string {
  let md = `# Data Quality Report: ${report.table}\n\n`;
  md += `**Overall Score:** ${report.overallScore.toFixed(1)}/100\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;

  if (report.issues.length > 0) {
    md += `## Issues\n\n`;
    for (const issue of report.issues) {
      md += `### ${issue.type.toUpperCase()} - ${issue.severity.toUpperCase()}\n\n`;
      md += `${issue.description}\n\n`;
      md += `- **Affected Rows:** ${issue.affectedRows.toLocaleString()}\n`;
      if (issue.affectedColumns) {
        md += `- **Affected Columns:** ${issue.affectedColumns.join(', ')}\n`;
      }
      md += `\n`;
    }
  }

  if (report.recommendations.length > 0) {
    md += `## Recommendations\n\n`;
    for (const rec of report.recommendations) {
      md += `- ${rec}\n`;
    }
  }

  return md;
}

export function formatCSV(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0] || {});
  const csvRows = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      }
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

export function formatSQLScript(statements: string[]): string {
  return statements.join(';\n\n') + ';';
}

export function formatTableStats(stats: TableStats): string {
  let md = `# Table Statistics: ${stats.table}\n\n`;
  md += `**Row Count:** ${stats.rowCount.toLocaleString()}\n`;
  md += `**Size:** ${formatBytes(stats.size)}\n`;
  md += `**Last Analyzed:** ${stats.lastAnalyzed?.toISOString() || 'Never'}\n\n`;

  md += `## Column Statistics\n\n`;
  md += `| Column | Null % | Unique % | Distinct Values | Min | Max |\n`;
  md += `|--------|--------|----------|----------------|-----|-----|\n`;

  for (const colStat of stats.columnStats) {
    md += `| ${colStat.column} | ${colStat.nullPercentage.toFixed(1)}% | ${colStat.uniquePercentage.toFixed(1)}% | `;
    md += `${colStat.distinctValues?.toLocaleString() || 'N/A'} | `;
    md += `${colStat.minValue?.toString() || '-'} | ${colStat.maxValue?.toString() || '-'} |\n`;
  }

  return md;
}

export function formatSchemaMarkdown(schema: Schema): string {
  let md = `# Database Schema: ${schema.database}\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;

  md += `## Tables (${schema.tables.length})\n\n`;
  for (const table of schema.tables) {
    md += `### ${table.name}\n\n`;
    md += `**Type:** ${table.type}\n`;
    if (table.schema) {
      md += `**Schema:** ${table.schema}\n`;
    }
    if (table.rowCount !== undefined) {
      md += `**Rows:** ${table.rowCount.toLocaleString()}\n`;
    }
    md += `\n`;
  }

  if (schema.views.length > 0) {
    md += `## Views (${schema.views.length})\n\n`;
    for (const view of schema.views) {
      md += `### ${view.name}\n\n`;
    }
  }

  return md;
}

export function formatExecutionPlan(plan: ExecutionPlan): string {
  let md = `# Execution Plan\n\n`;
  
  if (plan.cost !== undefined) {
    md += `**Total Cost:** ${plan.cost}\n`;
  }
  if (plan.executionTime !== undefined) {
    md += `**Execution Time:** ${plan.executionTime}ms\n`;
  }
  if (plan.rows !== undefined) {
    md += `**Estimated Rows:** ${plan.rows.toLocaleString()}\n`;
  }
  md += `\n`;

  if (plan.operations && plan.operations.length > 0) {
    md += `## Operations\n\n`;
    md += `| Type | Cost | Rows | Description |\n`;
    md += `|------|------|------|-------------|\n`;
    
    for (const op of plan.operations) {
      md += `| ${op.type} | ${op.cost} | ${op.rows} | ${op.description} |\n`;
    }
  }

  return md;
}

export function formatReport(report: Report): string {
  switch (report.format) {
    case 'markdown':
      return report.content;
    case 'json':
      return formatJSON(report);
    case 'csv':
      return report.content;
    case 'html':
      return report.content;
    default:
      return report.content;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i] || ''}`;
}

// Helper to format query results
export function formatQueryResult(result: QueryResult, format: 'json' | 'csv' | 'table' = 'json'): string {
  switch (format) {
    case 'json':
      return formatJSON(result.rows);
    case 'csv':
      return formatCSV(result.rows);
    case 'table':
      return formatTable(result.rows);
    default:
      return formatJSON(result.rows);
  }
}

function formatTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return 'No rows returned.';
  }

  const headers = Object.keys(rows[0] || {});
  const colWidths = headers.map((header) => {
    const maxWidth = Math.max(
      header.length,
      ...rows.map((row) => String(row[header] || '').length)
    );
    return Math.min(maxWidth, 50); // Cap at 50 chars
  });

  // Header row
  let table = '| ' + headers.map((h, i) => h.padEnd(colWidths[i] || 0)).join(' | ') + ' |\n';
  table += '|' + headers.map((_, i) => '-'.repeat(colWidths[i] || 0)).join('|') + '|\n';

  // Data rows
  for (const row of rows.slice(0, 100)) { // Limit to 100 rows
    const values = headers.map((h, i) => {
      const value = String(row[h] || '').substring(0, colWidths[i] || 0);
      return value.padEnd(colWidths[i] || 0);
    });
    table += '| ' + values.join(' | ') + ' |\n';
  }

  if (rows.length > 100) {
    table += `\n... and ${rows.length - 100} more rows\n`;
  }

  return table;
}

