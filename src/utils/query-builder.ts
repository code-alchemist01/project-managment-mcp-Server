export class QueryBuilder {
  private query: string = '';
  private params: unknown[] = [];

  select(columns: string | string[]): this {
    const cols = Array.isArray(columns) ? columns.join(', ') : columns;
    this.query = `SELECT ${cols}`;
    return this;
  }

  from(table: string, schema?: string): this {
    const tableName = schema ? `${this.escapeIdentifier(schema)}.${this.escapeIdentifier(table)}` : this.escapeIdentifier(table);
    this.query += ` FROM ${tableName}`;
    return this;
  }

  where(condition: string, value?: unknown): this {
    if (this.query.includes('WHERE')) {
      this.query += ` AND ${condition}`;
    } else {
      this.query += ` WHERE ${condition}`;
    }
    
    if (value !== undefined) {
      this.params.push(value);
      const paramIndex = this.params.length;
      this.query = this.query.replace(condition, `${condition} = $${paramIndex}`);
    }
    
    return this;
  }

  whereIn(column: string, values: unknown[]): this {
    const placeholders = values.map((_, i) => {
      this.params.push(values[i]);
      return `$${this.params.length}`;
    }).join(', ');
    
    const condition = `${this.escapeIdentifier(column)} IN (${placeholders})`;
    if (this.query.includes('WHERE')) {
      this.query += ` AND ${condition}`;
    } else {
      this.query += ` WHERE ${condition}`;
    }
    
    return this;
  }

  join(table: string, on: string, type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' = 'INNER'): this {
    this.query += ` ${type} JOIN ${this.escapeIdentifier(table)} ON ${on}`;
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    if (this.query.includes('ORDER BY')) {
      this.query += `, ${this.escapeIdentifier(column)} ${direction}`;
    } else {
      this.query += ` ORDER BY ${this.escapeIdentifier(column)} ${direction}`;
    }
    return this;
  }

  limit(count: number): this {
    this.query += ` LIMIT ${count}`;
    return this;
  }

  offset(count: number): this {
    this.query += ` OFFSET ${count}`;
    return this;
  }

  groupBy(columns: string | string[]): this {
    const cols = Array.isArray(columns) ? columns.map((c) => this.escapeIdentifier(c)).join(', ') : this.escapeIdentifier(columns);
    this.query += ` GROUP BY ${cols}`;
    return this;
  }

  having(condition: string): this {
    this.query += ` HAVING ${condition}`;
    return this;
  }

  build(): { query: string; params: unknown[] } {
    return {
      query: this.query,
      params: this.params,
    };
  }

  reset(): this {
    this.query = '';
    this.params = [];
    return this;
  }

  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

// Helper function to sanitize query parameters
export function sanitizeQuery(query: string): string {
  // Remove comments
  let sanitized = query.replace(/--.*$/gm, '');
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

// Helper function to detect potentially dangerous queries
export function isDangerousQuery(query: string): boolean {
  const upperQuery = query.toUpperCase();
  const dangerousOps = ['DROP', 'TRUNCATE', 'DELETE FROM', 'ALTER TABLE', 'CREATE TABLE', 'DROP TABLE'];
  
  for (const op of dangerousOps) {
    if (upperQuery.includes(op)) {
      return true;
    }
  }
  
  return false;
}

// Helper function to validate parameter count
export function validateParameters(query: string, params: unknown[]): boolean {
  const paramMatches = query.match(/\$\d+/g) || [];
  const maxParam = paramMatches.reduce((max, match) => {
    const num = parseInt(match.slice(1), 10);
    return Math.max(max, num);
  }, 0);
  
  return params.length >= maxParam;
}

