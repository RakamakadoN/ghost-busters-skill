#!/usr/bin/env node
/**
 * Ghost Busters — class 5 "code ≠ production" signature: columns and objects
 * the frontend asks PostgREST for that the schema does not have.
 *
 * PostgREST rejects the WHOLE query when a select list or a filter names a
 * column that does not exist; the client usually swallows the error and the
 * screen shows "nothing found" (a search palette once read a column that was
 * not there and found nothing, for weeks). A typed client catches this at
 * tsc time; an untyped one never does. This script checks every call site.
 *
 * Schema source: the generated Supabase types (src/types/database.types.ts —
 * Tables and Views with their Row columns). Their freshness is a separate
 * question: `git log -1 -- <types file>` says when they were last regenerated.
 *
 * Checks per `.from('<object>')` chain:
 *   MISSING_OBJECT   the table/view is not in the schema (or lives in another schema)
 *   MISSING_COLUMN   a column in .select('…') or in a filter/order is not in the object
 *   EMBED_UNKNOWN    an embedded relation `rel(...)` names no table/view (FK-name embeds are skipped)
 *
 * Usage:
 *   node scan-select-columns.cjs [srcDir=src] [--types src/types/database.types.ts] [--json]
 *        [--schema-for <path-substring>=<schema>]...   files whose client is scoped to another
 *                                                      schema by a helper the chain cannot show
 *                                                      (e.g. --schema-for features/epm/=epm)
 *
 * Objects in a schema the types file does not cover are reported as OTHER_SCHEMA
 * (unverifiable), not as missing. The types directory itself is skipped (it holds
 * the deliberate `no_such_column` guard).
 *
 * Requires `typescript` resolvable from the current working directory.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const VALUE_OPTS = new Set(['--types', '--schema-for']);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const srcDir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_OPTS.has(args[i - 1]))) || 'src';
const TYPES = opt('--types', 'src/types/database.types.ts');
const AS_JSON = flag('--json');
const SCHEMA_FOR = [];
args.forEach((a, i) => {
  if (a === '--schema-for' && args[i + 1] && args[i + 1].includes('=')) {
    const [sub, sch] = args[i + 1].split('=');
    SCHEMA_FOR.push({ sub, sch });
  }
});

let ts;
try {
  ts = require(require.resolve('typescript', { paths: [process.cwd()] }));
} catch {
  console.error('typescript not found from ' + process.cwd() + ' — run from the project root');
  process.exit(2);
}

// ── schema from generated types ────────────────────────────────────────────
function loadSchema(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const schema = new Map(); // "schema.object" -> { kind, columns:Set }
  const dbAlias = sf.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === 'Database');
  if (!dbAlias || !ts.isTypeLiteralNode(dbAlias.type)) throw new Error('Database type alias not found in ' + file);
  const propName = (m) => (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? m.name.text : null);
  for (const schemaMember of dbAlias.type.members) {
    const schemaName = propName(schemaMember);
    if (!schemaName || !ts.isPropertySignature(schemaMember) || !schemaMember.type || !ts.isTypeLiteralNode(schemaMember.type)) continue;
    for (const section of schemaMember.type.members) {
      const sectionName = propName(section);
      if (!['Tables', 'Views'].includes(sectionName) || !ts.isTypeLiteralNode(section.type)) continue;
      for (const obj of section.type.members) {
        const objName = propName(obj);
        if (!objName || !ts.isTypeLiteralNode(obj.type)) continue;
        const row = obj.type.members.find((m) => propName(m) === 'Row');
        const columns = new Set();
        if (row && ts.isTypeLiteralNode(row.type)) for (const c of row.type.members) columns.add(propName(c));
        schema.set(`${schemaName}.${objName}`, { kind: sectionName === 'Tables' ? 'table' : 'view', columns });
      }
    }
  }
  return schema;
}

// ── chain walking (same approach as scan-unbounded-reads.cjs) ──────────────
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
  const rootsIn = (n) => {
    if (!n) return false;
    if (ts.isIdentifier(n)) return n.text === ident;
    if (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n)) return rootsIn(n.expression);
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isAwaitExpression(n)) return rootsIn(n.expression);
    if (ts.isConditionalExpression(n)) return rootsIn(n.whenTrue) || rootsIn(n.whenFalse);
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

const lit = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);

/** Schema the chain targets: `.schema('epm').from(...)`, a --schema-for rule for the file, or public. */
function schemaOf(fromCall, file) {
  const recv = fromCall.expression.expression;
  if (ts.isCallExpression(recv) && ts.isPropertyAccessExpression(recv.expression) && recv.expression.name.text === 'schema') {
    return lit(recv.arguments[0]) || 'public';
  }
  const rule = SCHEMA_FOR.find((r) => file.includes(r.sub));
  return rule ? rule.sch : 'public';
}

// ── PostgREST select-list parsing ──────────────────────────────────────────
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);

/** Returns { columns: [...], embeds: [{ name, inner }] } for one select string.
 *  Inside an embed, a bare aggregate name (`rel(count)`) is PostgREST syntax, not a column. */
function parseSelect(s, insideEmbed = false) {
  const columns = [];
  const embeds = [];
  for (const item of splitTopLevel(s.replace(/\s+/g, ''))) {
    const paren = item.indexOf('(');
    if (paren >= 0) {
      let head = item.slice(0, paren);
      const inner = item.slice(paren + 1, item.lastIndexOf(')'));
      if (head.includes(':')) head = head.slice(head.indexOf(':') + 1); // alias:rel
      head = head.replace(/^!?/, '').split('!')[0]; // rel!fk / !inner
      embeds.push({ name: head, inner });
      continue;
    }
    if (item === '*') continue;
    let col = item;
    if (col.includes(':')) col = col.slice(col.indexOf(':') + 1); // alias:col
    col = col.split('::')[0]; // cast
    col = col.split('->')[0]; // json path
    col = col.replace(/\.(count|sum|avg|min|max)\(\)$/, ''); // aggregates
    if (insideEmbed && AGGREGATES.has(col)) continue;
    if (col && col !== '*' && !col.includes('.')) columns.push(col);
  }
  return { columns, embeds };
}

const FILTER_METHODS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'imatch', 'is', 'in', 'contains', 'containedBy', 'order', 'textSearch', 'rangeGt', 'rangeLt', 'overlaps']);

function columnOfFilterArg(s) {
  if (!s) return null;
  let col = s.split('->')[0];
  col = col.split('::')[0];
  if (col.includes('.')) return null; // embedded.column — skip
  return col;
}

// ── scan ───────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.resolve(full) === path.resolve(path.dirname(TYPES))) continue; // the types dir holds the deliberate guard
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) yield full;
  }
}

const schema = loadSchema(TYPES);
const knownSchemas = new Set([...schema.keys()].map((k) => k.split('.')[0]));
let typesDate = null;
try {
  typesDate = execFileSync('git', ['log', '-1', '--format=%cs', '--', TYPES], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
} catch {
  /* not a git checkout — no date */
}
const byName = new Map(); // bare object name -> keys (for embed lookup)
for (const key of schema.keys()) {
  const bare = key.split('.')[1];
  if (!byName.has(bare)) byName.set(bare, []);
  byName.get(bare).push(key);
}

const findings = [];
let chains = 0;
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('.from(')) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(process.cwd(), file);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'from') {
      const table = lit(node.arguments[0]);
      if (table) {
        chains++;
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const sch = schemaOf(node, rel);
        const key = `${sch}.${table}`;
        const obj = schema.get(key);
        const { calls, top } = chainAbove(node);
        const all = calls.concat(followVariable(top, sf));
        if (!obj) {
          if (!knownSchemas.has(sch)) findings.push({ file: rel, line: line + 1, object: key, kind: 'OTHER_SCHEMA', detail: `schema "${sch}" is not in the types file — unverifiable` });
          else findings.push({ file: rel, line: line + 1, object: key, kind: 'MISSING_OBJECT', detail: 'not in generated types' + (typesDate ? ` (types dated ${typesDate})` : '') });
        } else {
          for (const c of all) {
            if (c.name === 'select') {
              const s = lit(c.args[0]);
              if (!s) continue;
              const { columns, embeds } = parseSelect(s);
              for (const col of columns) if (!obj.columns.has(col)) findings.push({ file: rel, line: line + 1, object: key, kind: 'MISSING_COLUMN', detail: `select: ${col}` });
              for (const e of embeds) {
                if (!byName.has(e.name)) {
                  findings.push({ file: rel, line: line + 1, object: key, kind: 'EMBED_UNKNOWN', detail: `embed: ${e.name}(…)` });
                } else {
                  const target = schema.get(byName.get(e.name)[0]);
                  for (const col of parseSelect(e.inner, true).columns) if (!target.columns.has(col)) findings.push({ file: rel, line: line + 1, object: byName.get(e.name)[0], kind: 'MISSING_COLUMN', detail: `embed ${e.name}: ${col}` });
                }
              }
            } else if (FILTER_METHODS.has(c.name)) {
              const col = columnOfFilterArg(lit(c.args[0]));
              if (col && !obj.columns.has(col)) findings.push({ file: rel, line: line + 1, object: key, kind: 'MISSING_COLUMN', detail: `${c.name}: ${col}` });
            } else if (c.name === 'not' || c.name === 'filter') {
              const col = columnOfFilterArg(lit(c.args[0]));
              if (col && !obj.columns.has(col)) findings.push({ file: rel, line: line + 1, object: key, kind: 'MISSING_COLUMN', detail: `${c.name}: ${col}` });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (AS_JSON) {
  console.log(JSON.stringify(findings, null, 1));
  process.exit(findings.length ? 1 : 0);
}

const tables = [...schema.values()].filter((o) => o.kind === 'table').length;
const views = schema.size - tables;
const hard = findings.filter((f) => f.kind !== 'OTHER_SCHEMA').length;
console.log(`schema: ${TYPES}${typesDate ? ` (dated ${typesDate})` : ''} · ${tables} tables · ${views} views · chains checked: ${chains} · findings: ${hard}` + (findings.length - hard ? ` · unverifiable (other schema): ${findings.length - hard}` : ''));
console.log('');
const order = { MISSING_OBJECT: 0, MISSING_COLUMN: 1, EMBED_UNKNOWN: 2, OTHER_SCHEMA: 3 };
for (const f of findings.sort((a, b) => order[a.kind] - order[b.kind] || a.object.localeCompare(b.object) || a.file.localeCompare(b.file))) {
  console.log(`${f.kind.padEnd(15)} ${f.object.padEnd(36)} ${f.file}:${f.line}  ${f.detail}`);
}
if (hard) {
  console.log('');
  console.log('Each MISSING_* is a query PostgREST will reject whole: check whether the error is swallowed (class 10) and whether the types file is older than the object (regenerate the types before filing).');
}
process.exit(hard ? 1 : 0);
