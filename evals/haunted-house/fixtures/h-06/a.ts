// Synthetic Supabase read with bounded, deterministic paging.
type Row = { id: string };
type Page = { data: Row[] | null, error: unknown };
type Db = {
  from(table: string): {
    select(columns: string): {
      order(key: string, opts: object): {
        range(from: number, to: number): Promise<Page>
      }
    }
  }
};

export async function listAllOrders(db: Db): Promise<Row[]> {
  const all: Row[] = [];
  const size = 100;
  for (let start = 0; ; start += size) {
    const res = await db.from('orders').select('id')
      .order('id', { ascending: true })
      .range(start, start + size - 1);
    if (res.error || !res.data) throw new Error('incomplete order read');
    all.push(...res.data);
    if (res.data.length < size) break;
  }
  return all;
}

// The caller must ensure stable snapshot semantics or accept changes
// between pages. Under a live changing table this may need keyset paging.
// This synthetic safe control does not prove a production implementation.
