// CaseBlock variables shadow same-named outer declarations.
declare const sb: any;

export async function switchTableAttribution(kind: string) {
  const q = sb.from('orders').select('id');
  switch (kind) {
    case 'customer':
      const q = sb.from('customers').select('id');
      q.eq('status', 'open'); // not a customers column!
      break;
  }
  return await q.eq('status', 'open'); // valid orders column
}
