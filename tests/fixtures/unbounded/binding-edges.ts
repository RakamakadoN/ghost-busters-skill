// Regression cases for lexical scopes and rebinding. Parsed, never executed.
declare const sb: any;
declare function nextQuery(): any;

export async function switchShadowing(kind: string) {
  const q = sb.from('orders').select('id');
  switch (kind) {
    case 'posts':
      const q = sb.from('customers').select('id');
      q.limit(10);
      break;
  }
  return await q;
}

export async function logicalAndRebind() {
  let q = sb.from('orders').select('id');
  q &&= sb.from('customers').select('id');
  return await q.limit(5);
}

export async function nullishRebind() {
  let q = sb.from('orders').select('id');
  q ??= sb.from('customers').select('id');
  return await q.limit(5);
}

export async function logicalOrRebind() {
  let q = sb.from('orders').select('id');
  q ||= sb.from('customers').select('id');
  return await q.limit(5);
}

export async function aliasRebind() {
  const other = sb.from('customers').select('id');
  let q = sb.from('orders').select('id');
  q = other;
  return await q.limit(5);
}

export async function functionRebind() {
  let q = sb.from('orders').select('id');
  q = nextQuery();
  return await q.limit(5);
}

export async function sameQueryReassignment() {
  let q = sb.from('orders').select('id');
  q = q.limit(8);
  return await q;
}
