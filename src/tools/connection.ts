import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { connectionManager } from '../utils/connection-manager.js';
import type { ConnectionConfig } from '../types/index.js';

export const connectionTools: Tool[] = [
  {
    name: 'connect_database',
    description: 'Connect to a database using connection string or individual parameters',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['postgresql', 'mysql', 'sqlite', 'mssql', 'mongodb', 'redis'],
          description: 'Database type',
        },
        connectionString: {
          type: 'string',
          description: 'Full connection string (optional if individual params provided)',
        },
        host: {
          type: 'string',
          description: 'Database host',
        },
        port: {
          type: 'number',
          description: 'Database port',
        },
        database: {
          type: 'string',
          description: 'Database name',
        },
        username: {
          type: 'string',
          description: 'Username',
        },
        password: {
          type: 'string',
          description: 'Password',
        },
        readOnly: {
          type: 'boolean',
          description: 'Open connection in read-only mode',
          default: false,
        },
        id: {
          type: 'string',
          description: 'Optional connection ID (auto-generated if not provided)',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'list_connections',
    description: 'List all active database connections',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'disconnect_database',
    description: 'Disconnect from a database',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'Connection ID to disconnect',
        },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'test_connection',
    description: 'Test a database connection without creating a persistent connection',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['postgresql', 'mysql', 'sqlite', 'mssql', 'mongodb', 'redis'],
          description: 'Database type',
        },
        connectionString: {
          type: 'string',
          description: 'Full connection string',
        },
        host: {
          type: 'string',
          description: 'Database host',
        },
        port: {
          type: 'number',
          description: 'Database port',
        },
        database: {
          type: 'string',
          description: 'Database name',
        },
        username: {
          type: 'string',
          description: 'Username',
        },
        password: {
          type: 'string',
          description: 'Password',
        },
      },
      required: ['type'],
    },
  },
];

export async function handleConnectionTool(name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case 'connect_database': {
      const config = args as ConnectionConfig;
      const connectionId = await connectionManager.createConnection(config);
      return {
        connectionId,
        status: 'connected',
        message: `Successfully connected to ${config.type} database`,
      };
    }

    case 'list_connections': {
      const connections = connectionManager.listConnections();
      return {
        connections: connections.map((conn) => ({
          id: conn.id,
          type: conn.type,
          status: conn.status,
          connectedAt: conn.connectedAt?.toISOString(),
          lastUsed: conn.lastUsed?.toISOString(),
        })),
      };
    }

    case 'disconnect_database': {
      const { connectionId } = args as { connectionId: string };
      await connectionManager.disconnect(connectionId);
      return {
        connectionId,
        status: 'disconnected',
        message: 'Successfully disconnected',
      };
    }

    case 'test_connection': {
      const config = args as ConnectionConfig;
      const isValid = await connectionManager.testConnection(config);
      return {
        valid: isValid,
        message: isValid ? 'Connection test successful' : 'Connection test failed',
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

