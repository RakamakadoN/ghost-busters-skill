// Fixture: references must resolve to a specific declaration, not to a name.
declare const sb: any;

export async function nestedShadow() {
  const q = sb.from('orders').select('id'); // UNBOUNDED — the inner `q` below is a different variable
  {
    const q = sb.from('customers').select('id'); // SINGLE — bound by its own .single()
    q.single();
  }
  return await q;
}

export async function closureOverOuter() {
  const q = sb.from('products').select('id'); // CONDITIONAL — the only bound is inside a callback that may never run
  const run = async () => q.limit(5);
  void run;
  return await q;
}

export async function closureShadowsOuter() {
  const q = sb.from('suppliers').select('id'); // UNBOUNDED — the callback declares its own `q`
  const run = async () => {
    const q = sb.from('contacts').select('id'); // LIMIT:5
    return q.limit(5);
  };
  void run;
  return await q;
}

export async function assignedInBranches(flag: boolean) {
  let q;
  if (flag) q = sb.from('a').select('x'); // UNKNOWN — the same variable is bound to two different queries
  else q = sb.from('b').select('y').limit(1); // UNKNOWN
  return await q;
}
