'use strict';
// Regression tests for the two static scanners. Run: npm test
// Each test runs a scanner as a child process on a small fixture directory and
// checks the JSON output, then checks that text mode and JSON mode agree on the
// exit code. No database, no network, no secrets.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const UNBOUNDED = path.join(ROOT, 'references', 'scan-unbounded-reads.cjs');
const COLUMNS = path.join(ROOT, 'references', 'scan-select-columns.cjs');
const FX_UNBOUNDED = path.join('tests', 'fixtures', 'unbounded');
const FX_COLUMNS = path.join('tests', 'fixtures', 'columns');
const FX_TYPES = path.join('tests', 'fixtures', 'types.ts');

function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function runJson(script, args) {
  const r = run(script, [...args, '--json']);
  let json;
  try {
    json = JSON.parse(r.out);
  } catch (e) {
    throw new Error(`JSON mode did not print JSON (exit ${r.code}): ${r.out.slice(0, 300)} ${r.err.slice(0, 300)}`);
  }
  return { ...r, json };
}

/** Find the single finding for a file basename + line (1-based). */
function at(findings, file, line) {
  const hits = findings.filter((f) => f.file.endsWith(file) && f.line === line);
  assert.equal(hits.length, 1, `expected exactly one finding at ${file}:${line}, got ${JSON.stringify(hits)}`);
  return hits[0];
}

// ── scan-unbounded-reads ───────────────────────────────────────────────────

test('unbounded: plain chains are classified by their terminal method', () => {
  const { json } = runJson(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000', '--writes']);
  assert.equal(at(json, 'plain.ts', 5).kind, 'UNBOUNDED');
  assert.equal(at(json, 'plain.ts', 9).kind, 'RANGE_SINGLE');
  assert.equal(at(json, 'plain.ts', 15).kind, 'RANGE');
  const lim = at(json, 'plain.ts', 23);
  assert.equal(lim.kind, 'LIMIT');
  assert.equal(lim.limit, 50000);
  assert.equal(lim.falseCeiling, true);
  assert.equal(at(json, 'plain.ts', 27).kind, 'SINGLE');
  assert.equal(at(json, 'plain.ts', 31).kind, 'HEAD');
  assert.equal(at(json, 'plain.ts', 35).kind, 'WRITE');
});

test('unbounded: whitespace and line breaks around .from( do not hide a chain', () => {
  const { json } = runJson(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000']);
  assert.equal(at(json, 'spaces.ts', 5).kind, 'UNBOUNDED');
  const lim = at(json, 'spaces.ts', 10);
  assert.equal(lim.kind, 'LIMIT');
  assert.equal(lim.falseCeiling, true);
});

test('unbounded: a bound on one control-flow path is CONDITIONAL, on every path it counts', () => {
  const { json } = runJson(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000']);
  assert.equal(at(json, 'conditional.ts', 5).kind, 'CONDITIONAL');
  assert.equal(at(json, 'conditional.ts', 11).kind, 'RANGE_SINGLE');
  assert.equal(at(json, 'conditional.ts', 17).kind, 'RANGE_SINGLE');
  assert.equal(at(json, 'conditional.ts', 22).kind, 'CONDITIONAL');
});

test('unbounded: same variable name in different functions does not leak methods; rebinding is UNKNOWN', () => {
  const { json } = runJson(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000']);
  assert.equal(at(json, 'scopes.ts', 5).kind, 'UNBOUNDED');
  assert.equal(at(json, 'scopes.ts', 10).kind, 'RANGE_SINGLE');
  assert.equal(at(json, 'scopes.ts', 15).kind, 'UNKNOWN');
  assert.equal(at(json, 'scopes.ts', 16).kind, 'UNKNOWN');
  assert.equal(at(json, 'scopes.ts', 23).kind, 'RANGE', 'same const name in a sibling block is not a rebinding');
  assert.equal(at(json, 'scopes.ts', 28).kind, 'RANGE');
});

test('unbounded: storage.from() and Array.from() are not table reads', () => {
  const { json } = runJson(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000']);
  assert.equal(json.filter((f) => f.file.endsWith('storage.ts')).length, 1);
  assert.equal(at(json, 'storage.ts', 13).kind, 'UNBOUNDED');
});

test('unbounded: text and JSON modes exit with the same code', () => {
  const text = run(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000']);
  const json = run(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000', '--json']);
  assert.equal(text.code, json.code);
  const strictText = run(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000', '--strict']);
  const strictJson = run(UNBOUNDED, [FX_UNBOUNDED, '--cap', '1000', '--strict', '--json']);
  assert.equal(strictText.code, 1, '--strict exits 1 when at-risk reads exist');
  assert.equal(strictJson.code, 1);
  assert.match(text.out, /chains:/);
});

// ── scan-select-columns ────────────────────────────────────────────────────

test('columns: casts, aliases and JSON paths are not columns; missing ones are reported', () => {
  const { json } = runJson(COLUMNS, [FX_COLUMNS, '--types', FX_TYPES]);
  const lines = (n) => json.filter((f) => f.file.endsWith('select.ts') && f.line === n);
  assert.deepEqual(lines(5), [], 'id::text must not produce a finding');
  assert.deepEqual(lines(9), [], 'alias and json paths must not produce a finding');
  assert.deepEqual(lines(13), [], 'existing filter and order columns');
  assert.equal(at(json, 'select.ts', 17).detail, 'select: missing_col');
  assert.equal(at(json, 'select.ts', 21).detail, 'eq: nope');
  assert.equal(at(json, 'select.ts', 25).kind, 'MISSING_OBJECT');
  assert.deepEqual(lines(29), [], 'embed with existing columns');
  assert.equal(at(json, 'select.ts', 33).detail, 'embed customers: phone');
  assert.deepEqual(lines(37), [], 'view columns come from Views');
  assert.equal(at(json, 'select.ts', 41).kind, 'UNSUPPORTED');
  assert.equal(at(json, 'select.ts', 45).kind, 'OTHER_SCHEMA');
});

test('columns: text and JSON modes exit with the same code and OTHER_SCHEMA is not a failure', () => {
  const text = run(COLUMNS, [FX_COLUMNS, '--types', FX_TYPES]);
  const json = run(COLUMNS, [FX_COLUMNS, '--types', FX_TYPES, '--json']);
  assert.equal(text.code, 1, 'hard findings exist in the fixture');
  assert.equal(json.code, text.code);
  assert.match(text.out, /schema:/);
});
