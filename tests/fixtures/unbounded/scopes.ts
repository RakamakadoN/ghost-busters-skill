// Fixture: the same variable name in different functions must not share methods.
declare const sb: any;

export async function first() {
  const q = sb.from('alpha').select('x');
  return await q; // UNBOUNDED — the .range() below belongs to another function
}

export async function second() {
  const q = sb.from('beta').select('y');
  return await q.range(0, 9); // RANGE_SINGLE
}

export async function reassigned() {
  let q = sb.from('gamma').select('x'); // UNKNOWN — variable rebound to another query below
  q = sb.from('delta').select('y').limit(5); // UNKNOWN — shares the variable with the chain above
  return await q;
}

export async function siblingBlocksSameName() {
  const a: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await sb.from('epsilon').select('x').order('id').range(offset, offset + 999); // RANGE — sibling block below reuses `page`
    a.push(page);
    if (!page) break;
  }
  for (let offset = 0; ; offset += 1000) {
    const page = await sb.from('zeta').select('y').order('id').range(offset, offset + 999); // RANGE
    a.push(page);
    if (!page) break;
  }
  return a;
}
