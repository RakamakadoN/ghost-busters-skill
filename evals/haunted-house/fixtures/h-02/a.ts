// Synthetic PostgREST client example; evaluated as source text only.
type SaveResult = { ok: true, changed: number } | { ok: false, reason: string };
type Client = {
  from(name: string): {
    update(values: object): {
      eq(field: string, id: string): {
        select(fields: string): Promise<{ data: { id: string }[] | null, error: unknown }>
      }
    }
  }
};

export async function savePosted(client: Client, id: string): Promise<SaveResult> {
  const res = await client.from('orders')
    .update({ status: 'posted' })
    .eq('id', id)
    .select('id');
  if (res.error) return { ok: false, reason: 'write rejected' };
  // In this example the contract requires a transition of ONE existing row.
  if (!res.data || res.data.length !== 1) {
    return { ok: false, reason: 'expected one affected order' };
  }
  return { ok: true, changed: res.data.length };
}

// Even this check alone cannot prove why a row is invisible:
// a missing order, filter mismatch or RLS may produce the same count.
// A real test must use the authorized role, policy and durable state.
