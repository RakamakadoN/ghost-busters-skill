'use strict';

/**
 * Ghost Busters v1.4: offline, read-only evidence gates.
 * Accepts JSON summaries exported by an authorized operator; never connects
 * to production, mutates data, deploys code, or sends messages.
 */
function obj(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(name + ' must be an object');
  }
  return value;
}
function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(name + ' must be a nonnegative safe integer');
  }
  return value;
}
function positive(value, name) {
  integer(value, name);
  if (value === 0) throw new TypeError(name + ' must be positive');
  return value;
}
function nonEmpty(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(name + ' must be a non-empty string');
  }
  return value.trim();
}
function timestamp(value, name) {
  nonEmpty(value, name);
  if (!/Z$|[+-]\d\d:\d\d$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(name + ' must be an ISO timestamp with a timezone');
  }
  return Date.parse(value);
}
function nullableBool(value, name) {
  if (value !== null && value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(name + ' must be true, false, or null');
  }
  return value == null ? null : value;
}
function array(value, name) {
  if (!Array.isArray(value)) throw new TypeError(name + ' must be an array');
  return value;
}

function businessHoursBetween(start, end, zone, config) {
  if (!config) return null;
  const hours = obj(config, 'businessHours');
  const weekdays = array(hours.weekdays, 'businessHours.weekdays');
  if (!weekdays.length || weekdays.some(x => !Number.isInteger(x) || x < 1 || x > 7)) {
    throw new TypeError('businessHours.weekdays must contain ISO weekdays 1–7');
  }
  const minute = (v, label) => {
    if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
      throw new TypeError(label + ' must be HH:MM');
    }
    return Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  };
  const from = minute(hours.from, 'businessHours.from');
  const to = minute(hours.to, 'businessHours.to');
  if (from >= to) throw new TypeError('businessHours must not cross midnight');
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: nonEmpty(zone, 'timezone'),
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const weekdaysMap = {Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7};
  const bucket = 15 * 60 * 1000;
  let minutes = 0;
  // 15-minute midpoint sample, weighting partial boundary buckets. Maximum
  // window 30 days; DST follows Intl's actual timezone mapping.
  for (let t = start; t < end; t += bucket) {
    const stop = Math.min(t + bucket, end);
    const parts = Object.fromEntries(formatter.formatToParts(new Date((t + stop) / 2))
      .filter(p => ['weekday', 'hour', 'minute'].includes(p.type)).map(p => [p.type, p.value]));
    const m = Number(parts.hour) * 60 + Number(parts.minute);
    if (weekdays.includes(weekdaysMap[parts.weekday]) && m >= from && m < to) {
      minutes += (stop - t) / 60000;
    }
  }
  return Math.round(minutes / 60 * 100) / 100;
}

/** Evidence of progress is distinct from evidence of successful execution. */
function assessPulse(input) {
  const x = obj(input, 'pulse');
  const start = timestamp(x.windowStart, 'windowStart');
  const end = timestamp(x.windowEnd, 'windowEnd');
  const at = timestamp(x.evaluatedAt, 'evaluatedAt');
  if (end <= start || (end - start) > 30 * 86400000 || end > at) {
    throw new TypeError('Invalid pulse window: must end by evaluation and span <=30 days');
  }
  const runs = array(x.runs, 'runs').map((r, i) => {
    obj(r, 'runs[' + i + ']');
    const time = timestamp(r.at, 'runs[' + i + '].at');
    if (typeof r.ok !== 'boolean') throw new TypeError('runs[].ok must be boolean');
    return {time, ok: r.ok, rowsImported: integer(r.rowsImported, 'runs[].rowsImported')};
  });
  const snapshots = array(x.snapshots, 'snapshots').map((s, i) => {
    obj(s, 'snapshots[' + i + ']');
    return {time: timestamp(s.at, 'snapshots[].at'), fingerprint: nonEmpty(s.fingerprint, 'snapshots[].fingerprint'),
      rowsCount: integer(s.rowsCount, 'snapshots[].rowsCount')};
  });
  const d = obj(x.downstream, 'downstream');
  const independent = obj(x.independentSignal, 'independentSignal');
  const newRecords = integer(d.newRecords, 'downstream.newRecords');
  const independentCount = integer(independent.activityCount, 'independentSignal.activityCount');
  const minHours = x.minimumBusinessHours === undefined ? 2 : x.minimumBusinessHours;
  if (typeof minHours !== 'number' || !Number.isFinite(minHours) || minHours < 0.25 || minHours > 240) {
    throw new TypeError('minimumBusinessHours must be between 0.25 and 240');
  }
  const businessHours = businessHoursBetween(start, end, x.timezone, x.businessHours);
  // Never count samples outside the declared window.
  const inWindow = r => r.time >= start && r.time <= end;
  const usedRuns = runs.filter(inWindow);
  const usedSnapshots = snapshots.filter(inWindow).sort((a,b) => a.time-b.time);
  const successfulRuns = usedRuns.filter(r => r.ok).length;
  const imported = usedRuns.reduce((n,r) => n+r.rowsImported, 0);
  const identicalSnapshots = usedSnapshots.length >= 3 &&
    usedSnapshots.every(s => s.fingerprint === usedSnapshots[0].fingerprint &&
      s.rowsCount === usedSnapshots[0].rowsCount);
  const signals = {
    greenRuns: usedRuns.length >= 3 && successfulRuns === usedRuns.length,
    zeroImport: imported === 0,
    unchangedSource: identicalSnapshots,
    noDownstreamProgress: newRecords === 0,
    independentActivity: independentCount > 0,
    businessWindowObserved: businessHours !== null && businessHours >= minHours
  };
  let status = 'INSUFFICIENT_EVIDENCE';
  if (usedRuns.length >= 3 && successfulRuns < usedRuns.length) status = 'EXECUTION_FAILURE';
  else if (imported > 0 || newRecords > 0) status = 'PROGRESS_OBSERVED';
  else if (signals.greenRuns && signals.zeroImport && signals.noDownstreamProgress &&
    signals.independentActivity && signals.businessWindowObserved) {
    status = signals.unchangedSource ? 'SUSPECTED_SILENT_FAILURE' : 'NEEDS_INVESTIGATION';
  }
  return {
    tool: 'pulse', status, risk: status === 'SUSPECTED_SILENT_FAILURE' ? 'P1' : 'REVIEW',
    observed: {runs: usedRuns.length, successfulRuns, imported, snapshots: usedSnapshots.length,
      identicalSnapshots, newRecords, independentActivityCount: independentCount,
      businessHours}, signals,
    limitations: [
      'An independent signal may not represent one-to-one downstream records.',
      'Suspected failure does not identify whether the source, export or integration is responsible.',
      'Check source ownership, delays, holidays and schedule before remediation.'
    ]
  };
}

/** A repair that increases the eligible set can unexpectedly enable bulk actions. */
function assessImpact(input) {
  const x = obj(input, 'impact');
  const before = integer(x.beforeVisible, 'beforeVisible');
  const after = integer(x.afterVisible, 'afterVisible');
  if (after < before) throw new TypeError('afterVisible must be >= beforeVisible for expansion impact');
  const added = after-before;
  const actions = array(x.bulkActions, 'bulkActions').map((a,i) => ({
    name: nonEmpty(obj(a, 'bulkActions['+i+']').name, 'bulkActions[].name'),
    safeguardsVerified: nullableBool(a.safeguardsVerified, 'bulkActions[].safeguardsVerified'),
    canActOnNewRecords: nullableBool(a.canActOnNewRecords, 'bulkActions[].canActOnNewRecords')
  }));
  const checks = array(x.dependencyChecks, 'dependencyChecks').map((d,i) => ({
    id: nonEmpty(obj(d, 'dependencyChecks['+i+']').id, 'dependencyChecks[].id'),
    passed: nullableBool(d.passed, 'dependencyChecks[].passed')
  }));
  const reviewed = nullableBool(x.hiddenRecordsReviewed, 'hiddenRecordsReviewed');
  const unsafe = x.unsafeNewRecords === null || x.unsafeNewRecords === undefined ?
    null : integer(x.unsafeNewRecords, 'unsafeNewRecords');
  if (unsafe !== null && unsafe > added) throw new TypeError('unsafeNewRecords cannot exceed newly visible records');
  const actionsReviewed = nullableBool(x.bulkActionsReviewed, 'bulkActionsReviewed');
  const depsReviewed = nullableBool(x.dependencyReviewComplete, 'dependencyReviewComplete');
  const blockers = [];
  const unknowns = [];
  if (unsafe !== null && unsafe > 0) blockers.push(unsafe + ' newly visible records marked unsafe');
  if (checks.some(d => d.passed === false)) blockers.push('unmet dependency: ' + checks.filter(d=>d.passed===false).map(d=>d.id).join(', '));
  if (actions.some(a => a.canActOnNewRecords !== false && a.safeguardsVerified === false)) blockers.push('bulk-action safeguards failed');
  if (added > 0) {
    if (reviewed !== true || unsafe === null) unknowns.push('newly visible records not completely classified');
    if (actionsReviewed !== true) unknowns.push('bulk-action inventory incomplete');
    if (depsReviewed !== true || checks.some(d=>d.passed===null)) unknowns.push('dependency review incomplete');
    if (actions.some(a=>a.canActOnNewRecords===null ||
      (a.canActOnNewRecords===true && a.safeguardsVerified===null))) unknowns.push('bulk-action behavior or safeguards unknown');
  }
  const status = blockers.length ? 'BLOCKED' : unknowns.length ? 'REVIEW_REQUIRED' : 'CLEAR';
  return {tool:'impact',status, releaseAllowed:status==='CLEAR',
    observed:{beforeVisible:before,afterVisible:after,added,unsafeNewRecords:unsafe,
      bulkActions:actions,dependencyChecks:checks},blockers,unknowns,
    limitations:['A CLEAR result confirms only the supplied review evidence, not actual production safety.']};
}

/** Merge, CI, deploy and actual runtime verification are separate gates. */
function assessRelease(input) {
  const x = obj(input, 'release');
  const flags = {};
  for (const key of ['prMerged','commitInMain','requiredCiPassed',
    'deploymentContainsFix','productionSmokePassed','environmentVerified']) {
    flags[key] = nullableBool(x[key], key);
  }
  const migrations = obj(x.migrations, 'migrations');
  if (typeof migrations.required !== 'boolean') throw new TypeError('migrations.required must be boolean');
  flags.migrationApplied = migrations.required ? nullableBool(migrations.applied, 'migrations.applied') : true;
  // A boolean smoke assertion without timestamp provenance is not enough to
  // claim "verified in production". A missing timestamp is unknown, while a
  // negative chronology is an explicit blocker.
  let ordered = null;
  if (x.deployedAt != null && x.smokeObservedAt != null) {
    ordered = timestamp(x.smokeObservedAt,'smokeObservedAt') >=
      timestamp(x.deployedAt,'deployedAt');
  }
  const blockers = [];
  const pending = [];
  if (flags.requiredCiPassed === false) blockers.push('required CI failed');
  if (flags.migrationApplied === false) blockers.push('required migration not applied');
  if (flags.environmentVerified === false) blockers.push('production identity mismatch');
  if (flags.productionSmokePassed === true && !ordered) blockers.push('smoke observation predates deployment');
  for (const [key,val] of Object.entries(flags)) if (val !== true) pending.push(key);
  let status;
  if (blockers.length) status='BLOCKED';
  else if (flags.prMerged!==true || flags.commitInMain!==true) status='FIX_PREPARED';
  else if (flags.deploymentContainsFix!==true) status='MERGED_NOT_DEPLOYED';
  else if (flags.productionSmokePassed!==true || flags.environmentVerified!==true || ordered!==true) status='DEPLOYED_UNVERIFIED';
  else if (flags.requiredCiPassed===true && flags.migrationApplied===true) status='VERIFIED_IN_PRODUCTION';
  else status='BLOCKED';
  return {tool:'release',status,verified:status==='VERIFIED_IN_PRODUCTION',flags,
    observed:{smokeAfterDeployment:ordered},blockers,pending,
    limitations:['Git merge alone is not evidence of deployment.',
      'deploymentContainsFix must be evidenced by the deployed artifact, not a PR link.',
      'Production smoke checks must verify the symptom through a correct runtime identity.']};
}

/** Display names are not an environment fingerprint. */
function assessEnvironment(input) {
  const x = obj(input, 'environment');
  const expectedRef = nonEmpty(x.expectedProjectRef, 'expectedProjectRef');
  const observedRef = nonEmpty(x.observedProjectRef, 'observedProjectRef');
  const deployedRef = x.deployedProjectRef == null ? null : nonEmpty(x.deployedProjectRef,'deployedProjectRef');
  const anchor = obj(x.anchor, 'anchor');
  const min = positive(anchor.minimumRows, 'anchor.minimumRows');
  const observed = integer(anchor.observedRows, 'anchor.observedRows');
  const accessReadOnly = nullableBool(x.accessReadOnly, 'accessReadOnly');
  const checks = {
    projectRefMatches: expectedRef === observedRef,
    runtimeBindingMatches: deployedRef !== null && deployedRef === observedRef,
    expectedDataPresent: observed >= min,
    accessReadOnly
  };
  const status = accessReadOnly===false ? 'UNSAFE_ACCESS' :
    checks.projectRefMatches===false || (deployedRef!==null && !checks.runtimeBindingMatches) ? 'MISMATCH' :
    checks.runtimeBindingMatches && checks.expectedDataPresent && accessReadOnly===true ?
      'VERIFIED_CANDIDATE' : 'INSUFFICIENT_EVIDENCE';
  return {tool:'environment',status,canClaimProduction:status==='VERIFIED_CANDIDATE',
    checks,observed:{anchorName:nonEmpty(anchor.name,'anchor.name'),anchorRows:observed,minimumRows:min},
    limitations:['A matching ref and row count is an identity check, not authorization to modify production.',
      'A database display name alone is never proof of the production target.']};
}

module.exports = {assessPulse, assessImpact, assessRelease, assessEnvironment, businessHoursBetween};
