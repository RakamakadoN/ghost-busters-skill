#!/usr/bin/env node
/**
 * Ghost Busters — class 3 "row-cap truncation" raid signature.
 *
 * Walks every .ts/.tsx under <srcDir>, finds each supabase-js query chain that
 * starts at `.from('<table>')` and classifies it:
 *
 *   WRITE       insert / update / delete / upsert in the chain (hidden unless --writes)
 *   SINGLE      .single() / .maybeSingle()
 *   HEAD        select(..., { head: true }) — count only
 *   RANGE       .range(a, b) present (paged)
 *   LIMIT:n     .limit(n) present; n > cap is flagged FALSE_CEILING
 *   UNBOUNDED   a select with none of the above — truncated silently at the cap
 *
 * Chains assembled in parts (`let q = sb.from('t').select(); q = q.range(...)`)
 * are followed through the variable inside the enclosing function, which is
 * where plain grep gives false "unbounded" hits.
 *
 * Usage:
 *   node scan-unbounded-reads.cjs [srcDir=src] [--cap 1000] [--json] [--writes] [--table name]
 *
 * Output (text): findings grouped by table, worst first, with order keys so the
 * "is the sort key unique?" probe can be run per table. `--json` prints the raw
 * findings for a CI guard or a spreadsheet.
 *
 * Requires `typescript` resolvable from the current working directory.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const srcDir = args.find((a) => !a.startsWith('--') && !isOptValue(a)) || 'src';
const CAP = Number(opt('--cap', '1000'));
const ONLY_TABLE = opt('--table', null);
const SHOW_WRITES = flag('--writes');
const AS_JSON = flag('--json');

function isOptValue(a) {
  const i = args.indexOf(a);
  return i > 0 && ['--cap', '--table'].includes(args[i - 1]);
}

let ts;
try {
  ts = require(require.resolve('typescript', { paths: [process.cwd()] }));
} catch {
  console.error('typescript not found from ' + process.cwd() + ' — run from the project root');
  process.exit(2);
}

const WRITE = new Set(['insert', 'update', 'delete', 'upsert']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) yield full;
  }
}

/** Collect method calls applied on top of `node` (the `.from()` call) in one expression. */
function chainAbove(node) {
  const calls = [];
  let cur = node;
  let top = node;
  for (;;) {
    const p = cur.parent;
    if (!p) break;
    if (ts.isPropertyAccessExpression(p) && p.expression === cur) {
      const gp = p.parent;
      if (gp && ts.isCallExpression(gp) && gp.expression === p) {
        calls.push({ name: p.name.text, args: gp.arguments });
        cur = gp;
        top = gp;
        continue;
      }
      break;
    }
    if (ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isParenthesizedExpression(p) || ts.isSatisfiesExpression?.(p)) {
      cur = p;
      continue;
    }
    break;
  }
  return { calls, top };
}

/** If the chain is stored in a variable, find `<ident>.method(...)` calls in the enclosing function. */
function followVariable(top, sf) {
  let p = top.parent;
  while (p && (ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isParenthesizedExpression(p) || ts.isAwaitExpression(p))) p = p.parent;
  let ident = null;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) ident = p.name.text;
  else if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(p.left)) ident = p.left.text;
  if (!ident) return [];
  let scope = p;
  while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
  const extra = [];
  /** Does this expression bottom out in `ident`? Looks through calls, property
   *  access, parentheses, `as`, `!`, `await` and both branches of a ternary —
   *  `(flag ? q.eq(...) : q).order(...).range(...)` must count for `q`. */
  const rootsIn = (node) => {
    if (!node) return false;
    if (ts.isIdentifier(node)) return node.text === ident;
    if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) return rootsIn(node.expression);
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isAwaitExpression(node)) return rootsIn(node.expression);
    if (ts.isConditionalExpression(node)) return rootsIn(node.whenTrue) || rootsIn(node.whenFalse);
    return false;
  };
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && rootsIn(n.expression.expression)) {
      extra.push({ name: n.expression.name.text, args: n.arguments });
    }
    ts.forEachChild(n, visit);
  };
  visit(scope || sf);
  return extra;
}

function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function classify(calls) {
  const names = calls.map((c) => c.name);
  if (names.some((n) => WRITE.has(n))) return { kind: 'WRITE' };
  if (names.includes('single') || names.includes('maybeSingle')) return { kind: 'SINGLE' };
  const select = calls.find((c) => c.name === 'select');
  if (select && select.args[1] && ts.isObjectLiteralExpression(select.args[1])) {
    const head = select.args[1].properties.find((pr) => pr.name && pr.name.getText() === 'head');
    if (head && head.initializer && head.initializer.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'HEAD' };
  }
  if (names.includes('range')) return { kind: 'RANGE' };
  const limit = calls.find((c) => c.name === 'limit');
  if (limit) {
    const n = limit.args[0] && ts.isNumericLiteral(limit.args[0]) ? Number(limit.args[0].text) : null;
    return { kind: 'LIMIT', limit: n, falseCeiling: n !== null && n > CAP };
  }
  if (!select && !names.includes('rpc')) return { kind: 'NOSELECT' };
  return { kind: 'UNBOUNDED' };
}

const findings = [];
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('.from(')) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'from') {
      const table = literalText(node.arguments[0]);
      if (table) {
        const { calls, top } = chainAbove(node);
        const all = calls.concat(followVariable(top, sf));
        const cls = classify(all);
        const order = all.filter((c) => c.name === 'order').map((c) => literalText(c.args[0])).filter(Boolean);
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        findings.push({ file: path.relative(process.cwd(), file), line: line + 1, table, kind: cls.kind, limit: cls.limit ?? null, falseCeiling: !!cls.falseCeiling, order, methods: all.map((c) => c.name) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

let out = findings.filter((f) => f.kind !== 'NOSELECT');
if (!SHOW_WRITES) out = out.filter((f) => f.kind !== 'WRITE');
if (ONLY_TABLE) out = out.filter((f) => f.table === ONLY_TABLE);

if (AS_JSON) {
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}

const rank = { UNBOUNDED: 0, LIMIT: 1, RANGE: 2, SINGLE: 3, HEAD: 4, WRITE: 5 };
const byTable = new Map();
for (const f of out) {
  if (!byTable.has(f.table)) byTable.set(f.table, []);
  byTable.get(f.table).push(f);
}
const risk = (list) => list.filter((f) => f.kind === 'UNBOUNDED' || f.falseCeiling).length;
const tables = [...byTable.entries()].sort((a, b) => risk(b[1]) - risk(a[1]) || a[0].localeCompare(b[0]));

const totals = out.reduce((acc, f) => ((acc[f.kind] = (acc[f.kind] || 0) + 1), acc), {});
console.log(`chains: ${findings.length} · reads: ${out.length} · ` + Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(' · ') + ` · cap ${CAP}`);
console.log('');
for (const [table, list] of tables) {
  const r = risk(list);
  console.log(`${table}  (${list.length} reads${r ? `, ${r} at risk` : ''})`);
  for (const f of list.sort((a, b) => rank[a.kind] - rank[b.kind])) {
    const tag = f.kind === 'LIMIT' ? `LIMIT:${f.limit ?? '?'}${f.falseCeiling ? ' FALSE_CEILING' : ''}` : f.kind;
    const ord = f.order.length ? `  order=[${f.order.join(', ')}]` : f.kind === 'RANGE' ? '  order=[]  !no order' : '';
    console.log(`  ${f.file}:${f.line}  ${tag}${ord}`);
  }
}
console.log('');
console.log('Next: count(*) per listed table/view under the widest role (probe 3.2), growth (3.4), key uniqueness (3.5).');
