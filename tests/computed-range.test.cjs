'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scanner = path.join(root, 'references/scan-unbounded-reads.cjs');
function run(dir, flags = []) {
  return spawnSync(process.execPath, [scanner, dir, ...flags], {cwd: root, encoding: 'utf8'});
}

test('computed range is not treated as proof of complete pagination', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-range-'));
  try {
    fs.writeFileSync(path.join(dir, 'case.ts'), [
      "db.from('orders').select('*').range(offset, offset + pageSize - 1);",
      "db.from('orders').select('*').range(start, end);",
      "db.from('orders').select('*').range('0', '999');",
      "for (let page = 0; page < 3; page++) db.from('orders').select('*').range(page * 10, page * 10 + 9);",
      "db.from('orders').select('*').range(0, 99);",
      "db.from('orders').select('*').limit(50);",
      "db.from(tableName).select('*');"
    ].join('\n'));
    const json = run(dir, ['--json', '--strict']);
    assert.equal(json.status, 1, json.stderr);
    const findings = JSON.parse(json.stdout);
    assert.equal(findings.length, 7);
    assert.deepEqual(findings.slice(0, 4).map(f => f.kind), ['RANGE','RANGE','RANGE','RANGE']);
    assert.ok(findings.slice(0, 4).every(f => f.paginationUnverified === true));
    assert.equal(findings[4].kind, 'RANGE_SINGLE');
    assert.equal(findings[4].paginationUnverified, false);
    assert.equal(findings[5].kind, 'LIMIT');
    assert.equal(findings[5].paginationUnverified, false);
    assert.equal(findings[6].kind, 'DYNAMIC_TABLE');
    assert.equal(findings[6].table, null);
    const text = run(dir, ['--strict']);
    assert.equal(text.status, json.status, text.stderr);
    assert.match(text.stdout, /UNVERIFIED_PAGINATION/);
    assert.match(text.stdout, /DYNAMIC_TABLE/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('explicit small limits remain non-risky in strict mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-small-limit-'));
  try {
    fs.writeFileSync(path.join(dir,'safe.ts'),"db.from('orders').select('*').limit(50);");
    assert.equal(run(dir,['--strict']).status,0);
    assert.equal(run(dir,['--strict','--json']).status,0);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
