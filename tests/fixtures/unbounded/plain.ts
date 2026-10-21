// Fixture: plain chains. Expected per line, see tests/scanners.test.cjs.
declare const sb: any;

export async function unbounded() {
  return await sb.from('orders').select('id, status'); // UNBOUNDED
}

export async function singleRange() {
  return await sb.from('orders').select('id').range(0, 999); // RANGE_SINGLE (one page of 1000)
}

export async function pagedLoop() {
  const all: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await sb.from('orders').select('id').order('id').range(offset, offset + 999); // RANGE (paged)
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

export async function limited() {
  return await sb.from('orders').select('id').limit(50000); // LIMIT:50000 FALSE_CEILING
}

export async function single() {
  return await sb.from('orders').select('id').eq('id', 1).single(); // SINGLE
}

export async function head() {
  return await sb.from('orders').select('id', { count: 'exact', head: true }); // HEAD
}

export async function write() {
  return await sb.from('orders').insert({ id: 1 }); // WRITE (hidden by default)
}
