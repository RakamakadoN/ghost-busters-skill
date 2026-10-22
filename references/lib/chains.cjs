'use strict';
/**
 * Shared helpers for the two scanners: walk supabase-js query chains with the
 * TypeScript compiler API.
 *
 * What the analysis can and cannot see (keep this honest in reports):
 *  - It sees one file at a time. A query built in one function and bounded in
 *    another is UNKNOWN to it.
 *  - It follows a chain stored in a variable by resolving each later
 *    `name.method(...)` to the variable's DECLARATION through lexical scopes
 *    (blocks, functions and their parameters, `for` heads, `catch` clauses,
 *    destructuring). A shadowing declaration in an inner block or callback is
 *    a different variable; a closure that reads the outer variable without
 *    shadowing it still counts (as CONDITIONAL, since the callback may never
 *    run). `var` hoisting and globals are not modelled: a name that resolves
 *    to no declaration is treated as unknown.
 *  - Calls on the variable inside `if`, ternary, `&&`/`||`/`??`, `switch`,
 *    loops, `try/catch` or nested callbacks — relative to where the chain
 *    itself sits — are CONDITIONAL: they may not run on every path.
 *  - A variable bound to two different `.from(` chains (rebinding, or
 *    assignment in several branches) makes every chain bound to it UNKNOWN:
 *    the scanner does no dataflow and will not guess which query a later
 *    method applies to.
 *  - `.range(a, b)` with two numeric literals is one page, not pagination;
 *    `.range()` with computed bounds does not prove page iteration — the
 *    row-cap scanner flags it for manual completeness review.
 *  - `.storage.from(...)` and `Array.from(...)` are not table reads.
 */

const fs = require('fs');
const path = require('path');

function loadTypescript() {
  try {
    return require(require.resolve('typescript', { paths: [process.cwd()] }));
  } catch {
    console.error('typescript not found from ' + process.cwd() + ' — run from a project root that has it installed');
    process.exit(2);
  }
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

/** Yield every .ts/.tsx source file under dir, skipping tests and build output. */
function* walkSources(dir, skipDirs = []) {
  const skip = new Set(skipDirs.map((d) => path.resolve(d)));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skip.has(path.resolve(full))) continue;
      yield* walkSources(full, skipDirs);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) yield full;
  }
}

function literalText(ts, node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** Is this `.from(...)` call a supabase-js table read, and not storage / Array.from / another API? */
function fromReceiverRoot(ts, node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'from') return null;
  let root = node.expression.expression;
  while (ts.isPropertyAccessExpression(root) || ts.isCallExpression(root) || ts.isNonNullExpression(root) || ts.isParenthesizedExpression(root)) root = root.expression;
  return ts.isIdentifier(root) ? root.text : null;
}

function isTableFromCandidate(ts, node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'from') return false;
  const recv = node.expression.expression;
  if (ts.isPropertyAccessExpression(recv) && ['storage', 'realtime', 'channel'].includes(recv.name.text)) return false;
  let root = recv;
  while (ts.isPropertyAccessExpression(root) || ts.isCallExpression(root) || ts.isNonNullExpression(root) || ts.isParenthesizedExpression(root)) {
    root = root.expression;
  }
  if (ts.isIdentifier(root) && ['Array', 'Buffer', 'Uint8Array', 'Observable', 'Readable'].includes(root.text)) return false;
  return true;
}

function isTableFrom(ts, node) {
  return isTableFromCandidate(ts, node) && !!literalText(ts, node.arguments[0]);
}

function isDynamicTableFrom(ts, node) {
  return isTableFromCandidate(ts, node) && node.arguments.length > 0 && literalText(ts, node.arguments[0]) === null;
}

/** The schema a chain targets: `.schema('x').from(...)`, else null (caller decides the default). */
function explicitSchema(ts, fromCall) {
  const recv = fromCall.expression.expression;
  if (ts.isCallExpression(recv) && ts.isPropertyAccessExpression(recv.expression) && recv.expression.name.text === 'schema') {
    return literalText(ts, recv.arguments[0]);
  }
  return null;
}

/** Collect method calls applied directly on top of the `.from()` call in one expression. */
function chainAbove(ts, node) {
  const calls = [];
  let cur = node;
  let top = node;
  for (;;) {
    const p = cur.parent;
    if (!p) break;
    if (ts.isPropertyAccessExpression(p) && p.expression === cur) {
      const gp = p.parent;
      if (gp && ts.isCallExpression(gp) && gp.expression === p) {
        calls.push({ name: p.name.text, args: gp.arguments, node: gp, conditional: false });
        cur = gp;
        top = gp;
        continue;
      }
      break;
    }
    if (ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isParenthesizedExpression(p) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(p))) {
      cur = p;
      continue;
    }
    break;
  }
  return { calls, top };
}

// ── lexical binding resolution ─────────────────────────────────────────────

/** Names declared by a binding name node (identifier or destructuring pattern), as [name, declNode] pairs. */
function namesOf(ts, nameNode, declNode, out) {
  if (!nameNode) return;
  if (ts.isIdentifier(nameNode)) out.push([nameNode.text, declNode]);
  else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
    for (const el of nameNode.elements) if (ts.isBindingElement(el)) namesOf(ts, el.name, declNode, out);
  }
}

/** The declaration of `name` made directly by `scopeNode`, or null. */
function declarationIn(ts, scopeNode, name) {
  const found = [];
  const fromList = (list) => {
    for (const d of list.declarations) namesOf(ts, d.name, d, found);
  };
  if (ts.isSourceFile(scopeNode) || ts.isBlock(scopeNode) || ts.isModuleBlock(scopeNode)) {
    for (const st of scopeNode.statements) {
      if (ts.isVariableStatement(st)) fromList(st.declarationList);
      else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) found.push([st.name.text, st]);
      else if (ts.isImportDeclaration(st) && st.importClause) {
        const ic = st.importClause;
        if (ic.name) found.push([ic.name.text, ic]);
        if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) for (const s of ic.namedBindings.elements) found.push([s.name.text, s]);
        if (ic.namedBindings && ts.isNamespaceImport(ic.namedBindings)) found.push([ic.namedBindings.name.text, ic.namedBindings]);
      }
    }
  }
  if (ts.isFunctionLike(scopeNode)) {
    for (const prm of scopeNode.parameters || []) namesOf(ts, prm.name, prm, found);
    if (scopeNode.name && ts.isIdentifier(scopeNode.name) && ts.isFunctionExpression(scopeNode)) found.push([scopeNode.name.text, scopeNode]);
  }
  if ((ts.isForStatement(scopeNode) || ts.isForOfStatement(scopeNode) || ts.isForInStatement(scopeNode)) && scopeNode.initializer && ts.isVariableDeclarationList(scopeNode.initializer)) {
    fromList(scopeNode.initializer);
  }
  if (ts.isCatchClause(scopeNode) && scopeNode.variableDeclaration) namesOf(ts, scopeNode.variableDeclaration.name, scopeNode.variableDeclaration, found);
  const hit = found.find(([n]) => n === name);
  return hit ? hit[1] : null;
}

function isScopeNode(ts, n) {
  return ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n) || ts.isFunctionLike(n) || ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isCatchClause(n);
}

/** The declaration node an identifier reference resolves to through lexical scopes, or null. */
function resolveBinding(ts, identNode) {
  const name = identNode.text;
  let cur = identNode.parent;
  while (cur) {
    if (isScopeNode(ts, cur)) {
      const d = declarationIn(ts, cur, name);
      if (d) return d;
    }
    cur = cur.parent;
  }
  return null;
}

/** The scope node that owns a declaration (its enclosing block / function / file). */
function scopeOfDeclaration(ts, decl) {
  let s = decl.parent;
  while (s && !isScopeNode(ts, s)) s = s.parent;
  return s;
}

/** Ancestors of `node` up to (not including) `scope`, as a Set. */
function ancestorsUpTo(node, scope) {
  const set = new Set();
  let cur = node.parent;
  while (cur && cur !== scope) {
    set.add(cur);
    cur = cur.parent;
  }
  return set;
}

/**
 * Walk from `node` up to (not including) `scope`; true if any ancestor makes
 * execution conditional RELATIVE to the `.from()` call: a construct that also
 * encloses the chain itself (the same `if` branch, the same loop body) is the
 * same path and does not count.
 */
function isConditionalBetween(ts, node, scope, shared = new Set()) {
  let cur = node;
  while (cur && cur !== scope) {
    const p = cur.parent;
    if (!p) break;
    if (shared.has(p)) {
      cur = p;
      continue;
    }
    if (ts.isIfStatement(p) && (p.thenStatement === cur || p.elseStatement === cur)) return true;
    if (ts.isConditionalExpression(p) && (p.whenTrue === cur || p.whenFalse === cur)) return true;
    if (ts.isBinaryExpression(p) && p.right === cur) {
      const k = p.operatorToken.kind;
      if (k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return true;
    }
    if (ts.isCaseClause(p) || ts.isDefaultClause(p)) return true;
    if (ts.isCatchClause(p)) return true;
    if (ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p)) {
      if (p.statement === cur) return true;
    }
    if (ts.isFunctionLike(p) && p !== scope) return true; // a nested callback may never run
    cur = p;
  }
  return false;
}

/**
 * If the chain is stored in a variable, find the `<var>.method(...)` calls
 * that resolve to THAT variable's declaration, mark each as conditional or
 * not, and detect rebinding of the variable to another `.from(` chain.
 * Returns { ident, calls, rebound }. `rebound` means: do not attribute the
 * later calls to this chain — they may belong to another query.
 */
function followVariable(ts, top, sf, fromCall) {
  let p = top.parent;
  while (p && (ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isParenthesizedExpression(p) || ts.isAwaitExpression(p))) p = p.parent;
  let ident = null;
  let binding = null;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
    ident = p.name.text;
    binding = p;
  } else if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(p.left)) {
    ident = p.left.text;
    binding = resolveBinding(ts, p.left);
    if (!binding) return { ident, calls: [], rebound: true }; // assigned to a name we cannot resolve (global, var hoisting) — unknown
  }
  if (!ident) return { ident: null, calls: [], rebound: false };

  const scope = scopeOfDeclaration(ts, binding) || sf;

  // Does this expression bottom out in OUR variable (same declaration)?
  const rootsIn = (n) => {
    if (!n) return false;
    if (ts.isIdentifier(n)) return n.text === ident && resolveBinding(ts, n) === binding;
    if (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n)) return rootsIn(n.expression);
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isAwaitExpression(n)) return rootsIn(n.expression);
    if (ts.isConditionalExpression(n)) return rootsIn(n.whenTrue) || rootsIn(n.whenFalse);
    return false;
  };
  const containsOtherFrom = (n) => {
    let found = false;
    const v = (x) => {
      if (found) return;
      if (x !== fromCall && isTableFrom(ts, x)) {
        found = true;
        return;
      }
      ts.forEachChild(x, v);
    };
    v(n);
    return found;
  };

  const executions = [];
  const isBoundReference = (n) => {
    while (n && (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n))) n = n.expression;
    return !!n && ts.isIdentifier(n) && n.text === ident && resolveBinding(ts, n) === binding;
  };
  const calls = [];
  let rebound = false;
  // The declaration's own initializer, when our chain is an assignment elsewhere, may hold another query.
  if (ts.isVariableDeclaration(binding) && binding !== p && binding.initializer && !rootsIn(binding.initializer) && containsOtherFrom(binding.initializer)) rebound = true;
  const shared = ancestorsUpTo(fromCall, scope);
  const visit = (n) => {
    // Supabase's thenable executes on await/.then; a later limit cannot affect that request.
    if (ts.isAwaitExpression(n) && isBoundReference(n.expression) && n.getStart(sf) > fromCall.getStart(sf)) {
      executions.push(n.getStart(sf));
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
        ['then', 'catch', 'finally'].includes(n.expression.name.text) &&
        isBoundReference(n.expression.expression) && n.getStart(sf) > fromCall.getStart(sf)) {
      executions.push(n.getStart(sf));
    }
    if (n !== p && ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && n.left.text === ident && resolveBinding(ts, n.left) === binding) {
      if (!rootsIn(n.right) && containsOtherFrom(n.right)) rebound = true;
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && rootsIn(n.expression.expression)) {
      calls.push({ name: n.expression.name.text, args: n.arguments, node: n, conditional: isConditionalBetween(ts, n, scope, shared) });
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return { ident, calls, rebound, executions };
}

module.exports = { loadTypescript, walkSources, literalText, isTableFrom, isDynamicTableFrom, fromReceiverRoot, explicitSchema, chainAbove, followVariable, isConditionalBetween, resolveBinding };
