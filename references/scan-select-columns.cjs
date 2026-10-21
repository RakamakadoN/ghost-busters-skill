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
 * question: the script prints the file's last git commit date when it can.
 *
 * Findings per `.from('<object>')` chain:
 *   MISSING_OBJECT   the table/view is not in the schema
 *   MISSING_COLUMN   a column in .select('…') or in a filter/order is not in the object
 *   EMBED_UNKNOWN    an embedded relation `rel(...)` names no table/view (FK-name embeds are skipped)
 *   UNSUPPORTED      a select item the parser does not understand (quoted identifiers,
 *                    spaces, unbalanced parentheses) — check it by hand, it is NOT a missing column
 *   UNKNOWN          the chain's variable is bound to more than one query; the methods
 *                    reached through it are not attributed (only the direct chain was checked)
 *   OTHER_SCHEMA     the object lives in a schema the types file does not cover — unverifiable
 *
 * Understood select syntax: `col`, `alias:col`, `col::cast`, `col->path`,
 * `col->>path`, `rel(cols)`, `alias:rel(cols)`, `rel!hint(cols)`, `...rel(cols)`,
 * `rel(count)`, `*`. Anything else is UNSUPPORTED.
 *
 * This is a static scan, not a proof: a finding is a query to check, and the
 * types file may simply be older than the object.
 *
 * Usage:
 *   node scan-select-columns.cjs [srcDir=src] [--types src/types/database.types.ts] [--json]
 *        [--schema-for <path-substring>=<schema>]...   files whose client is scoped to another
 *                                                      schema by a helper the chain cannot show
 *
 * Exit code: 1 when a hard finding (MISSING_OBJECT, MISSING_COLUMN, EMBED_UNKNOWN)
 * exists, else 0 — identical in text and JSON mode. UNSUPPORTED, UNKNOWN and
 * OTHER_SCHEMA never fail the run. The types directory itself is skipped (it may hold a
 * deliberate `no_such_column` compile-time guard).
 *
 * Requires `typescript` resolvable from the current working directory.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadTypescript, walkSources, literalText, isTableFrom, explicitSchema, chainAbove, followVariable } = require('./lib/chains.cjs');

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

const ts = loadTypescript();

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

// ── PostgREST select-list parsing ──────────────────────────────────────────
const AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);
const ITEM_RE = /^[A-Za-z0-9_:>()!.*,\-]+$/;

function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return null; // unbalanced
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (depth !== 0) return null;
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Strip `alias:` (a single colon that is not part of `::`). */
function stripAlias(item) {
  const m = item.match(/^([A-Za-z0-9_]+):(?!:)(.+)$/);
  return m ? m[2] : item;
}

/** Column name of a select item or filter argument: drop `::cast` and `->`/`->>` paths. */
function baseColumn(s) {
  return s.split('->')[0].split('::')[0];
}

/**
 * Parse one select string. Returns { columns, embeds, unsupported } where
 * unsupported lists items the parser refuses rather than guesses at.
 */
function parseSelect(s, insideEmbed = false) {
  const columns = [];
  const embeds = [];
  const unsupported = [];
  const items = splitTopLevel(s.replace(/\s+/g, ''));
  if (items === null) return { columns, embeds, unsupported: [s] };
  for (const raw of items) {
    if (!ITEM_RE.test(raw)) {
      unsupported.push(raw);
      continue;
    }
    const item = raw.replace(/^\.\.\./, ''); // spread embed `...rel(cols)`
    const paren = item.indexOf('(');
    if (paren >= 0) {
      let head = stripAlias(item.slice(0, paren));
      const inner = item.slice(paren + 1, item.lastIndexOf(')'));
      head = head.replace(/^!/, '').split('!')[0]; // rel!fk / rel!inner
      embeds.push({ name: head, inner });
      continue;
    }
    if (item === '*') continue;
    const col = baseColumn(stripAlias(item));
    if (insideEmbed && AGGREGATES.has(col)) continue;
    if (col.includes('.')) {
      unsupported.push(raw);
      continue;
    }
    if (col && col !== '*') columns.push(col);
  }
  return { columns, embeds, unsupported };
}

const FILTER_METHODS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'imatch', 'is', 'in', 'contains', 'containedBy', 'order', 'textSearch', 'rangeGt', 'rangeLt', 'overlaps', 'not', 'filter']);

function columnOfFilterArg(s) {
  if (!s) return null;
  const col = baseColumn(s);
  if (col.includes('.')) return null; // embedded.column — skip
  return col;
}

// ── scan ───────────────────────────────────────────────────────────────────
const schema = loadSchema(TYPES);
const knownSchemas = new Set([...schema.keys()].map((k) => k.split('.')[0]));
const byName = new Map(); // bare object name -> keys (for embed lookup)
for (const key of schema.keys()) {
  const bare = key.split('.')[1];
  if (!byName.has(bare)) byName.set(bare, []);
  byName.get(bare).push(key);
}
let typesDate = null;
try {
  typesDate = execFileSync('git', ['log', '-1', '--format=%cs', '--', TYPES], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
} catch {
  /* not a git checkout — no date */
}

const findings = [];
let chains = 0;
for (const file of walkSources(srcDir, [path.dirname(TYPES)])) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(process.cwd(), file);
  const push = (line, object, kind, detail) => findings.push({ file: rel, line, object, kind, detail });
  const visit = (node) => {
    if (isTableFrom(ts, node)) {
      chains++;
      const table = literalText(ts, node.arguments[0]);
      const { line: l0 } = sf.getLineAndCharacterOfPosition(node.expression.name.getStart(sf));
      const line = l0 + 1;
      const rule = SCHEMA_FOR.find((r) => rel.includes(r.sub));
      const sch = explicitSchema(ts, node) || (rule ? rule.sch : 'public');
      const key = `${sch}.${table}`;
      const obj = schema.get(key);
      const { calls, top } = chainAbove(ts, node);
      const viaVar = followVariable(ts, top, sf, node);
      // Direct chain parts are always checked. Methods reached through the
      // variable are checked only when the variable is bound to this one
      // query; after a rebinding they may belong to another query, so they
      // are reported as UNKNOWN instead of being attributed to this table.
      const all = viaVar.rebound ? calls : calls.concat(viaVar.calls);
      if (viaVar.rebound && viaVar.calls.length) {
        const names = [...new Set(viaVar.calls.map((c) => c.name))].join(', ');
        push(line, key, 'UNKNOWN', `variable "${viaVar.ident}" is bound to more than one query; later calls not attributed: ${names}`);
      }
      if (!obj) {
        if (!knownSchemas.has(sch)) push(line, key, 'OTHER_SCHEMA', `schema "${sch}" is not in the types file — unverifiable`);
        else push(line, key, 'MISSING_OBJECT', 'not in generated types' + (typesDate ? ` (types dated ${typesDate})` : ''));
      } else {
        for (const c of all) {
          if (c.name === 'select') {
            const s = literalText(ts, c.args[0]);
            if (!s) continue;
            const { columns, embeds, unsupported } = parseSelect(s);
            for (const u of unsupported) push(line, key, 'UNSUPPORTED', `select item not understood: ${u}`);
            for (const col of columns) if (!obj.columns.has(col)) push(line, key, 'MISSING_COLUMN', `select: ${col}`);
            for (const e of embeds) {
              if (!byName.has(e.name)) {
                push(line, key, 'EMBED_UNKNOWN', `embed: ${e.name}(…)`);
                continue;
              }
              const targetKey = byName.get(e.name)[0];
              const target = schema.get(targetKey);
              const inner = parseSelect(e.inner, true);
              for (const u of inner.unsupported) push(line, targetKey, 'UNSUPPORTED', `embed ${e.name}: item not understood: ${u}`);
              for (const col of inner.columns) if (!target.columns.has(col)) push(line, targetKey, 'MISSING_COLUMN', `embed ${e.name}: ${col}`);
            }
          } else if (FILTER_METHODS.has(c.name)) {
            const col = columnOfFilterArg(literalText(ts, c.args[0]));
            if (col && !obj.columns.has(col)) push(line, key, 'MISSING_COLUMN', `${c.name}: ${col}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const HARD = new Set(['MISSING_OBJECT', 'MISSING_COLUMN', 'EMBED_UNKNOWN']);
const hard = findings.filter((f) => HARD.has(f.kind)).length;
const exitCode = hard ? 1 : 0;

if (AS_JSON) {
  console.log(JSON.stringify(findings, null, 1));
  process.exit(exitCode);
}

const tables = [...schema.values()].filter((o) => o.kind === 'table').length;
const views = schema.size - tables;
const soft = findings.length - hard;
console.log(`schema: ${TYPES}${typesDate ? ` (dated ${typesDate})` : ''} · ${tables} tables · ${views} views · chains checked: ${chains} · findings: ${hard}` + (soft ? ` · to check by hand (unsupported / unknown / other schema): ${soft}` : ''));
console.log('');
const order = { MISSING_OBJECT: 0, MISSING_COLUMN: 1, EMBED_UNKNOWN: 2, UNKNOWN: 3, UNSUPPORTED: 4, OTHER_SCHEMA: 5 };
for (const f of findings.sort((a, b) => order[a.kind] - order[b.kind] || a.object.localeCompare(b.object) || a.file.localeCompare(b.file))) {
  console.log(`${f.kind.padEnd(15)} ${f.object.padEnd(36)} ${f.file}:${f.line}  ${f.detail}`);
}
if (hard) {
  console.log('');
  console.log('Each MISSING_* is a query PostgREST will reject whole: check whether the error is swallowed (class 10) and whether the types file is older than the object (regenerate the types before filing). Static scan — a finding is a query to check, not a proven bug.');
}
process.exit(exitCode);
