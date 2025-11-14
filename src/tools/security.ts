import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { connectionManager } from '../utils/connection-manager.js';
import { SecurityAnalyzer } from '../analyzers/security-analyzer.js';
import { formatJSON } from '../utils/formatters.js';

export const securityTools: Tool[] = [
  {
    name: 'analyze_permissions',
    description: 'Analyze user and role permissions in the database',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        database: {
          type: 'string',
          description: 'Database name (optional)',
        },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'detect_vulnerabilities',
    description: 'Detect security vulnerabilities in the database',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        database: {
          type: 'string',
          description: 'Database name (optional)',
        },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'find_sensitive_data',
    description: 'Find potentially sensitive data (PII, credit cards, etc.) in tables',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        tableName: {
          type: 'string',
          description: 'Table name to scan',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
        sampleSize: {
          type: 'number',
          description: 'Number of rows to sample for analysis',
          default: 100,
        },
      },
      required: ['connectionId', 'tableName'],
    },
  },
  {
    name: 'audit_logs',
    description: 'Analyze audit logs (if available)',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        startDate: {
          type: 'string',
          description: 'Start date (ISO format)',
        },
        endDate: {
          type: 'string',
          description: 'End date (ISO format)',
        },
        user: {
          type: 'string',
          description: 'Filter by user (optional)',
        },
      },
      required: ['connectionId'],
    },
  },
];

export async function handleSecurityTool(name: string, args: unknown): Promise<unknown> {
  const { connectionId } = args as { connectionId: string };
  const adapter = connectionManager.getConnection(connectionId);
  
  if (!adapter) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  const analyzer = new SecurityAnalyzer(adapter);

  switch (name) {
    case 'analyze_permissions': {
      const { database } = args as { database?: string };
      const analysis = await analyzer.analyzePermissions(database);
      return {
        analysis: formatJSON(analysis),
        users: analysis.users.map((u) => ({
          username: u.username,
          privileges: u.privileges.length,
          tables: u.tables.length,
          databases: u.databases.length,
        })),
        roles: analysis.roles.map((r) => ({
          role: r.role,
          privileges: r.privileges.length,
          members: r.members.length,
        })),
        issues: analysis.issues,
        issueCount: analysis.issues.length,
      };
    }

    case 'detect_vulnerabilities': {
      const { database } = args as { database?: string };
      const vulnerabilities = await analyzer.detectVulnerabilities(database);
      return {
        vulnerabilities: vulnerabilities.map((v) => ({
          id: v.id,
          type: v.type,
          severity: v.severity,
          description: v.description,
          recommendation: v.recommendation,
          detectedAt: v.detectedAt.toISOString(),
        })),
        count: vulnerabilities.length,
        critical: vulnerabilities.filter((v) => v.severity === 'critical').length,
        high: vulnerabilities.filter((v) => v.severity === 'high').length,
        medium: vulnerabilities.filter((v) => v.severity === 'medium').length,
        low: vulnerabilities.filter((v) => v.severity === 'low').length,
      };
    }

    case 'find_sensitive_data': {
      const { tableName, schema, sampleSize } = args as {
        tableName: string;
        schema?: string;
        sampleSize?: number;
      };
      const sensitiveData = await analyzer.findSensitiveData(tableName, schema, sampleSize || 100);
      return {
        sensitiveData: sensitiveData.map((sd) => ({
          table: sd.table,
          column: sd.column,
          type: sd.type,
          confidence: sd.confidence.toFixed(1),
          rowCount: sd.rowCount,
          recommendation: sd.recommendation,
        })),
        count: sensitiveData.length,
        summary: sensitiveData.reduce((acc, sd) => {
          acc[sd.type] = (acc[sd.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
    }

    case 'audit_logs': {
      const { startDate, endDate, user } = args as {
        startDate?: string;
        endDate?: string;
        user?: string;
      };
      
      // This would query database audit logs
      // For now, return a placeholder
      return {
        message: 'Audit log analysis not fully implemented',
        note: 'This feature requires database-specific audit log access',
        filters: {
          startDate,
          endDate,
          user,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

