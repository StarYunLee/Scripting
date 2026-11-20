export interface ShelfRow<T> {
  key: string;
  items: readonly T[];
}

/** Chronological rows. Existing full rows never move when more items append;
 * the final partial row only gains its missing trailing items.
 */
export function buildShelfRows<T extends { id: string }>(
  items: readonly T[],
  columns = 3,
): ShelfRow<T>[] {
  const safeColumns = Math.max(1, Math.trunc(columns));
  const rows: ShelfRow<T>[] = [];
  for (let start = 0; start < items.length; start += safeColumns) {
    const row = items.slice(start, start + safeColumns);
    rows.push({ key: `shelf-${row[0].id}`, items: row });
  }
  return rows;
}
