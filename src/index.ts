import { DatabaseMCPServer } from './server.js';
import { connectionManager } from './utils/connection-manager.js';

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down...');
  await connectionManager.disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down...');
  await connectionManager.disconnectAll();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
async function main() {
  const server = new DatabaseMCPServer();
  await server.run();
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

