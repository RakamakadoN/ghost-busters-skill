/** Illustrative Supabase-like paginated read; adapt to your actual API/limits.
 * NOTE: offset paging under concurrent writes is not a consistent snapshot.
 * Use a keyset cursor/DB snapshot for exact reconciliations.
 */
type QueryResult<T> = { data: T[] | null; error: Error | null };
type Query<T> = { range: (from: number, to: number) => PromiseLike<QueryResult<T>> };
type OrderedQuery<T> = { order: (column: string, options: { ascending: true }) => Query<T> };

export async function readAllRows<T extends { id: string }>(
  table: OrderedQuery<T>,
  pageSize = 500,
  maxRows = 100_000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('Invalid pageSize');
  }
  const result: T[] = [];
  const ids = new Set<string>();
  for (let from = 0; from < maxRows; from += pageSize) {
    const requested = Math.min(pageSize, maxRows - from);
    const { data, error } = await table.order('id', { ascending: true })
      .range(from, from + requested - 1);
    if (error) throw error;
    if (!data) throw new Error('Missing rows response');
    for (const row of data) {
      if (ids.has(row.id)) throw new Error(`Duplicate row encountered: ${row.id}`);
      ids.add(row.id);
      result.push(row);
    }
    if (data.length > requested) throw new Error('Unexpected oversized page');
    if (data.length < requested) return result;
  }
  throw new Error('Maximum page budget reached: completeness not established');
}
