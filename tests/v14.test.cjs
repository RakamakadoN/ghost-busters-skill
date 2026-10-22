'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { pulse } = require('../references/ghost-pulse.cjs');
const { impact } = require('../references/ghost-impact.cjs');
const { release } = require('../references/ghost-release.cjs');

const root = path.resolve(__dirname, '..');
const time = (hour) => '2026-10-22T' + String(hour).padStart(2, '0') + ':00:00Z';
function pulseInput() {
  return {
    pipeline: 'example-order-import',
    observedAt: time(16),
    window: { start: '2026-10-20T00:00:00Z', end: time(16) },
    activityExpected: true,
    minSuccessfulRuns: 3,
    minSnapshots: 3,
    maxSnapshotAgeMinutes: 120,
    runs: [10, 11, 12, 13].map(h => ({ at: time(h), ok: true, rowsImported: 0 })),
    sourceSnapshots: [13, 14, 15].map(h => ({ at: time(h), fingerprint: 'same-hash', rows: 1347 })),
    upstreamEvents: [{ at: time(12), count: 91 }],
    downstreamEvents: [{ at: time(12), count: 0 }]
  };
}
function impactInput() {
  const context = { environment: 'fixture', role: 'operator', query: 'reminders' };
  return {
    change: 'Fix truncated queue',
    action: 'bulk-message',
    before: { context, ids: ['visible'] },
    after: { context: { ...context }, ids: ['visible', 'new1', 'new2'] },
    records: [
      { id: 'new1', stale: true, actionable: true },
      { id: 'new2', stale: false, actionable: true }
    ],
    dependencies: [{ id: 'clean-stale-drafts', satisfied: false }]
  };
}
function releaseInput() {
  return {
    change: 'Example PR',
    expectedMergeSha: 'a1b2c3',
    observedAt: time(16),
    maxSmokeAgeMinutes: 120,
    pullRequest: { merged: true, mergeSha: 'a1b2c3', evidenceRef: 'fixture://pr' },
    main: { containsMergeSha: true, evidenceRef: 'fixture://main' },
    ci: { requiredChecksPassed: true, evidenceRef: 'fixture://ci' },
    deployment: { sha: 'deployed987', containsMergeSha: true, evidenceRef: 'fixture://deployment' },
    migration: { required: false },
    smoke: { testedDeploymentSha: 'deployed987', passed: true, observedAt: time(15), evidenceRef: 'fixture://smoke' }
  };
}

test('pulse: green execution with a frozen source and independent business activity is suspected, not proven', () => {
  const r = pulse(pulseInput());
  assert.equal(r.status, 'SUSPECTED_SILENT_FAILURE');
  assert.equal(r.safe, false);
  assert.equal(r.metrics.successfulRuns, 4);
  assert.equal(r.metrics.importedRows, 0);
  assert.equal(r.metrics.distinctSourceFingerprints, 1);
  assert.equal(r.metrics.independentUpstreamActivity, 91);
  assert.match(r.warnings.join(' '), /not necessarily a one-to-one match/);
});
test('pulse: progress does not prove completeness', () => {
  const x = pulseInput();
  x.downstreamEvents[0].count = 2;
  const r = pulse(x);
  assert.equal(r.status, 'PROGRESS_OBSERVED');
  assert.match(r.summary, /does not prove completeness/);
});
test('pulse: source changed yet independent business did not reach downstream', () => {
  const x = pulseInput();
  x.sourceSnapshots[2].fingerprint = 'changed';
  assert.equal(pulse(x).status, 'SUSPECTED_PIPELINE_MISMATCH');
});
test('pulse: no upstream activity is not a silent failure', () => {
  const x = pulseInput();
  x.upstreamEvents[0].count = 0;
  assert.equal(pulse(x).status, 'NO_INDEPENDENT_ACTIVITY');
});
test('pulse: activity not expected is not a silent failure', () => {
  const x = pulseInput();
  x.activityExpected = false;
  assert.equal(pulse(x).status, 'NO_ACTIVITY_EXPECTED');
});
test('pulse: missing independent activity evidence fails closed', () => {
  const x = pulseInput();
  x.upstreamEvents = [];
  assert.equal(pulse(x).status, 'INSUFFICIENT_EVIDENCE');
});
test('pulse: all explicit failures are not classified as green/silent', () => {
  const x = pulseInput();
  x.runs = [{ at: time(15), ok: false, rowsImported: 0 }];
  assert.equal(pulse(x).status, 'EXECUTION_FAILURE');
});
test('pulse: snapshots older than limit produce a warning', () => {
  const x = pulseInput();
  x.maxSnapshotAgeMinutes = 30;
  assert.equal(pulse(x).metrics.sourceSnapshotStale, true);
});
test('pulse: timestamps must be absolute and within the specified window', () => {
  const x = pulseInput();
  x.runs[0].at = '2026-10-22T10:00:00';
  assert.throws(() => pulse(x), /timezone/);
  x.runs[0].at = '2026-10-25T10:00:00Z';
  assert.throws(() => pulse(x), /outside window/);
});

test('impact: dangerous widened queue is blocked and does not leak row identifiers', () => {
  const result = impact(impactInput());
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.metrics.newlyVisible, 2);
  assert.equal(result.metrics.newlyVisibleStaleActionable, 1);
  assert.equal(result.metrics.blockedDependencies, 1);
  assert.ok(!JSON.stringify(result).includes('new1'), 'no row-level identity should leak in report');
});
test('impact: 120 synthetic new records with 35 stale, actionable is a BLOCKED dry-run', () => {
  const x = impactInput();
  x.dependencies[0].satisfied = true;
  x.after.ids = ['visible', ...Array.from({ length: 120 }, (_, i) => 'synthetic-' + i)];
  x.records = x.after.ids.slice(1).map((id, i) => ({ id, stale: i < 35, actionable: true }));
  const result = impact(x);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.metrics.newlyVisible, 120);
  assert.equal(result.metrics.newlyVisibleStaleActionable, 35);
});
test('impact: stale but not actionable entries do not block preview', () => {
  const x = impactInput();
  x.dependencies[0].satisfied = true;
  x.records[0].actionable = false;
  assert.equal(impact(x).status, 'PASS_PREVIEW');
});
test('impact: unresolved dependency blocks a clean widening', () => {
  const x = impactInput();
  x.records[0].stale = false;
  assert.equal(impact(x).status, 'BLOCKED');
});
test('impact: classification unknown must be reviewed, not permitted', () => {
  const x = impactInput();
  x.dependencies[0].satisfied = true;
  x.records[0].stale = null;
  const result = impact(x);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.metrics.newlyVisibleUnclassified, 1);
});
test('impact: mismatch of environment, role or query invalidates comparison', () => {
  const x = impactInput();
  x.after.context.role = 'admin';
  const r = impact(x);
  assert.equal(r.status, 'SCOPE_MISMATCH');
  assert.equal(r.metrics.newlyVisible, null);
});
test('impact: pagination fix that drops records requires review', () => {
  const x = impactInput();
  x.before.ids.push('lost');
  x.dependencies[0].satisfied = true;
  x.records[0].stale = false;
  const r = impact(x);
  assert.equal(r.status, 'REVIEW_REQUIRED');
  assert.equal(r.metrics.removedByChange, 1);
});
test('impact: duplicate row identities are rejected', () => {
  const x = impactInput();
  x.after.ids.push('new1');
  assert.throws(() => impact(x), /duplicate id/);
});

test('release: completed evidence is not misrepresented as independently observed', () => {
  const r = release(releaseInput());
  assert.equal(r.status, 'RELEASE_EVIDENCE_COMPLETE');
  assert.equal(r.safe, true);
  assert.match(r.summary, /independently/);
  assert.match(r.warnings[0], /does not independently/);
});
test('release: unmerged PR remains FIX_PREPARED even with optimistic downstream inputs', () => {
  const x = releaseInput();
  x.pullRequest.merged = false;
  assert.equal(release(x).status, 'FIX_PREPARED');
});
test('release: merged but not in main remains AWAITING_MAIN', () => {
  const x = releaseInput();
  x.main.containsMergeSha = false;
  assert.equal(release(x).status, 'AWAITING_MAIN');
});
test('release: missing/failed required CI must not pass', () => {
  const x = releaseInput();
  x.ci.requiredChecksPassed = false;
  assert.equal(release(x).status, 'CI_NOT_GREEN');
});
test('release: deployment must demonstrably contain merge commit', () => {
  const x = releaseInput();
  x.deployment.containsMergeSha = false;
  assert.equal(release(x).status, 'AWAITING_DEPLOYMENT');
});
test('release: required schema rollout is blocked until applied and verified', () => {
  const x = releaseInput();
  x.migration = { required: true, applied: false, schemaVerified: false, evidenceRef: 'fixture://migration' };
  assert.equal(release(x).status, 'MIGRATION_BLOCKED');
  x.migration.applied = true;
  x.migration.schemaVerified = true;
  assert.equal(release(x).status, 'RELEASE_EVIDENCE_COMPLETE');
});
test('release: smoke must test the same live deployment', () => {
  const x = releaseInput();
  x.smoke.testedDeploymentSha = 'other-build';
  assert.equal(release(x).status, 'SMOKE_FAILED');
});
test('release: stale smoke and missing source receipts fail closed', () => {
  const x = releaseInput();
  x.smoke.observedAt = time(10);
  assert.equal(release(x).status, 'INSUFFICIENT_EVIDENCE');
  x.smoke.observedAt = time(15);
  delete x.ci.evidenceRef;
  assert.equal(release(x).status, 'INSUFFICIENT_EVIDENCE');
});
test('release: a conflicting merge SHA does not count as repaired', () => {
  const x = releaseInput();
  x.pullRequest.mergeSha = 'wrong';
  assert.equal(release(x).status, 'COMMIT_MISMATCH');
});

test('CLI --strict has a nonzero exit code for unsafe results; --json prints machine-readable output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-v14-'));
  try {
    const input = path.join(dir, 'input.json');
    fs.writeFileSync(input, JSON.stringify(pulseInput()));
    const cmd = path.join(root, 'references/ghost-pulse.cjs');
    const result = cp.spawnSync(process.execPath, [cmd, '--input', input, '--json', '--strict'], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'SUSPECTED_SILENT_FAILURE');
    fs.writeFileSync(input, '{"garbled":true}');
    const invalid = cp.spawnSync(process.execPath, [cmd, '--input', input], { encoding: 'utf8', cwd: root });
    assert.equal(invalid.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
