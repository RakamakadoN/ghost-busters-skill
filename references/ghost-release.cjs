#!/usr/bin/env node
'use strict';
/**
 * Ghost Release — evidence gate for the journey from fix/PR to live repair.
 * Input is an offline attestation. The CLI does NOT independently query
 * GitHub, a host or a database. "Complete" is not a guarantee of truth.
 */
const e = require('./lib/evidence.cjs');

function release(input) {
  e.requireObject(input, 'input');
  const change = e.text(input.change, 'change');
  const expectedMergeSha = e.text(input.expectedMergeSha, 'expectedMergeSha');
  const observedAt = e.timestamp(input.observedAt, 'observedAt');
  const maxSmokeAgeMinutes = e.positiveInteger(input.maxSmokeAgeMinutes ?? 120, 'maxSmokeAgeMinutes');
  const pr = e.requireObject(input.pullRequest, 'pullRequest');
  const main = e.requireObject(input.main, 'main');
  const ci = e.requireObject(input.ci, 'ci');
  const deploy = e.requireObject(input.deployment, 'deployment');
  const migration = e.requireObject(input.migration, 'migration');
  const smoke = e.requireObject(input.smoke, 'smoke');

  const asFlag = (v, name) => v === null || v === undefined ? null : e.boolean(v, name);
  const deploymentSha = typeof deploy.sha === 'string' && deploy.sha.trim() ? deploy.sha : null;
  const smokeSha = typeof smoke.testedDeploymentSha === 'string' && smoke.testedDeploymentSha.trim() ? smoke.testedDeploymentSha : null;
  const smokeAt = smoke.observedAt ? e.timestamp(smoke.observedAt, 'smoke.observedAt') : null;
  const smokeAgeMinutes = smokeAt === null ? null : Math.round((observedAt - smokeAt) / 60000);
  const migrationRequired = e.boolean(migration.required, 'migration.required');
  const checks = {
    merged: asFlag(pr.merged, 'pullRequest.merged'),
    mergeShaMatches: pr.mergeSha ? pr.mergeSha === expectedMergeSha : null,
    presentInMain: asFlag(main.containsMergeSha, 'main.containsMergeSha'),
    requiredCiPassed: asFlag(ci.requiredChecksPassed, 'ci.requiredChecksPassed'),
    deployedShaPresent: !!deploymentSha,
    deployedContainsMerge: asFlag(deploy.containsMergeSha, 'deployment.containsMergeSha'),
    migrationRequired,
    migrationApplied: migrationRequired ? asFlag(migration.applied, 'migration.applied') : true,
    deployedSchemaVerified: migrationRequired ? asFlag(migration.schemaVerified, 'migration.schemaVerified') : true,
    smokePassed: asFlag(smoke.passed, 'smoke.passed'),
    smokeTestedLiveSha: deploymentSha && smokeSha ? deploymentSha === smokeSha : null,
    smokeFresh: smokeAgeMinutes !== null && smokeAgeMinutes >= 0 && smokeAgeMinutes <= maxSmokeAgeMinutes
  };
  // A receipt is a reference to verifiable external evidence, not the evidence itself.
  const sourceRefs = {
    pr: pr.evidenceRef,
    main: main.evidenceRef,
    ci: ci.evidenceRef,
    deployment: deploy.evidenceRef,
    migration: migrationRequired ? migration.evidenceRef : 'not-required',
    smoke: smoke.evidenceRef
  };
  const hasReceipts = Object.values(sourceRefs).every(s => typeof s === 'string' && s.trim().length > 0);
  let status = 'RELEASE_EVIDENCE_COMPLETE';
  let summary = 'Supplied release evidence is internally consistent. Verify referenced sources independently before claiming a production fix.';
  if (checks.merged === false) {
    status = 'FIX_PREPARED'; summary = 'The pull request has not been merged.';
  } else if (checks.merged === true && checks.mergeShaMatches === false) {
    status = 'COMMIT_MISMATCH'; summary = 'The claimed merge commit differs from expectedMergeSha.';
  } else if (checks.presentInMain === false) {
    status = 'AWAITING_MAIN'; summary = 'No evidence that the merge commit is present in main.';
  } else if (checks.requiredCiPassed === false) {
    status = 'CI_NOT_GREEN'; summary = 'Required checks have not passed.';
  } else if (migrationRequired && (checks.migrationApplied === false || checks.deployedSchemaVerified === false)) {
    status = 'MIGRATION_BLOCKED'; summary = 'A required migration or live schema verification is incomplete. No migration was applied by this tool.';
  } else if (!deploymentSha || checks.deployedContainsMerge === false) {
    status = 'AWAITING_DEPLOYMENT'; summary = 'A live deployment containing the fix has not been shown.';
  } else if (checks.smokePassed === false || (smokeSha && deploymentSha !== smokeSha)) {
    status = 'SMOKE_FAILED'; summary = 'The live smoke check failed or tested a different deployment.';
  } else if (Object.values(checks).some(v => v === null) || !checks.smokeFresh || !hasReceipts) {
    status = 'INSUFFICIENT_EVIDENCE';
    summary = 'One or more verification claims, receipts or a fresh live smoke check are missing.';
  }
  return {
    tool: 'Ghost Release',
    change,
    status,
    safe: status === 'RELEASE_EVIDENCE_COMPLETE',
    summary,
    checks,
    metrics: { smokeAgeMinutes, maxSmokeAgeMinutes, evidenceReceiptsPresent: hasReceipts },
    warnings: [
      'This CLI validates supplied attestations; it does not independently fetch CI, deployment or production records.',
      'No merge, migration, deploy, database write or live action was performed.',
      'Do not publish RELEASE_EVIDENCE_COMPLETE as confirmed production success until the source receipts are independently validated.'
    ]
  };
}

module.exports = { release };
if (require.main === module) e.runCli(release);
