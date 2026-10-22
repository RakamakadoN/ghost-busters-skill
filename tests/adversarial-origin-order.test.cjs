'use strict';
// Fresh adversarial regressions, separate from the 60 fixture cases.
// A green run verifies these assertions, NOT independent production precision.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const rows = path.join(root, 'references/scan-unbounded-reads.cjs');
const cols = path.join(root, 'references/scan-select-columns.cjs');
const types = path.join(root, 'tests/fixtures/types.ts');

function fixture(source, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-origin-order-'));
  try {
    fs.writeFileSync(path.join(dir, 'case.ts'), source);
    return fn(dir);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
function run(script, dir, args = []) {
  const r = spawnSync(process.execPath, [script, dir, ...args, '--json'], {cwd: root, encoding: 'utf8'});
  assert.equal(r.error, undefined);
  let results;
  try { results = JSON.parse(r.stdout); }
  catch { throw new Error(`bad JSON (exit ${r.status}): ${r.stderr}\n${r.stdout}`); }
  return {code:r.status, findings:results};
}

test('explicit --client-root excludes unrelated query-builder APIs for row cap', () => fixture([
  "knex.from('phantom').select('*');",
  "db.from('orders').select('*');",
  "supabase.schema('public').from('customers').select('*');"
].join('\n'), dir => {
  const onlyDb = run(rows, dir, ['--client-root','db']);
  assert.equal(onlyDb.code, 0);
  assert.deepEqual(onlyDb.findings.map(f => f.table), ['orders']);
  const two = run(rows, dir, ['--client-root','db','--client-root','supabase']);
  assert.deepEqual(two.findings.map(f=>f.table), ['orders','customers']);
  assert.ok(two.findings.every(f => f.kind === 'UNBOUNDED'));
}));

test('explicit --client-root prevents false missing objects in column scanner', () => fixture([
  "knex.from('phantom').select('bogus');",
  "db.from('orders').select('bogus');",
  "supabase.from('orders').select('id');"
].join('\n'), dir => {
  const result = run(cols, dir, ['--types', types, '--client-root', 'db']);
  assert.equal(result.code, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].kind, 'MISSING_COLUMN');
  assert.equal(result.findings[0].object, 'public.orders');
}));

test('await BEFORE applying limit is not mistaken for an already bounded query', () => fixture([
  "async function load() {",
  "  const q = db.from('orders').select('*');",
  "  const first = await q;",
  "  q.limit(10);",
  "  return first;",
  "}"
].join('\n'), dir => {
  const result = run(rows, dir, ['--strict']);
  assert.equal(result.code, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].kind, 'EARLY_EXECUTION');
}));

test('.then() BEFORE applying limit initiates a query without that limit', () => fixture([
  "const q = db.from('orders').select('*');",
  "q.then(() => {});",
  "q.limit(10);"
].join('\n'), dir => {
  const result = run(rows, dir, ['--strict']);
  assert.equal(result.code, 1);
  assert.equal(result.findings[0].kind, 'EARLY_EXECUTION');
}));

test('an unconditional limit applied BEFORE await remains bounded', () => fixture([
  "async function load() {",
  "  const q = db.from('orders').select('*');",
  "  q.limit(10);",
  "  return await q;",
  "}"
].join('\n'), dir => {
  const result = run(rows, dir, ['--strict']);
  assert.equal(result.code, 0);
  assert.equal(result.findings[0].kind, 'LIMIT');
}));
