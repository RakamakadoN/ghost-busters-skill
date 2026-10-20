// Fixture: `.from()` of other APIs is not a table read.
declare const sb: any;

export async function upload(file: Blob) {
  return await sb.storage.from('photos').upload('a.jpg', file); // not a table — skipped
}

export function arrayFrom() {
  return Array.from('abc'); // not supabase — skipped
}

export async function realRead() {
  return await sb.from('photos').select('id'); // UNBOUNDED — a table that happens to share the bucket's name
}
