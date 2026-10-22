#!/usr/bin/env node
'use strict';
/**
 * Ghost Impact — a simulation gate before a fix widens a query's result set.
 * Does not query production, send messages, mutate data or deploy anything.
 */
const e = require('./lib/evidence.cjs');

function impact(input) {
  e.requireObject(input, 'input');
  const change = e.text(input.change, 'change');
  const action = e.text(input.action, 'action');
  const before = e.requireObject(input.before, 'before');
  const after = e.requireObject(input.after, 'after');
  const oldCtx = e.requireObject(before.context, 'before.context');
  const newCtx = e.requireObject(after.context, 'after.context');
  for (const key of ['environment', 'role', 'query']) {
    e.text(oldCtx[key], 'before.context.' + key);
    e.text(newCtx[key], 'after.context.' + key);
  }
  const oldIds = e.uniqueStrings(before.ids, 'before.ids');
  const newIds = e.uniqueStrings(after.ids, 'after.ids');
  const dependencies = e.list(input.dependencies, 'dependencies').map((d, i) => {
    e.requireObject(d, 'dependencies[' + i + ']');
    return { id: e.text(d.id, 'dependencies[' + i + '].id'), satisfied: e.boolean(d.satisfied, 'dependencies[' + i + '].satisfied') };
  });
  e.uniqueStrings(dependencies.map(d => d.id), 'dependencies.ids');
  const records = new Map();
  e.list(input.records, 'records').forEach((row, i) => {
    e.requireObject(row, 'records[' + i + ']');
    const id = e.text(row.id, 'records[' + i + '].id');
    if (records.has(id)) throw new TypeError('records contains a duplicate id');
    if (row.stale !== null && row.stale !== undefined) e.boolean(row.stale, 'records[' + i + '].stale');
    if (row.actionable !== null && row.actionable !== undefined) e.boolean(row.actionable, 'records[' + i + '].actionable');
    records.set(id, { stale: row.stale, actionable: row.actionable });
  });

  // All comparisons must refer to the same environment, role and query.
  const sameContext = ['environment', 'role', 'query'].every(k => oldCtx[k] === newCtx[k]);
  const removed = [...oldIds].filter(id => !newIds.has(id));
  const added = [...newIds].filter(id => !oldIds.has(id));
  let staleActionable = 0;
  let newActionable = 0;
  let unknown = 0;
  for (const id of added) {
    const r = records.get(id);
    if (!r || typeof r.stale !== 'boolean' || typeof r.actionable !== 'boolean') {
      unknown++;
      continue;
    }
    if (r.actionable) {
      newActionable++;
      if (r.stale) staleActionable++;
    }
  }
  const blockedDependencies = dependencies.filter(d => !d.satisfied).length;

  let status = 'PASS_PREVIEW';
  let summary = 'No known unsafe newly actionable records in the supplied simulation. This does not authorize deployment.';
  if (!sameContext) {
    status = 'SCOPE_MISMATCH';
    summary = 'Before/after snapshots use different environment, role or query. Do not compare their counts.';
  } else if (blockedDependencies || staleActionable) {
    status = 'BLOCKED';
    summary = 'Unsafe newly actionable records or unresolved dependencies were found. Hold the proposed release.';
  } else if (unknown || removed.length) {
    status = 'REVIEW_REQUIRED';
    summary = 'Incomplete risk classification or removed rows: a safe widening is not proven.';
  }
  const warnings = [
    'Rows marked stale/actionable must be classified using the application canonical predicates and current evidence.',
    'A PASS_PREVIEW is not permission to send, write, merge or deploy; server-side send-time guards remain mandatory.',
    'Counts are based on supplied metadata; no production queries or side effects were performed.'
  ];
  if (!sameContext) warnings.unshift('Environment/role/query mismatch invalidates exposure comparisons.');
  return {
    tool: 'Ghost Impact',
    status,
    safe: status === 'PASS_PREVIEW',
    change,
    action,
    summary,
    metrics: {
      beforeVisible: oldIds.size,
      afterVisible: newIds.size,
      newlyVisible: sameContext ? added.length : null,
      newlyActionable: sameContext ? newActionable : null,
      newlyVisibleStaleActionable: sameContext ? staleActionable : null,
      newlyVisibleUnclassified: sameContext ? unknown : null,
      removedByChange: sameContext ? removed.length : null,
      blockedDependencies
    },
    warnings
  };
}

module.exports = { impact };
if (require.main === module) e.runCli(impact);
