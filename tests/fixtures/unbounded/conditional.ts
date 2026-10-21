// Fixture: a bound that exists on only one control-flow path is not a bound.
declare const sb: any;

export async function conditionalRange(paged: boolean) {
  let q = sb.from('orders').select('id');
  if (paged) q = q.range(0, 999);
  return await q; // CONDITIONAL — unbounded when paged === false
}

export async function unconditionalViaVariable() {
  let q = sb.from('orders').select('id');
  q = q.range(0, 999);
  return await q; // RANGE_SINGLE — every path is bounded
}

export async function ternaryFilterThenRange(flourOnly: boolean) {
  const query = sb.from('sales').select('*').gte('month', '2026-01');
  return await (flourOnly ? query.eq('is_flour', true) : query).order('id').range(0, 999); // RANGE_SINGLE — range is on every path
}

export async function logicalAndLimit(small: boolean) {
  const q = sb.from('orders').select('id');
  small && q.limit(10);
  return await q; // CONDITIONAL
}
