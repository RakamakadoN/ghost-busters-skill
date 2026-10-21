// Fixture: whitespace and line breaks around `.from(` must not hide a chain.
declare const sb: any;

export async function spaceBeforeParen() {
  return await sb.from ('orders').select('id'); // UNBOUNDED
}

export async function brokenLines() {
  return await sb
    .from(
      'orders'
    )
    .select('id')
    .limit(2000); // LIMIT:2000 FALSE_CEILING
}
