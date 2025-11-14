import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { connectionManager } from '../utils/connection-manager.js';
import { SchemaAnalyzer } from '../analyzers/schema-analyzer.js';
import { formatJSON, formatSchemaMarkdown } from '../utils/formatters.js';

export const schemaManagementTools: Tool[] = [
  {
    name: 'get_schema',
    description: 'Get database schema information',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        database: {
          type: 'string',
          description: 'Database name (optional, uses connection default if not provided)',
        },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'visualize_schema',
    description: 'Generate ER diagram in Mermaid format',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'analyze_foreign_keys',
    description: 'Analyze foreign key relationships and detect issues',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'generate_migration',
    description: 'Generate migration script between two schemas',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        sourceDatabase: {
          type: 'string',
          description: 'Source database name',
        },
        targetDatabase: {
          type: 'string',
          description: 'Target database name',
        },
        name: {
          type: 'string',
          description: 'Migration name',
        },
      },
      required: ['connectionId', 'sourceDatabase', 'targetDatabase', 'name'],
    },
  },
  {
    name: 'document_schema',
    description: 'Generate schema documentation in Markdown format',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
      },
      required: ['connectionId'],
    },
  },
];

export async function handleSchemaManagementTool(name: string, args: unknown): Promise<unknown> {
  const { connectionId } = args as { connectionId: string };
  const adapter = connectionManager.getConnection(connectionId);
  
  if (!adapter) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  const analyzer = new SchemaAnalyzer(adapter);

  switch (name) {
    case 'get_schema': {
      const { database } = args as { database?: string };
      const schema = await analyzer.getSchema(database);
      return {
        schema: formatJSON(schema),
        markdown: formatSchemaMarkdown(schema),
      };
    }

    case 'visualize_schema': {
      const { schema } = args as { schema?: string };
      const mermaid = await analyzer.visualizeSchema(schema);
      return {
        mermaid,
        format: 'mermaid',
        message: 'Use this Mermaid code in any Mermaid-compatible viewer',
      };
    }

    case 'analyze_foreign_keys': {
      const { schema } = args as { schema?: string };
      const analysis = await analyzer.analyzeForeignKeys(schema);
      return {
        foreignKeys: analysis.foreignKeys.map((fk) => ({
          name: fk.name,
          table: fk.table,
          columns: fk.columns,
          referencedTable: fk.referencedTable,
          referencedColumns: fk.referencedColumns,
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        })),
        issues: analysis.issues,
        issueCount: analysis.issues.length,
      };
    }

    case 'generate_migration': {
      const { sourceDatabase, targetDatabase, name } = args as {
        sourceDatabase: string;
        targetDatabase: string;
        name: string;
      };
      
      const sourceSchema = await analyzer.getSchema(sourceDatabase);
      const targetSchema = await analyzer.getSchema(targetDatabase);
      const migration = await analyzer.generateMigration(sourceSchema, targetSchema, name);
      
      return {
        migration: {
          id: migration.id,
          name: migration.name,
          up: migration.up,
          down: migration.down,
          description: migration.description,
          createdAt: migration.createdAt.toISOString(),
        },
      };
    }

    case 'document_schema': {
      const { schema } = args as { schema?: string };
      const documentation = await analyzer.documentSchema(schema);
      return {
        documentation,
        format: 'markdown',
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

