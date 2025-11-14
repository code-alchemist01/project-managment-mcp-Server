import type { DatabaseAdapter } from '../database/base-adapter.js';
import type {
  PermissionAnalysis,
  UserPermission,
  RolePermission,
  PermissionIssue,
  Vulnerability,
  SensitiveData,
} from '../types/index.js';

export class SecurityAnalyzer {
  private readonly sensitivePatterns = {
    pii: [
      /\b(ssn|social\s*security|tax\s*id|ein)\b/i,
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
      /\b\d{2}-\d{7}\b/, // EIN format
    ],
    credit_card: [
      /\b(credit\s*card|card\s*number|cc\s*number)\b/i,
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card format
      /\b\d{13,19}\b/, // Potential card number
    ],
    email: [
      /\b(email|e-mail|mail)\b/i,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    ],
    phone: [
      /\b(phone|mobile|cell|telephone)\b/i,
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
      /\b\(\d{3}\)\s?\d{3}-\d{4}\b/,
    ],
    password: [
      /\b(password|pwd|pass|secret)\b/i,
    ],
  };

  constructor(private adapter: DatabaseAdapter) {}

  async analyzePermissions(database?: string): Promise<PermissionAnalysis> {
    // This is database-specific and would need to be implemented per adapter
    // For now, return a basic structure
    const users: UserPermission[] = [];
    const roles: RolePermission[] = [];
    const issues: PermissionIssue[] = [];

    try {
      // Try to get user permissions (database-specific queries)
      const permissionsQuery = this.getPermissionsQuery();
      if (permissionsQuery) {
        await this.adapter.executeQuery(permissionsQuery);
        // Parse results based on database type
        // This is a simplified version
      }
    } catch (error) {
      issues.push({
        severity: 'medium',
        type: 'missing',
        description: 'Could not retrieve permission information',
        recommendation: 'Ensure proper database access to query permissions',
      });
    }

    return {
      database: database || 'default',
      users,
      roles,
      issues,
    };
  }

  async detectVulnerabilities(database?: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    // Check for SQL injection patterns in stored procedures/functions
    try {
      const schema = await this.adapter.getSchema(database);
      
      // Check for potential SQL injection in views
      for (const view of schema.views) {
        vulnerabilities.push({
          id: `vuln_${view.name}_${Date.now()}`,
          type: 'sql_injection',
          severity: 'medium',
          description: `View ${view.name} may contain dynamic SQL`,
          recommendation: 'Review view definition for SQL injection risks',
          detectedAt: new Date(),
        });
      }

      // Check for weak passwords (would need user table access)
      // Check for excessive permissions
      const permissions = await this.analyzePermissions(database);
      for (const issue of permissions.issues) {
        if (issue.type === 'excessive') {
          vulnerabilities.push({
            id: `vuln_permission_${Date.now()}`,
            type: 'excessive_permissions',
            severity: issue.severity === 'high' ? 'high' : 'medium',
            description: issue.description,
            recommendation: issue.recommendation,
            detectedAt: new Date(),
          });
        }
      }

      // Check for unencrypted connections
      const config = this.adapter.getConfig();
      if (!config.connectionString?.includes('ssl') && 
          !config.connectionString?.includes('encrypt') &&
          config.type !== 'sqlite') {
        vulnerabilities.push({
          id: `vuln_connection_${Date.now()}`,
          type: 'unencrypted_connection',
          severity: 'high',
          description: 'Database connection may not be encrypted',
          recommendation: 'Use SSL/TLS for database connections',
          detectedAt: new Date(),
        });
      }
    } catch (error) {
      // Ignore errors
    }

    return vulnerabilities;
  }

  async findSensitiveData(
    tableName: string,
    schema?: string,
    sampleSize: number = 100
  ): Promise<SensitiveData[]> {
    const sensitiveData: SensitiveData[] = [];
    const tables = await this.adapter.getTables(schema);
    const table = tables.find((t) => t.name === tableName && (!schema || t.schema === schema));

    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }

    // Sample data from table
    const sampleQuery = `SELECT * FROM ${this.escapeIdentifier(tableName)} LIMIT ${sampleSize}`;
    const result = await this.adapter.executeQuery(sampleQuery);

    // Check each column
    for (const column of table.columns) {
      const columnData = result.rows.map((row) => row[column.name] as string).filter(Boolean);

      for (const [type, patterns] of Object.entries(this.sensitivePatterns)) {
        for (const pattern of patterns) {
          const matches = columnData.filter((value) => 
            typeof value === 'string' && pattern.test(value)
          );

          if (matches.length > 0) {
            const confidence = (matches.length / columnData.length) * 100;
            if (confidence > 10) { // At least 10% match
              sensitiveData.push({
                table: tableName,
                column: column.name,
                type: type as SensitiveData['type'],
                confidence: Math.min(100, confidence),
                sampleValues: matches.slice(0, 5),
                rowCount: table.rowCount,
                recommendation: `Consider encrypting or masking ${column.name} column`,
              });
              break; // Found a match, move to next column
            }
          }
        }
      }
    }

    return sensitiveData;
  }

  async detectSQLInjection(query: string): Promise<boolean> {
    const dangerousPatterns = [
      /;\s*(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE)/i,
      /UNION\s+SELECT/i,
      /--/,
      /\/\*/,
      /xp_cmdshell/i,
      /EXEC\s*\(/i,
      /EXECUTE\s*\(/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return true;
      }
    }

    return false;
  }

  private getPermissionsQuery(): string | null {
    // Database-specific permission queries
    const config = this.adapter.getConfig();
    
    switch (config.type) {
      case 'postgresql':
        return `
          SELECT 
            grantee as user,
            table_schema as schema,
            table_name as table,
            privilege_type as privilege
          FROM information_schema.role_table_grants
          WHERE grantee != 'PUBLIC';
        `;
      case 'mysql':
        return `
          SELECT 
            User as user,
            Host as host,
            Select_priv as select_priv,
            Insert_priv as insert_priv,
            Update_priv as update_priv,
            Delete_priv as delete_priv
          FROM mysql.user;
        `;
      default:
        return null;
    }
  }

  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

