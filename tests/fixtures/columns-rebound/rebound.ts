// Fixture for scan-select-columns.cjs against ../types.ts: a variable rebound
// to another query. `name` exists on customers, not on orders.
declare const sb: any;

export async function rebound() {
  let q = sb.from('orders').select('id'); // direct part OK; methods after the rebinding are not attributed
  q = sb.from('customers').select('name'); // direct part OK
  return await q.eq('name', 'Alice'); // belongs to customers — must NOT become "orders MISSING_COLUMN eq: name"
}

export async function nestedShadow() {
  const q = sb.from('orders').select('id'); // direct part OK
  {
    const q = sb.from('customers').select('name'); // direct part OK
    void q.eq('name', 'Bob'); // belongs to the inner q (customers) — OK
  }
  return await q.eq('status', 'open'); // belongs to the outer q (orders) — OK
}
