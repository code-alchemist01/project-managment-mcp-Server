import type { DatabaseAdapter } from '../database/base-adapter.js';
import type { Schema, Table, ForeignKey, Migration } from '../types/index.js';

export class SchemaAnalyzer {
  constructor(private adapter: DatabaseAdapter) {}

  async getSchema(database?: string): Promise<Schema> {
    return await this.adapter.getSchema(database);
  }

  async analyzeForeignKeys(schema?: string): Promise<{
    foreignKeys: ForeignKey[];
    issues: Array<{ severity: string; description: string; recommendation: string }>;
  }> {
    const schemaInfo = await this.adapter.getSchema(schema);
    const allForeignKeys: ForeignKey[] = [];
    const issues: Array<{ severity: string; description: string; recommendation: string }> = [];

    // Collect all foreign keys
    for (const table of schemaInfo.tables) {
      allForeignKeys.push(...table.foreignKeys);
    }

    // Analyze for issues
    for (const fk of allForeignKeys) {
      // Check for missing ON DELETE/UPDATE actions
      if (!fk.onDelete || fk.onDelete === 'NO ACTION') {
        issues.push({
          severity: 'medium',
          description: `Foreign key ${fk.name} has no ON DELETE action`,
          recommendation: 'Consider adding ON DELETE CASCADE or ON DELETE SET NULL',
        });
      }

      // Check for circular references
      const circularRef = this.detectCircularReference(fk, allForeignKeys);
      if (circularRef) {
        issues.push({
          severity: 'high',
          description: `Circular reference detected involving ${fk.name}`,
          recommendation: 'Review foreign key relationships to avoid circular dependencies',
        });
      }
    }

    return { foreignKeys: allForeignKeys, issues };
  }

  async visualizeSchema(schema?: string): Promise<string> {
    const schemaInfo = await this.adapter.getSchema(schema);
    
    // Generate Mermaid ER diagram
    let mermaid = 'erDiagram\n';
    
    // Add tables
    for (const table of schemaInfo.tables) {
      mermaid += `    ${table.name} {\n`;
      for (const column of table.columns) {
        const pk = table.primaryKey?.includes(column.name) ? ' PK' : '';
        const fk = table.foreignKeys.some((fk) => fk.columns.includes(column.name)) ? ' FK' : '';
        const nullable = column.nullable ? '' : ' "not null"';
        mermaid += `        ${column.type} ${column.name}${pk}${fk}${nullable}\n`;
      }
      mermaid += `    }\n`;
    }

    // Add relationships
    for (const table of schemaInfo.tables) {
      for (const fk of table.foreignKeys) {
        mermaid += `    ${table.name} ||--o{ ${fk.referencedTable} : "${fk.name}"\n`;
      }
    }

    return mermaid;
  }

  async generateMigration(
    sourceSchema: Schema,
    targetSchema: Schema,
    name: string
  ): Promise<Migration> {
    const upStatements: string[] = [];
    const downStatements: string[] = [];

    // Find new tables
    const sourceTableNames = new Set(sourceSchema.tables.map((t) => t.name));
    const targetTableNames = new Set(targetSchema.tables.map((t) => t.name));

    for (const table of targetSchema.tables) {
      if (!sourceTableNames.has(table.name)) {
        upStatements.push(this.generateCreateTableStatement(table));
        downStatements.push(`DROP TABLE IF EXISTS ${this.escapeIdentifier(table.name)};`);
      }
    }

    // Find dropped tables
    for (const table of sourceSchema.tables) {
      if (!targetTableNames.has(table.name)) {
        upStatements.push(`DROP TABLE IF EXISTS ${this.escapeIdentifier(table.name)};`);
        downStatements.push(this.generateCreateTableStatement(table));
      }
    }

    // Find modified tables
    for (const targetTable of targetSchema.tables) {
      const sourceTable = sourceSchema.tables.find((t) => t.name === targetTable.name);
      if (sourceTable) {
        const tableChanges = this.compareTables(sourceTable, targetTable);
        upStatements.push(...tableChanges.up);
        downStatements.push(...tableChanges.down);
      }
    }

    return {
      id: `migration_${Date.now()}`,
      name,
      up: upStatements.join('\n\n'),
      down: downStatements.reverse().join('\n\n'),
      description: `Migration from ${sourceSchema.database} to ${targetSchema.database}`,
      createdAt: new Date(),
    };
  }

  async documentSchema(schema?: string): Promise<string> {
    const schemaInfo = await this.adapter.getSchema(schema);
    let doc = `# Database Schema Documentation\n\n`;
    doc += `**Database:** ${schemaInfo.database}\n\n`;
    doc += `**Generated:** ${new Date().toISOString()}\n\n`;

    doc += `## Tables\n\n`;
    for (const table of schemaInfo.tables) {
      doc += `### ${table.name}\n\n`;
      doc += `**Type:** ${table.type}\n\n`;
      if (table.schema) {
        doc += `**Schema:** ${table.schema}\n\n`;
      }
      if (table.rowCount !== undefined) {
        doc += `**Row Count:** ${table.rowCount.toLocaleString()}\n\n`;
      }

      doc += `#### Columns\n\n`;
      doc += `| Name | Type | Nullable | Default | Primary Key |\n`;
      doc += `|------|------|----------|---------|-------------|\n`;
      for (const column of table.columns) {
        doc += `| ${column.name} | ${column.type} | ${column.nullable ? 'Yes' : 'No'} | ${column.defaultValue || '-'} | ${table.primaryKey?.includes(column.name) ? 'Yes' : 'No'} |\n`;
      }

      if (table.foreignKeys.length > 0) {
        doc += `\n#### Foreign Keys\n\n`;
        for (const fk of table.foreignKeys) {
          doc += `- **${fk.name}**: ${fk.columns.join(', ')} → ${fk.referencedTable}(${fk.referencedColumns.join(', ')})\n`;
        }
      }

      if (table.indexes.length > 0) {
        doc += `\n#### Indexes\n\n`;
        for (const index of table.indexes) {
          doc += `- **${index.name}**: ${index.columns.join(', ')} ${index.unique ? '(unique)' : ''}\n`;
        }
      }

      doc += `\n---\n\n`;
    }

    if (schemaInfo.views.length > 0) {
      doc += `## Views\n\n`;
      for (const view of schemaInfo.views) {
        doc += `### ${view.name}\n\n`;
        doc += `**Type:** ${view.type}\n\n`;
      }
    }

    return doc;
  }

  private detectCircularReference(fk: ForeignKey, allForeignKeys: ForeignKey[]): boolean {
    const visited = new Set<string>();
    const stack = [fk.referencedTable];

    while (stack.length > 0) {
      const currentTable = stack.pop()!;
      if (visited.has(currentTable)) {
        return true; // Circular reference detected
      }
      visited.add(currentTable);

      const referencingFks = allForeignKeys.filter((f) => f.table === currentTable);
      for (const refFk of referencingFks) {
        stack.push(refFk.referencedTable);
      }
    }

    return false;
  }

  private generateCreateTableStatement(table: Table): string {
    let sql = `CREATE TABLE ${this.escapeIdentifier(table.name)} (\n`;
    const columns: string[] = [];

    for (const column of table.columns) {
      let colDef = `  ${this.escapeIdentifier(column.name)} ${column.type}`;
      if (!column.nullable) {
        colDef += ' NOT NULL';
      }
      if (column.defaultValue) {
        colDef += ` DEFAULT ${column.defaultValue}`;
      }
      columns.push(colDef);
    }

    if (table.primaryKey && table.primaryKey.length > 0) {
      columns.push(`  PRIMARY KEY (${table.primaryKey.map((c) => this.escapeIdentifier(c)).join(', ')})`);
    }

    sql += columns.join(',\n');
    sql += '\n);';

    // Add indexes
    for (const index of table.indexes) {
      if (!index.columns.some((c) => table.primaryKey?.includes(c))) {
        sql += `\nCREATE INDEX ${this.escapeIdentifier(index.name)} ON ${this.escapeIdentifier(table.name)} (${index.columns.map((c) => this.escapeIdentifier(c)).join(', ')});`;
      }
    }

    // Add foreign keys
    for (const fk of table.foreignKeys) {
      sql += `\nALTER TABLE ${this.escapeIdentifier(table.name)} ADD CONSTRAINT ${this.escapeIdentifier(fk.name)} `;
      sql += `FOREIGN KEY (${fk.columns.map((c) => this.escapeIdentifier(c)).join(', ')}) `;
      sql += `REFERENCES ${this.escapeIdentifier(fk.referencedTable)} (${fk.referencedColumns.map((c) => this.escapeIdentifier(c)).join(', ')})`;
      if (fk.onDelete) {
        sql += ` ON DELETE ${fk.onDelete}`;
      }
      if (fk.onUpdate) {
        sql += ` ON UPDATE ${fk.onUpdate}`;
      }
      sql += ';';
    }

    return sql;
  }

  private compareTables(source: Table, target: Table): { up: string[]; down: string[] } {
    const up: string[] = [];
    const down: string[] = [];

    // Compare columns
    const sourceColumns = new Map(source.columns.map((c) => [c.name, c]));
    const targetColumns = new Map(target.columns.map((c) => [c.name, c]));

    // New columns
    for (const [name, column] of targetColumns) {
      if (!sourceColumns.has(name)) {
        up.push(`ALTER TABLE ${this.escapeIdentifier(target.name)} ADD COLUMN ${this.escapeIdentifier(column.name)} ${column.type}${column.nullable ? '' : ' NOT NULL'};`);
        down.push(`ALTER TABLE ${this.escapeIdentifier(target.name)} DROP COLUMN ${this.escapeIdentifier(column.name)};`);
      }
    }

    // Dropped columns
    for (const [name] of sourceColumns) {
      if (!targetColumns.has(name)) {
        up.push(`ALTER TABLE ${this.escapeIdentifier(target.name)} DROP COLUMN ${this.escapeIdentifier(name)};`);
        // Note: We can't restore dropped columns without data backup
        down.push(`-- Column ${name} was dropped and cannot be automatically restored`);
      }
    }

    return { up, down };
  }

  private escapeIdentifier(identifier: string): string {
    // Basic escaping - adapters should handle this properly
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

