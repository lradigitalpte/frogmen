const IDENT = /^[a-z_][a-z0-9_]*$/i;

export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export type ForeignKeyEdge = {
  fromTable: string;
  toTable: string;
};

/**
 * Deletion order for tenant tables: a table can be deleted only after every
 * table that still references it has been removed. Self-references are ignored
 * because a single DELETE ... WHERE organization_id = $1 removes the whole set.
 */
export function sortTablesForDeletion(
  tables: string[],
  foreignKeys: ForeignKeyEdge[],
): string[] {
  const tableSet = new Set(tables);
  const remaining = new Set(tables);
  const referencedBy = new Map<string, Set<string>>();

  for (const table of tables) {
    referencedBy.set(table, new Set());
  }

  for (const edge of foreignKeys) {
    if (edge.fromTable === edge.toTable) continue;
    if (!tableSet.has(edge.fromTable) || !tableSet.has(edge.toTable)) continue;
    referencedBy.get(edge.toTable)?.add(edge.fromTable);
  }

  const ordered: string[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((table) =>
        [...(referencedBy.get(table) ?? [])].every((from) => !remaining.has(from)),
      )
      .sort();

    if (ready.length === 0) {
      ordered.push(...[...remaining].sort());
      break;
    }

    for (const table of ready) {
      remaining.delete(table);
      ordered.push(table);
    }
  }

  return ordered;
}
