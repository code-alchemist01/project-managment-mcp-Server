// Database Types
export type DatabaseType =
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'mssql'
  | 'mongodb'
  | 'redis'
  | 'cassandra';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface ConnectionConfig {
  id?: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  connectionString?: string;
  options?: Record<string, unknown>;
  readOnly?: boolean;
  timeout?: number;
  poolSize?: number;
}

export interface ConnectionInfo {
  id: string;
  type: DatabaseType;
  status: ConnectionStatus;
  connectedAt?: Date;
  lastUsed?: Date;
  config: ConnectionConfig;
}

// Query Analysis Types
export interface QueryAnalysisResult {
  query: string;
  executionTime?: number;
  rowsAffected?: number;
  plan?: ExecutionPlan;
  warnings: string[];
  suggestions: string[];
  performanceScore?: number;
}

export interface ExecutionPlan {
  plan: string | Record<string, unknown>;
  cost?: number;
  executionTime?: number;
  rows?: number;
  operations: PlanOperation[];
}

export interface PlanOperation {
  type: string;
  cost: number;
  rows: number;
  description: string;
  children?: PlanOperation[];
}

export interface IndexSuggestion {
  table: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist' | 'brin';
  reason: string;
  estimatedImprovement?: string;
}

export interface SlowQuery {
  query: string;
  executionTime: number;
  timestamp: Date;
  frequency?: number;
  table?: string;
}

// Schema Types
export interface Table {
  name: string;
  schema?: string;
  type: 'table' | 'view' | 'materialized_view';
  columns: Column[];
  primaryKey?: string[];
  indexes: Index[];
  foreignKeys: ForeignKey[];
  constraints: Constraint[];
  rowCount?: number;
  size?: number;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string | null;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isIndexed?: boolean;
  comment?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface Index {
  name: string;
  columns: string[];
  unique: boolean;
  type?: string;
  method?: string;
}

export interface ForeignKey {
  name: string;
  table: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface Constraint {
  name: string;
  type: 'check' | 'unique' | 'not_null' | 'default';
  definition?: string;
  columns?: string[];
}

export interface Schema {
  database: string;
  tables: Table[];
  views: Table[];
  functions?: Function[];
  procedures?: Procedure[];
}

export interface Function {
  name: string;
  schema?: string;
  returnType: string;
  parameters: Parameter[];
  definition?: string;
}

export interface Procedure {
  name: string;
  schema?: string;
  parameters: Parameter[];
  definition?: string;
}

export interface Parameter {
  name: string;
  type: string;
  mode?: 'in' | 'out' | 'inout';
  defaultValue?: string;
}

// Data Analysis Types
export interface TableStats {
  table: string;
  rowCount: number;
  size: number;
  columnStats: ColumnStat[];
  lastAnalyzed?: Date;
}

export interface ColumnStat {
  column: string;
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  uniquePercentage: number;
  minValue?: string | number;
  maxValue?: string | number;
  avgValue?: number;
  distinctValues?: number;
  topValues?: Array<{ value: string | number; count: number }>;
}

export interface DataQualityReport {
  table: string;
  overallScore: number;
  issues: DataQualityIssue[];
  recommendations: string[];
}

export interface DataQualityIssue {
  type: 'missing' | 'duplicate' | 'inconsistent' | 'invalid' | 'outlier';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedRows: number;
  affectedColumns?: string[];
  examples?: Array<Record<string, unknown>>;
}

export interface DuplicateResult {
  table: string;
  columns: string[];
  duplicateCount: number;
  totalRows: number;
  duplicates: Array<Record<string, unknown>>;
  sampleSize?: number;
}

// Backup/Restore Types
export interface BackupInfo {
  id: string;
  database: string;
  type: DatabaseType;
  createdAt: Date;
  size: number;
  path: string;
  format: 'sql' | 'dump' | 'custom';
  compressed: boolean;
  verified: boolean;
  metadata?: Record<string, unknown>;
}

export interface RestoreOptions {
  backupId: string;
  targetDatabase?: string;
  dropExisting?: boolean;
  createDatabase?: boolean;
  verifyOnly?: boolean;
}

// Security Types
export interface PermissionAnalysis {
  database: string;
  users: UserPermission[];
  roles: RolePermission[];
  issues: PermissionIssue[];
}

export interface UserPermission {
  username: string;
  privileges: Privilege[];
  tables: TablePermission[];
  databases: string[];
}

export interface RolePermission {
  role: string;
  privileges: Privilege[];
  members: string[];
}

export interface Privilege {
  type: 'select' | 'insert' | 'update' | 'delete' | 'create' | 'drop' | 'alter' | 'execute' | 'all';
  object: string;
  granted: boolean;
  grantable: boolean;
}

export interface TablePermission {
  table: string;
  privileges: Privilege[];
}

export interface PermissionIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'excessive' | 'missing' | 'insecure';
  description: string;
  recommendation: string;
}

export interface Vulnerability {
  id: string;
  type: 'sql_injection' | 'weak_password' | 'excessive_permissions' | 'unencrypted_connection' | 'missing_index' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedObjects?: string[];
  recommendation: string;
  detectedAt: Date;
}

export interface SensitiveData {
  table: string;
  column: string;
  type: 'pii' | 'credit_card' | 'ssn' | 'email' | 'phone' | 'password' | 'other';
  confidence: number;
  sampleValues?: string[];
  rowCount?: number;
  recommendation?: string;
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  user: string;
  action: string;
  object: string;
  success: boolean;
  ipAddress?: string;
  details?: Record<string, unknown>;
}

// Migration Types
export interface Migration {
  id: string;
  name: string;
  up: string;
  down: string;
  description?: string;
  createdAt: Date;
}

// Report Types
export interface Report {
  id: string;
  type: 'data_quality' | 'performance' | 'security' | 'schema' | 'custom';
  title: string;
  content: string;
  format: 'markdown' | 'json' | 'csv' | 'html';
  generatedAt: Date;
  metadata?: Record<string, unknown>;
}

// Error Types
export interface DatabaseError {
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: number;
  internalPosition?: number;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
}

// Adapter Types
export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  columns?: Array<{ name: string; type: string }>;
  executionTime?: number;
}

export interface AdapterCapabilities {
  supportsTransactions: boolean;
  supportsSchemas: boolean;
  supportsIndexes: boolean;
  supportsForeignKeys: boolean;
  supportsViews: boolean;
  supportsFunctions: boolean;
  supportsProcedures: boolean;
  supportsExplain: boolean;
  supportsBackup: boolean;
}

