import type { DatabaseAdapter } from '../database/base-adapter.js';
import type {
  QueryAnalysisResult,
  ExecutionPlan,
  IndexSuggestion,
  SlowQuery,
} from '../types/index.js';

export class QueryAnalyzer {
  constructor(private adapter: DatabaseAdapter) {}

  async analyzeQuery(query: string, params?: unknown[]): Promise<QueryAnalysisResult> {
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Basic query validation
    this.validateQuery(query, warnings);

    // Execute query and measure performance
    let executionTime: number | undefined;
    let rowsAffected: number | undefined;
    let plan: ExecutionPlan | null = null;

    try {
      const result = await this.adapter.executeQuery(query, params);
      executionTime = result.executionTime;
      rowsAffected = result.rowCount;

      // Get execution plan if supported
      if (this.adapter.getCapabilities().supportsExplain) {
        plan = await this.adapter.explainQuery(query, params);
      }
    } catch (error) {
      warnings.push(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Analyze query patterns
    this.analyzeQueryPatterns(query, warnings, suggestions);

    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(executionTime, plan);

    return {
      query,
      executionTime,
      rowsAffected,
      plan: plan || undefined,
      warnings,
      suggestions,
      performanceScore,
    };
  }

  async explainQuery(query: string, params?: unknown[]): Promise<ExecutionPlan | null> {
    if (!this.adapter.getCapabilities().supportsExplain) {
      return null;
    }

    return await this.adapter.explainQuery(query, params);
  }

  async optimizeQuery(query: string, params?: unknown[]): Promise<string[]> {
    const suggestions: string[] = [];
    const plan = await this.explainQuery(query, params);

    if (plan) {
      // Analyze execution plan for optimization opportunities
      this.analyzePlanForOptimization(plan, suggestions);
    }

    // Check for common anti-patterns
    this.checkAntiPatterns(query, suggestions);

    // Suggest indexes
    const indexSuggestions = await this.suggestIndexes(query);
    suggestions.push(...indexSuggestions.map((idx) => 
      `Consider adding index: ${idx.type} index on ${idx.table}(${idx.columns.join(', ')})`
    ));

    return suggestions;
  }

  async suggestIndexes(query: string): Promise<IndexSuggestion[]> {
    const suggestions: IndexSuggestion[] = [];
    
    // Extract table and column references from query
    const tableMatches = query.matchAll(/(?:FROM|JOIN|UPDATE)\s+(\w+)/gi);
    const columnMatches = query.matchAll(/(?:WHERE|ON)\s+(\w+)\.(\w+)\s*[=<>]/gi);

    const tables = new Set<string>();
    for (const match of tableMatches) {
      tables.add(match[1] || '');
    }

    const columnMap = new Map<string, Set<string>>();
    for (const match of columnMatches) {
      const table = match[1] || '';
      const column = match[2] || '';
      if (!columnMap.has(table)) {
        columnMap.set(table, new Set());
      }
      columnMap.get(table)!.add(column);
    }

    // Generate index suggestions
    for (const [table, columns] of columnMap) {
      if (columns.size > 0) {
        suggestions.push({
          table,
          columns: Array.from(columns),
          type: 'btree',
          reason: 'Used in WHERE/ON clauses',
          estimatedImprovement: 'High',
        });
      }
    }

    return suggestions;
  }

  async detectSlowQueries(_thresholdMs: number = 1000): Promise<SlowQuery[]> {
    // This would typically query database slow query logs
    // For now, return empty array as implementation depends on database type
    // In production, this would query:
    // - PostgreSQL: pg_stat_statements
    // - MySQL: slow_query_log
    // - SQL Server: sys.dm_exec_query_stats
    return [];
  }

  private validateQuery(query: string, warnings: string[]): void {
    // Check for SQL injection patterns
    if (query.includes('--') || query.includes('/*')) {
      warnings.push('Query contains comment syntax - ensure proper sanitization');
    }

    // Check for dangerous operations
    const dangerousOps = ['DROP', 'TRUNCATE', 'DELETE FROM', 'ALTER TABLE'];
    for (const op of dangerousOps) {
      if (query.toUpperCase().includes(op)) {
        warnings.push(`Query contains potentially dangerous operation: ${op}`);
      }
    }

    // Check query length
    if (query.length > 10000) {
      warnings.push('Query is very long - consider breaking into smaller queries');
    }
  }

  private analyzeQueryPatterns(query: string, warnings: string[], suggestions: string[]): void {
    const upperQuery = query.toUpperCase();

    // Check for SELECT *
    if (upperQuery.includes('SELECT *')) {
      suggestions.push('Consider selecting specific columns instead of *');
    }

    // Check for missing WHERE in UPDATE/DELETE
    if ((upperQuery.includes('UPDATE') || upperQuery.includes('DELETE')) && !upperQuery.includes('WHERE')) {
      warnings.push('UPDATE/DELETE without WHERE clause - this affects all rows!');
    }

    // Check for N+1 query pattern
    if (upperQuery.split('SELECT').length > 5) {
      suggestions.push('Multiple SELECT statements detected - consider using JOINs or subqueries');
    }

    // Check for missing LIMIT
    if (upperQuery.includes('SELECT') && !upperQuery.includes('LIMIT') && !upperQuery.includes('TOP')) {
      suggestions.push('Consider adding LIMIT to prevent large result sets');
    }
  }

  private analyzePlanForOptimization(plan: ExecutionPlan, suggestions: string[]): void {
    if (!plan.operations || plan.operations.length === 0) {
      return;
    }

    // Check for sequential scans
    const hasSeqScan = plan.operations.some((op) => 
      op.type.toLowerCase().includes('seq') || op.type.toLowerCase().includes('scan')
    );
    if (hasSeqScan) {
      suggestions.push('Sequential scan detected - consider adding indexes');
    }

    // Check for high cost operations
    const highCostOps = plan.operations.filter((op) => op.cost > 1000);
    if (highCostOps.length > 0) {
      suggestions.push(`High cost operations detected (${highCostOps.length}) - review query structure`);
    }

    // Check for nested loops
    const hasNestedLoop = plan.operations.some((op) => 
      op.type.toLowerCase().includes('nested') || op.type.toLowerCase().includes('loop')
    );
    if (hasNestedLoop) {
      suggestions.push('Nested loop detected - consider using hash joins or merge joins');
    }
  }

  private checkAntiPatterns(query: string, suggestions: string[]): void {
    const upperQuery = query.toUpperCase();

    // LIKE without index
    if (upperQuery.includes('LIKE') && upperQuery.includes('%')) {
      suggestions.push('LIKE with leading % cannot use indexes - consider full-text search');
    }

    // Functions in WHERE clause
    if (upperQuery.match(/WHERE\s+\w+\s*\(/)) {
      suggestions.push('Functions in WHERE clause prevent index usage - consider computed columns');
    }

    // OR conditions
    if (upperQuery.match(/WHERE.*\sOR\s/i)) {
      suggestions.push('Multiple OR conditions may prevent index usage - consider UNION');
    }

    // Subqueries in SELECT
    if (upperQuery.match(/SELECT\s+\(.*SELECT/i)) {
      suggestions.push('Correlated subqueries in SELECT - consider JOINs');
    }
  }

  private calculatePerformanceScore(executionTime?: number, plan?: ExecutionPlan | null): number {
    let score = 100;

    // Penalize slow queries
    if (executionTime) {
      if (executionTime > 5000) score -= 50;
      else if (executionTime > 1000) score -= 30;
      else if (executionTime > 500) score -= 15;
      else if (executionTime > 100) score -= 5;
    }

    // Penalize high cost plans
    if (plan?.operations) {
      const totalCost = plan.operations.reduce((sum, op) => sum + op.cost, 0);
      if (totalCost > 10000) score -= 30;
      else if (totalCost > 1000) score -= 15;
      else if (totalCost > 100) score -= 5;
    }

    return Math.max(0, score);
  }
}

