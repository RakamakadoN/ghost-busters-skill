// Synthetic Supabase read with an implicit API row cap.
type Row = { id: string };
type Page = { data: Row[] | null, error: unknown };
type Db = {
  from(table: string): {
    select(columns: string): Promise<Page>
  }
};

export async function listAllOrders(db: Db): Promise<Row[]> {
  const res = await db.from('orders').select('id');
  if (res.error || !res.data) throw new Error('could not read');
  // A single response may be capped to fewer rows than the business needs.
  // The caller is incorrectly claiming this is the full inventory.
  return res.data;
}

export function expectedInvariant() {
  return 'Every matching order must appear exactly once in the complete result';
}

// This is a scanner-positive syntactic fixture. A runtime proof requires
// an authorized database with more than the endpoint row cap and a
// verified consistent snapshot, not merely this file's syntax.
