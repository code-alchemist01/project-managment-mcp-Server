import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { connectionManager } from '../utils/connection-manager.js';
import { QueryAnalyzer } from '../analyzers/query-analyzer.js';
import { formatJSON, formatExecutionPlan } from '../utils/formatters.js';

export const queryAnalysisTools: Tool[] = [
  {
    name: 'analyze_query',
    description: 'Analyze a SQL query for performance, security, and optimization opportunities',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        query: {
          type: 'string',
          description: 'SQL query to analyze',
        },
        params: {
          type: 'array',
          description: 'Query parameters (optional)',
          items: {
            type: ['string', 'number', 'boolean', 'null'],
          },
        },
      },
      required: ['connectionId', 'query'],
    },
  },
  {
    name: 'explain_query',
    description: 'Get execution plan for a SQL query',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        query: {
          type: 'string',
          description: 'SQL query to explain',
        },
        params: {
          type: 'array',
          description: 'Query parameters (optional)',
          items: {
            type: ['string', 'number', 'boolean', 'null'],
          },
        },
      },
      required: ['connectionId', 'query'],
    },
  },
  {
    name: 'optimize_query',
    description: 'Get optimization suggestions for a SQL query',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        query: {
          type: 'string',
          description: 'SQL query to optimize',
        },
      },
      required: ['connectionId', 'query'],
    },
  },
  {
    name: 'detect_slow_queries',
    description: 'Detect slow queries in the database',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        thresholdMs: {
          type: 'number',
          description: 'Threshold in milliseconds (default: 1000)',
          default: 1000,
        },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'suggest_indexes',
    description: 'Suggest indexes based on a query',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        query: {
          type: 'string',
          description: 'SQL query to analyze for index suggestions',
        },
      },
      required: ['connectionId', 'query'],
    },
  },
];

export async function handleQueryAnalysisTool(name: string, args: unknown): Promise<unknown> {
  const { connectionId } = args as { connectionId: string };
  const adapter = connectionManager.getConnection(connectionId);
  
  if (!adapter) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  const analyzer = new QueryAnalyzer(adapter);

  switch (name) {
    case 'analyze_query': {
      const { query, params } = args as { query: string; params?: unknown[] };
      const result = await analyzer.analyzeQuery(query, params);
      return {
        ...result,
        plan: result.plan ? formatJSON(result.plan) : undefined,
      };
    }

    case 'explain_query': {
      const { query, params } = args as { query: string; params?: unknown[] };
      const plan = await analyzer.explainQuery(query, params);
      if (!plan) {
        return {
          message: 'Execution plan not available for this database type',
        };
      }
      return {
        plan: formatJSON(plan),
        markdown: formatExecutionPlan(plan),
      };
    }

    case 'optimize_query': {
      const { query, params } = args as { query: string; params?: unknown[] };
      const suggestions = await analyzer.optimizeQuery(query, params);
      return {
        query,
        suggestions,
        count: suggestions.length,
      };
    }

    case 'detect_slow_queries': {
      const { thresholdMs } = args as { thresholdMs?: number };
      const slowQueries = await analyzer.detectSlowQueries(thresholdMs || 1000);
      return {
        slowQueries,
        count: slowQueries.length,
        thresholdMs: thresholdMs || 1000,
      };
    }

    case 'suggest_indexes': {
      const { query } = args as { query: string };
      const suggestions = await analyzer.suggestIndexes(query);
      return {
        suggestions: suggestions.map((idx) => ({
          table: idx.table,
          columns: idx.columns,
          type: idx.type,
          reason: idx.reason,
          estimatedImprovement: idx.estimatedImprovement,
        })),
        count: suggestions.length,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

