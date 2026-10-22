#!/usr/bin/env node
'use strict';
/**
 * Ghost Pulse — read-only analysis of separately captured pipeline evidence.
 * No network access. No current environment is presumed to be production.
 *
 * node references/ghost-pulse.cjs --input examples/ghost-pulse.json --json --strict
 */
const e = require('./lib/evidence.cjs');

function pulse(input) {
  e.requireObject(input, 'input');
  const pipeline = e.text(input.pipeline, 'pipeline');
  const environmentId = e.text(input.environmentId, 'environmentId');
  const w = e.requireObject(input.window, 'window');
  const start = e.timestamp(w.start, 'window.start');
  const end = e.timestamp(w.end, 'window.end');
  const observedAt = e.timestamp(input.observedAt, 'observedAt');
  if (start >= end || observedAt < end) throw new TypeError('window must end no later than observedAt and after its start');
  const activityExpected = e.boolean(input.activityExpected, 'activityExpected');
  const minSuccessfulRuns = e.positiveInteger(input.minSuccessfulRuns ?? 3, 'minSuccessfulRuns');
  const minSnapshots = e.positiveInteger(input.minSnapshots ?? 3, 'minSnapshots');
  if (minSuccessfulRuns < 2 || minSnapshots < 2) throw new TypeError('at least two successful runs and two snapshots are required');
  const maxSnapshotAgeMinutes = e.positiveInteger(input.maxSnapshotAgeMinutes ?? 120, 'maxSnapshotAgeMinutes');
  const minSnapshotSpanMinutes = e.nonNegative(input.minSnapshotSpanMinutes ?? 30, 'minSnapshotSpanMinutes');
  const minPostUpstreamLagMinutes = e.nonNegative(input.minPostUpstreamLagMinutes ?? 30, 'minPostUpstreamLagMinutes');

  function within(value, name) {
    const time = e.timestamp(value, name);
    if (time < start || time > end) throw new TypeError(name + ' is outside window');
    return time;
  }
  const runs = e.list(input.runs, 'runs').map((run, i) => {
    e.requireObject(run, 'runs[' + i + ']');
    return {
      at: within(run.at, 'runs[' + i + '].at'),
      ok: e.boolean(run.ok, 'runs[' + i + '].ok'),
      rowsImported: e.nonNegative(run.rowsImported, 'runs[' + i + '].rowsImported')
    };
  });
  const snapshots = e.list(input.sourceSnapshots, 'sourceSnapshots').map((item, i) => {
    e.requireObject(item, 'sourceSnapshots[' + i + ']');
    return {
      at: within(item.at, 'sourceSnapshots[' + i + '].at'),
      fingerprint: e.text(item.fingerprint, 'sourceSnapshots[' + i + '].fingerprint'),
      rows: e.nonNegative(item.rows, 'sourceSnapshots[' + i + '].rows')
    };
  });
  const upstream = e.list(input.upstreamEvents, 'upstreamEvents').map((item, i) => {
    e.requireObject(item, 'upstreamEvents[' + i + ']');
    return {
      at: within(item.at, 'upstreamEvents[' + i + '].at'),
      count: e.nonNegative(item.count, 'upstreamEvents[' + i + '].count')
    };
  });
  const downstream = e.list(input.downstreamEvents, 'downstreamEvents').map((item, i) => {
    e.requireObject(item, 'downstreamEvents[' + i + ']');
    return {
      at: within(item.at, 'downstreamEvents[' + i + '].at'),
      count: e.nonNegative(item.count, 'downstreamEvents[' + i + '].count')
    };
  });
  const successfulRuns = runs.filter(r => r.ok);
  const failedRuns = runs.length - successfulRuns.length;
  const successfulZeroRuns = successfulRuns.filter(r => r.rowsImported === 0).length;
  const imported = successfulRuns.reduce((sum, r) => sum + r.rowsImported, 0);
  const up = upstream.reduce((sum, row) => sum + row.count, 0);
  const down = downstream.reduce((sum, row) => sum + row.count, 0);
  const fingerprints = new Set(snapshots.map(s => s.fingerprint));
  const latest = snapshots.reduce((a, b) => !a || b.at > a.at ? b : a, null);
  const earliest = snapshots.reduce((a, b) => !a || b.at < a.at ? b : a, null);
  const distinctCaptureTimes = new Set(snapshots.map(s => s.at)).size;
  const sourceSnapshotSpanMinutes = earliest && latest ? Math.round((latest.at - earliest.at) / 60000) : 0;
  const latestPositiveUpstream = upstream.filter(row => row.count > 0).reduce((a, b) => !a || b.at > a.at ? b : a, null);
  const postUpstreamSuccessRuns = latestPositiveUpstream
    ? successfulRuns.filter(r => r.at >= latestPositiveUpstream.at + minPostUpstreamLagMinutes * 60000).length
    : 0;
  const latestAgeMinutes = latest ? Math.round((observedAt - latest.at) / 60000) : null;
  const snapshotsIndependent = distinctCaptureTimes >= minSnapshots && sourceSnapshotSpanMinutes >= minSnapshotSpanMinutes;
  const sourceStable = snapshotsIndependent && fingerprints.size === 1;
  const sourceOld = latestAgeMinutes !== null && latestAgeMinutes > maxSnapshotAgeMinutes;
  const enoughSuccess = successfulRuns.length >= minSuccessfulRuns;
  const evidenceComplete = upstream.length > 0 && downstream.length > 0 &&
    snapshots.length >= minSnapshots && snapshotsIndependent && enoughSuccess &&
    (up === 0 || postUpstreamSuccessRuns > 0);

  let status = 'INSUFFICIENT_EVIDENCE';
  let summary = 'Cannot establish a pipeline anomaly from the supplied evidence.';
  if (!activityExpected) {
    status = 'NO_ACTIVITY_EXPECTED';
    summary = 'This window is not expected to have business activity; no failure is inferred.';
  } else if (successfulRuns.length === 0 && failedRuns > 0) {
    status = 'EXECUTION_FAILURE';
    summary = 'All observed runs failed; this is an explicit failure, not a silent success.';
  } else if (evidenceComplete && imported === 0 && down === 0 && up > 0 &&
      successfulZeroRuns >= minSuccessfulRuns) {
    status = sourceStable ? 'SUSPECTED_SILENT_FAILURE' : 'SUSPECTED_PIPELINE_MISMATCH';
    summary = sourceStable
      ? 'Successful zero-import runs and identical source snapshots coexist with upstream activity and no downstream progress.'
      : 'Successful zero-import runs coexist with upstream activity and no downstream progress; source snapshots changed.';
  } else if (imported > 0 || down > 0) {
    status = 'PROGRESS_OBSERVED';
    summary = 'Some progress is visible; this does not prove completeness or reconciliation.';
  } else if (evidenceComplete && up === 0) {
    status = 'NO_INDEPENDENT_ACTIVITY';
    summary = 'No upstream business activity is recorded, so zero imports alone are not a failure.';
  }
  const warnings = [
    'Independent upstream events are an activity signal, not necessarily a one-to-one match for downstream records.',
    'A successful execution and an identical snapshot do not alone prove the source is broken.',
    'No production connectivity or side effects: results apply only to supplied records and time window.'
  ];
  if (sourceOld) warnings.unshift('Latest supplied source snapshot exceeds maxSnapshotAgeMinutes.');
  if (up > 0 && postUpstreamSuccessRuns === 0) warnings.unshift('No successful run occurred after the independent upstream activity plus minPostUpstreamLagMinutes.');
  if (!snapshotsIndependent) warnings.unshift('Distinct source observations and minimum span are needed; duplicate captures do not prove a freeze.');
  if (failedRuns) warnings.push('Some runs explicitly failed and require separate triage.');
  return {
    tool: 'Ghost Pulse',
    status,
    safe: !status.startsWith('SUSPECTED_') && status !== 'EXECUTION_FAILURE' && status !== 'INSUFFICIENT_EVIDENCE',
    pipeline,
    environmentId,
    observedAt: input.observedAt,
    window: w,
    summary,
    metrics: {
      totalRuns: runs.length,
      successfulRuns: successfulRuns.length,
      failedRuns,
      successfulZeroRuns,
      importedRows: imported,
      distinctSourceFingerprints: fingerprints.size,
      sourceSnapshots: snapshots.length,
      distinctCaptureTimes,
      sourceSnapshotSpanMinutes,
      minSnapshotSpanMinutes,
      postUpstreamSuccessRuns,
      minPostUpstreamLagMinutes,
      sourceStable,
      latestSnapshotAgeMinutes: latestAgeMinutes,
      sourceSnapshotStale: sourceOld,
      independentUpstreamActivity: up,
      downstreamRowsCreated: down
    },
    evidence: { activityExpected, sufficientForDecision: evidenceComplete },
    warnings
  };
}

module.exports = { pulse };
if (require.main === module) e.runCli(pulse);
