#!/usr/bin/env node
/**
 * Ghost Busters — class 3 "row-cap truncation" raid signature.
 *
 * Walks every .ts/.tsx under <srcDir>, finds each supabase-js query chain that
 * starts at `.from('<table>')` and classifies it:
 *
 *   WRITE         insert / update / delete / upsert in the chain (hidden unless --writes)
 *   SINGLE        .single() / .maybeSingle()
 *   HEAD          select(..., { head: true }) — count only
 *   RANGE         .range(a, b) with computed bounds — assumed to be a paging loop
 *   RANGE_SINGLE  .range(<n>, <m>) with two literals — ONE page of m-n+1 rows, i.e. a cap
 *   LIMIT:n       .limit(n); n > cap is flagged FALSE_CEILING
 *   CONDITIONAL   a bound exists only on some control-flow path (if / ternary / && / loop / callback)
 *   UNKNOWN       the chain's variable is rebound to another query — not analysed
 *   UNBOUNDED     a select with none of the above — truncated silently at the cap
 *
 * This is a static scan, not a proof: it finds suspicious call sites for a
 * human (or a probe against production) to confirm. Its limits are listed in
 * lib/chains.cjs. "At risk" = UNBOUNDED, CONDITIONAL, UNKNOWN, RANGE_SINGLE
 * and any FALSE_CEILING or UNCERTAIN_BOUND.
 *
 * Usage:
 *   node scan-unbounded-reads.cjs [srcDir=src] [--cap 1000] [--json] [--writes] [--table name] [--strict]
 *
 * Exit code: 0, or 1 with --strict when at least one at-risk read exists —
 * identical in text and JSON mode.
 *
 * Requires `typescript` resolvable from the current working directory.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadTypescript, walkSources, literalText, isTableFrom, isDynamicTableFrom, chainAbove, followVariable } = require('./lib/chains.cjs');

const args = process.argv.slice(2);
const VALUE_OPTS = new Set(['--cap', '--table']);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const srcDir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_OPTS.has(args[i - 1]))) || 'src';
const CAP = Number(opt('--cap', '1000'));
const ONLY_TABLE = opt('--table', null);
const SHOW_WRITES = flag('--writes');
const AS_JSON = flag('--json');
const STRICT = flag('--strict');

const ts = loadTypescript();
const WRITE = new Set(['insert', 'update', 'delete', 'upsert']);
const BOUNDING = new Set(['range', 'limit', 'single', 'maybeSingle']);

function numericArg(node) {
  return node && ts.isNumericLiteral(node) ? Number(node.text) : null;
}

function headSelect(call) {
  if (call.name !== 'select' || !call.args[1] || !ts.isObjectLiteralExpression(call.args[1])) return false;
  const head = call.args[1].properties.find((pr) => pr.name && pr.name.getText() === 'head');
  return !!(head && head.initializer && head.initializer.kind === ts.SyntaxKind.TrueKeyword);
}

/** Classify from the full list of calls (direct chain + via variable), honouring `conditional`. */
function classify(calls, rebound) {
  const names = calls.map((c) => c.name);
  if (names.some((n) => WRITE.has(n))) return { kind: 'WRITE' };
  const hasSelect = names.includes('select');
  if (!hasSelect && !names.includes('rpc')) return { kind: 'NOSELECT' };
  if (rebound) return { kind: 'UNKNOWN', note: 'variable rebound to another query' };

  const unconditional = calls.filter((c) => !c.conditional);
  const conditionalBounds = calls.filter((c) => c.conditional && (BOUNDING.has(c.name) || headSelect(c)));

  const pick = (list) => {
    if (list.some((c) => c.name === 'single' || c.name === 'maybeSingle')) return { kind: 'SINGLE' };
    if (list.some(headSelect)) return { kind: 'HEAD' };
    const range = list.find((c) => c.name === 'range');
    if (range) {
      const a = numericArg(range.args[0]);
      const b = numericArg(range.args[1]);
      if (a !== null && b !== null) {
        const n = b - a + 1;
        return { kind: 'RANGE_SINGLE', limit: n, falseCeiling: n > CAP, note: 'one page, not pagination' };
      }
      return { kind: 'RANGE', note: 'computed bounds — paging loop assumed, completeness not proven' };
    }
    const limit = list.find((c) => c.name === 'limit');
    if (limit) {
      const n = numericArg(limit.args[0]);
      return { kind: 'LIMIT', limit: n, falseCeiling: n !== null && n > CAP, uncertainBound: n === null, note: n === null ? 'dynamic limit — server cap and completeness not proven' : undefined };
    }
    return null;
  };

  const bound = pick(unconditional);
  if (bound) return bound;
  if (conditionalBounds.length) return { kind: 'CONDITIONAL', note: `bound only on some path: ${[...new Set(conditionalBounds.map((c) => c.name))].join(', ')}` };
  return { kind: 'UNBOUNDED' };
}

const AT_RISK = (f) => f.kind === 'UNBOUNDED' || f.kind === 'CONDITIONAL' || f.kind === 'UNKNOWN' || f.kind === 'RANGE_SINGLE' || f.kind === 'DYNAMIC_TABLE' || !!f.falseCeiling || !!f.uncertainBound;

const findings = [];
for (const file of walkSources(srcDir)) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (isTableFrom(ts, node) || isDynamicTableFrom(ts, node)) {
      const table = literalText(ts, node.arguments[0]);
      const { calls, top } = chainAbove(ts, node);
      const viaVar = followVariable(ts, top, sf, node);
      const all = calls.concat(viaVar.calls);
      const cls = classify(all, viaVar.rebound);
      if (isDynamicTableFrom(ts, node) && cls.kind !== 'WRITE' && cls.kind !== 'NOSELECT') {
        cls.kind = 'DYNAMIC_TABLE';
        cls.note = 'nonliteral table name; verify query target';
      }
      const order = all.filter((c) => c.name === 'order').map((c) => literalText(ts, c.args[0])).filter(Boolean);
      const { line } = sf.getLineAndCharacterOfPosition(node.expression.name.getStart(sf));
      findings.push({
        file: path.relative(process.cwd(), file),
        line: line + 1,
        table,
        kind: cls.kind,
        limit: cls.limit ?? null,
        falseCeiling: !!cls.falseCeiling,
        uncertainBound: !!cls.uncertainBound,
        note: cls.note ?? null,
        viaVariable: viaVar.ident,
        order,
        methods: all.map((c) => (c.conditional ? `${c.name}?` : c.name)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

let out = findings.filter((f) => f.kind !== 'NOSELECT');
if (!SHOW_WRITES) out = out.filter((f) => f.kind !== 'WRITE');
if (ONLY_TABLE) out = out.filter((f) => f.table === ONLY_TABLE);
const atRisk = out.filter(AT_RISK).length;
const exitCode = STRICT && atRisk > 0 ? 1 : 0;

if (AS_JSON) {
  console.log(JSON.stringify(out, null, 1));
  process.exit(exitCode);
}

const rank = { UNBOUNDED: 0, CONDITIONAL: 1, UNKNOWN: 2, RANGE_SINGLE: 3, LIMIT: 4, RANGE: 5, SINGLE: 6, HEAD: 7, WRITE: 8 };
const byTable = new Map();
for (const f of out) {
  if (!byTable.has(f.table)) byTable.set(f.table, []);
  byTable.get(f.table).push(f);
}
const risk = (list) => list.filter(AT_RISK).length;
const tables = [...byTable.entries()].sort((a, b) => risk(b[1]) - risk(a[1]) || a[0].localeCompare(b[0]));

const totals = out.reduce((acc, f) => ((acc[f.kind] = (acc[f.kind] || 0) + 1), acc), {});
console.log(`chains: ${findings.length} · reads: ${out.length} · at risk: ${atRisk} · ` + Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(' · ') + ` · cap ${CAP}`);
console.log('');
for (const [table, list] of tables) {
  const r = risk(list);
  console.log(`${table}  (${list.length} reads${r ? `, ${r} at risk` : ''})`);
  for (const f of list.sort((a, b) => rank[a.kind] - rank[b.kind])) {
    let tag = f.kind;
    if (f.kind === 'LIMIT') tag = `LIMIT:${f.limit ?? '?'}${f.falseCeiling ? ' FALSE_CEILING' : ''}${f.uncertainBound ? ' UNCERTAIN_BOUND' : ''}`;
    if (f.kind === 'RANGE_SINGLE') tag = `RANGE_SINGLE:${f.limit}${f.falseCeiling ? ' FALSE_CEILING' : ''}`;
    const ord = f.order.length ? `  order=[${f.order.join(', ')}]` : f.kind === 'RANGE' ? '  order=[]  !no order' : '';
    const note = f.note ? `  (${f.note})` : '';
    console.log(`  ${f.file}:${f.line}  ${tag}${ord}${note}`);
  }
}
console.log('');
console.log('Static scan: these are call sites to check, not proven bugs. Next: count(*) per listed table/view under the widest role (probe 3.2), growth (3.4), key uniqueness (3.5).');
process.exit(exitCode);
