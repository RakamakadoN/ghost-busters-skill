// Fixture for scan-select-columns.cjs against ../types.ts.
declare const sb: any;

export async function castIsNotAColumn() {
  return await sb.from('orders').select('id::text'); // OK — cast, column is `id`
}

export async function aliasAndJson() {
  return await sb.from('orders').select('order_id:id, payload:data->>key, data->nested'); // OK
}

export async function existingFilter() {
  return await sb.from('orders').select('id').eq('status', 'open').order('customer_id'); // OK
}

export async function missingColumn() {
  return await sb.from('orders').select('id, missing_col'); // MISSING_COLUMN select: missing_col
}

export async function missingFilter() {
  return await sb.from('orders').select('id').eq('nope', 1); // MISSING_COLUMN eq: nope
}

export async function missingObject() {
  return await sb.from('ghost_table').select('id'); // MISSING_OBJECT
}

export async function embedOk() {
  return await sb.from('orders').select('id, customer:customers(id, name)'); // OK
}

export async function embedMissing() {
  return await sb.from('orders').select('id, customers(id, phone)'); // MISSING_COLUMN embed customers: phone
}

export async function viewRead() {
  return await sb.from('v_orders').select('id, total'); // OK — a view
}

export async function unsupportedConstruct() {
  return await sb.from('orders').select('"quoted col", status'); // UNSUPPORTED — quoted identifier, not a false MISSING_COLUMN
}

export async function otherSchema() {
  return await sb.schema('epm').from('scenarios').select('id'); // OTHER_SCHEMA — unverifiable
}
