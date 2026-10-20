'use strict';
/**
 * Shared helpers for the two scanners: walk supabase-js query chains with the
 * TypeScript compiler API.
 *
 * What the analysis can and cannot see (keep this honest in reports):
 *  - It sees one file at a time. A query built in one function and bounded in
 *    another is UNKNOWN to it.
 *  - It follows a chain stored in a variable within the enclosing function
 *    (or the file, at top level). Calls on that variable inside `if`, ternary,
 *    `&&`/`||`/`??`, `switch`, loops, `try/catch` or nested callbacks are
 *    CONDITIONAL: they may not run on every path.
 *  - A variable rebound to a different `.from(` chain makes every chain bound
 *    to that name UNKNOWN: the scanner does not do dataflow.
 *  - `.range(a, b)` with two numeric literals is one page, not pagination;
 *    `.range()` with computed bounds is assumed to be a paging loop — the
 *    scanner does not prove that every page is loaded.
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
function isTableFrom(ts, node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'from') return false;
  if (!literalText(ts, node.arguments[0])) return false;
  const recv = node.expression.expression;
  if (ts.isPropertyAccessExpression(recv) && ['storage', 'realtime', 'channel'].includes(recv.name.text)) return false;
  let root = recv;
  while (ts.isPropertyAccessExpression(root) || ts.isCallExpression(root) || ts.isNonNullExpression(root) || ts.isParenthesizedExpression(root)) {
    root = root.expression;
  }
  if (ts.isIdentifier(root) && ['Array', 'Buffer', 'Uint8Array', 'Observable', 'Readable'].includes(root.text)) return false;
  return true;
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
 * If the chain is stored in a variable, find `<ident>.method(...)` calls in the
 * enclosing function, marking each as conditional or not, and detect rebinding
 * of the variable to another `.from(` chain.
 * Returns { ident, calls, rebound }.
 */
function followVariable(ts, top, sf, fromCall) {
  let p = top.parent;
  while (p && (ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isParenthesizedExpression(p) || ts.isAwaitExpression(p))) p = p.parent;
  let ident = null;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) ident = p.name.text;
  else if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(p.left)) ident = p.left.text;
  if (!ident) return { ident: null, calls: [], rebound: false };

  // Scope: for a `const/let` declaration — its enclosing block (sibling blocks
  // may reuse the name without rebinding it); for an assignment to a variable
  // declared elsewhere — the enclosing function (conservative).
  const isDeclaration = ts.isVariableDeclaration(p);
  let scope = p;
  while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope) && !(isDeclaration && ts.isBlock(scope))) scope = scope.parent;
  scope = scope || sf;
  const blockOf = (n) => {
    let s = n;
    while (s && !ts.isBlock(s) && !ts.isFunctionLike(s) && !ts.isSourceFile(s)) s = s.parent;
    return s;
  };

  const rootsIn = (n) => {
    if (!n) return false;
    if (ts.isIdentifier(n)) return n.text === ident;
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

  const calls = [];
  let rebound = false;
  const shared = ancestorsUpTo(fromCall, scope);
  const visit = (n) => {
    // Rebinding: `ident = <chain that does not derive from ident>` or a second declaration of the same name in this scope.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && n.left.text === ident) {
      if (!rootsIn(n.right) && containsOtherFrom(n.right)) rebound = true;
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === ident && n !== p && n.initializer && containsOtherFrom(n.initializer)) {
      if (blockOf(n) === blockOf(p)) rebound = true; // same block: a genuine redeclaration/shadow of the same name
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && rootsIn(n.expression.expression)) {
      calls.push({ name: n.expression.name.text, args: n.arguments, node: n, conditional: isConditionalBetween(ts, n, scope, shared) });
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return { ident, calls, rebound };
}

module.exports = { loadTypescript, walkSources, literalText, isTableFrom, explicitSchema, chainAbove, followVariable, isConditionalBetween };
