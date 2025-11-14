import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { connectionManager } from '../utils/connection-manager.js';
import { DataAnalyzer } from '../analyzers/data-analyzer.js';
import { formatJSON, formatTableStats, formatMarkdownReport, formatCSV, formatQueryResult } from '../utils/formatters.js';

export const dataAnalysisTools: Tool[] = [
  {
    name: 'get_table_stats',
    description: 'Get statistics for a database table',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        tableName: {
          type: 'string',
          description: 'Table name',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
      },
      required: ['connectionId', 'tableName'],
    },
  },
  {
    name: 'analyze_data_quality',
    description: 'Analyze data quality for a table',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        tableName: {
          type: 'string',
          description: 'Table name',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
      },
      required: ['connectionId', 'tableName'],
    },
  },
  {
    name: 'find_duplicates',
    description: 'Find duplicate records in a table',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        tableName: {
          type: 'string',
          description: 'Table name',
        },
        columns: {
          type: 'array',
          description: 'Columns to check for duplicates (empty = all columns)',
          items: {
            type: 'string',
          },
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of duplicates to return',
          default: 100,
        },
      },
      required: ['connectionId', 'tableName'],
    },
  },
  {
    name: 'sample_data',
    description: 'Sample data from a table',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        tableName: {
          type: 'string',
          description: 'Table name',
        },
        limit: {
          type: 'number',
          description: 'Number of rows to sample',
          default: 10,
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
      },
      required: ['connectionId', 'tableName'],
    },
  },
  {
    name: 'generate_report',
    description: 'Generate a custom data analysis report',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        tableName: {
          type: 'string',
          description: 'Table name',
        },
        reportType: {
          type: 'string',
          enum: ['data_quality', 'statistics', 'comprehensive'],
          description: 'Type of report to generate',
          default: 'comprehensive',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
      },
      required: ['connectionId', 'tableName'],
    },
  },
];

export async function handleDataAnalysisTool(name: string, args: unknown): Promise<unknown> {
  const { connectionId } = args as { connectionId: string };
  const adapter = connectionManager.getConnection(connectionId);
  
  if (!adapter) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  const analyzer = new DataAnalyzer(adapter);

  switch (name) {
    case 'get_table_stats': {
      const { tableName, schema } = args as { tableName: string; schema?: string };
      const stats = await analyzer.getTableStats(tableName, schema);
      return {
        stats: formatJSON(stats),
        markdown: formatTableStats(stats),
      };
    }

    case 'analyze_data_quality': {
      const { tableName, schema } = args as { tableName: string; schema?: string };
      const report = await analyzer.analyzeDataQuality(tableName, schema);
      return {
        report: formatJSON(report),
        markdown: formatMarkdownReport(report),
      };
    }

    case 'find_duplicates': {
      const { tableName, columns, schema, limit } = args as {
        tableName: string;
        columns?: string[];
        schema?: string;
        limit?: number;
      };
      const result = await analyzer.findDuplicates(tableName, columns || [], schema, limit || 100);
      return {
        ...result,
        duplicates: formatJSON(result.duplicates),
        csv: formatCSV(result.duplicates),
      };
    }

    case 'sample_data': {
      const { tableName, limit, schema } = args as {
        tableName: string;
        limit?: number;
        schema?: string;
      };
      const data = await analyzer.sampleData(tableName, limit || 10, schema);
      return {
        data: formatJSON(data),
        csv: formatCSV(data),
        table: formatQueryResult({ rows: data, rowCount: data.length }, 'table'),
        count: data.length,
      };
    }

    case 'generate_report': {
      const { tableName, schema } = args as {
        tableName: string;
        reportType?: string;
        schema?: string;
      };
      
      const stats = await analyzer.getTableStats(tableName, schema);
      const quality = await analyzer.analyzeDataQuality(tableName, schema);
      
      let report = `# Comprehensive Report: ${tableName}\n\n`;
      report += `**Generated:** ${new Date().toISOString()}\n\n`;
      report += formatTableStats(stats);
      report += `\n\n`;
      report += formatMarkdownReport(quality);
      
      return {
        report,
        format: 'markdown',
        stats: formatJSON(stats),
        quality: formatJSON(quality),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

