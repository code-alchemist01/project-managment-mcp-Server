import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { connectionTools, handleConnectionTool } from './tools/connection.js';
import { queryAnalysisTools, handleQueryAnalysisTool } from './tools/query-analysis.js';
import { schemaManagementTools, handleSchemaManagementTool } from './tools/schema-management.js';
import { dataAnalysisTools, handleDataAnalysisTool } from './tools/data-analysis.js';
import { backupRestoreTools, handleBackupRestoreTool } from './tools/backup-restore.js';
import { securityTools, handleSecurityTool } from './tools/security.js';

// Combine all tools
const allTools = [
  ...connectionTools,
  ...queryAnalysisTools,
  ...schemaManagementTools,
  ...dataAnalysisTools,
  ...backupRestoreTools,
  ...securityTools,
];

export class DatabaseMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-database-manager',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: allTools,
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: unknown;

        // Route to appropriate handler
        if (connectionTools.some((t) => t.name === name)) {
          result = await handleConnectionTool(name, args || {});
        } else if (queryAnalysisTools.some((t) => t.name === name)) {
          result = await handleQueryAnalysisTool(name, args || {});
        } else if (schemaManagementTools.some((t) => t.name === name)) {
          result = await handleSchemaManagementTool(name, args || {});
        } else if (dataAnalysisTools.some((t) => t.name === name)) {
          result = await handleDataAnalysisTool(name, args || {});
        } else if (backupRestoreTools.some((t) => t.name === name)) {
          result = await handleBackupRestoreTool(name, args || {});
        } else if (securityTools.some((t) => t.name === name)) {
          result = await handleSecurityTool(name, args || {});
        } else {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`,
          {
            stack: errorStack,
          }
        );
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Database Manager server running on stdio');
  }
}

