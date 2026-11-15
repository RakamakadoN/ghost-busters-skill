// Synthetic PostgREST client example; evaluated as source text only.
type SaveResult = { ok: true, changed: number } | { ok: false, reason: string };
type Client = {
  from(name: string): {
    update(values: object): {
      eq(field: string, id: string): Promise<{ data: unknown, error: unknown }>
    }
  }
};

export async function savePosted(client: Client, id: string): Promise<SaveResult> {
  const res = await client.from('orders')
    .update({ status: 'posted' })
    .eq('id', id);
  if (res.error) return { ok: false, reason: 'write rejected' };
  // No returned count is available; this incorrectly treats
  // zero affected rows as a completed business mutation.
  return { ok: true, changed: 1 };
}

// Trigger: role-filtered or absent order returns no affected rows.
// This is not a real Supabase execution, deployment test or proof.
// A documented idempotent no-op would have a different contract.
