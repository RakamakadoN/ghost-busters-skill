'use strict';

/**
 * Ghost Busters v1.6: offline, deterministic checks of operator-supplied evidence.
 * Never queries customer systems, runs SQL, sends alerts, or changes production.
 * A positive status records consistent assertions, NOT independently verified provenance.
 */
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(label + ' must be an object');
  }
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(label + ' must be a non-empty string');
  }
  return value.trim();
}
function stamp(value, label) {
  text(value, label);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(label + ' must be an offset-qualified ISO timestamp');
  }
  return Date.parse(value);
}
function optionalStamp(value, label) {
  return value == null ? null : stamp(value, label);
}
function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(label + ' must be a nonnegative safe integer');
  }
  return value;
}
function minutes(value, label, fallback) {
  const n = value === undefined ? fallback : count(value, label);
  if (n < 1 || n > 10080) throw new TypeError(label + ' must be 1..10080');
  return n;
}
function bool(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(label + ' must be boolean');
  return value;
}
function ageStatus(observedAt, evaluatedAt, maxMinutes) {
  const diff = evaluatedAt - observedAt;
  return diff < -5 * 60000 || diff > maxMinutes * 60000 ? 'STALE' : 'FRESH';
}

/**
 * Three *different* private evidence channels are required: deployment provider,
 * running application, and read-only database. This still cannot validate the
 * private originals: it only enforces consistency and chronology.
 */
function assessRuntimeIdentity(input) {
  const x = object(input, 'runtimeIdentity');
  const at = stamp(x.evaluatedAt, 'evaluatedAt');
  const maxAge = minutes(x.maxAgeMinutes, 'maxAgeMinutes', 60);
  const expectedRef = text(x.expectedProjectRef, 'expectedProjectRef');
  const readonly = bool(x.accessReadOnly, 'accessReadOnly');
  const sources = [
    ['deployment', 'deployment-provider'],
    ['runtime', 'runtime-response'],
    ['database', 'readonly-database']
  ];
  const collected = {};
  const evidenceIds = new Set();
  for (const [name, requiredSource] of sources) {
    const e = object(x[name], name);
    if (e.source !== requiredSource) {
      throw new TypeError(name + '.source must be ' + requiredSource);
    }
    const evidenceId = text(e.evidenceId, name + '.evidenceId');
    if (evidenceIds.has(evidenceId)) {
      throw new TypeError('Each evidence channel must have a distinct evidenceId');
    }
    evidenceIds.add(evidenceId);
    collected[name] = {
      observedAt: stamp(e.observedAt, name + '.observedAt'),
      projectRef: text(e.projectRef, name + '.projectRef')
    };
  }
  const deploymentArtifact = text(x.deployment.artifactId, 'deployment.artifactId');
  const runtimeArtifact = text(x.runtime.artifactId, 'runtime.artifactId');
  const anchorRows = count(x.database.anchorRows, 'database.anchorRows');
  const minimumRows = count(x.database.minimumRows, 'database.minimumRows');
  if (minimumRows < 1) throw new TypeError('database.minimumRows must be positive');
  const checks = {
    deploymentMatchesExpected: collected.deployment.projectRef === expectedRef,
    runtimeMatchesExpected: collected.runtime.projectRef === expectedRef,
    databaseMatchesExpected: collected.database.projectRef === expectedRef,
    deployedArtifactMatchesRuntime: deploymentArtifact === runtimeArtifact,
    anchorPresent: anchorRows >= minimumRows,
    fresh: sources.every(([name]) =>
      ageStatus(collected[name].observedAt, at, maxAge) === 'FRESH'),
    readOnly: readonly
  };
  const mismatch = !checks.deploymentMatchesExpected ||
    !checks.runtimeMatchesExpected || !checks.databaseMatchesExpected ||
    !checks.deployedArtifactMatchesRuntime;
  const status = !readonly ? 'UNSAFE_ACCESS' : mismatch ? 'MISMATCH' :
    !checks.fresh ? 'STALE_EVIDENCE' :
    !checks.anchorPresent ? 'INSUFFICIENT_EVIDENCE' : 'CORROBORATED_CANDIDATE';
  return {
    tool: 'runtime-identity', status, corroborated: status === 'CORROBORATED_CANDIDATE',
    checks, observed: {channels:3, anchorPresent:checks.anchorPresent, maxEvidenceAgeMinutes:maxAge},
    limitations: [
      'Values and evidence IDs are supplied by the operator; this tool cannot authenticate the sources.',
      'A matching runtime artifact and project ref are corroboration, not permission to modify production.',
      'Keep real refs, provider API responses and evidence locations in a private ledger.'
    ]
  };
}

/**
 * A created task is not proof anyone saw an alert. The incident's failing
 * communication channel must not be its only notification path.
 */
function assessHumanAlert(input) {
  const x = object(input, 'humanAlert');
  const at = stamp(x.evaluatedAt, 'evaluatedAt');
  const detected = stamp(x.detectedAt, 'detectedAt');
  if (detected > at) throw new TypeError('detectedAt must not follow evaluatedAt');
  const created = optionalStamp(x.createdAt, 'createdAt');
  const delivered = optionalStamp(x.deliveredAt, 'deliveredAt');
  const acknowledged = optionalStamp(x.acknowledgedAt, 'acknowledgedAt');
  const createMins = minutes(x.maxCreateMinutes, 'maxCreateMinutes', 15);
  const deliveryMins = minutes(x.maxDeliveryMinutes, 'maxDeliveryMinutes', 10);
  const ackMins = minutes(x.maxAckMinutes, 'maxAckMinutes', 30);
  const incidentChannel = text(x.incidentChannel, 'incidentChannel').toLowerCase();
  const alertChannel = text(x.alertChannel, 'alertChannel').toLowerCase();
  const independent = bool(x.channelIndependent, 'channelIndependent');
  const chronology = [detected, created, delivered, acknowledged].filter(v => v !== null);
  if ((delivered !== null && created === null) ||
      (acknowledged !== null && delivered === null) ||
      chronology.some((v,i)=>i>0 && v < chronology[i-1]) ||
      chronology.some(v => v > at)) {
    throw new TypeError('Alert chronology must be ordered and cannot be in the future');
  }
  const evidence = {
    delivered: delivered !== null && typeof x.deliveryEvidenceId === 'string' &&
      x.deliveryEvidenceId.trim().length > 0,
    acknowledged: acknowledged !== null && typeof x.ackEvidenceId === 'string' &&
      x.ackEvidenceId.trim().length > 0
  };
  let status;
  if (!independent || incidentChannel === alertChannel) status='DEPENDENT_CHANNEL';
  else if (created === null) {
    status = at-detected > createMins*60000 ? 'ALERT_MISSING' : 'ALERT_PENDING';
  } else if (delivered === null) {
    status = at-created > deliveryMins*60000 ? 'DELIVERY_OVERDUE' : 'DELIVERY_PENDING';
  } else if (!evidence.delivered) status='DELIVERY_UNVERIFIED';
  else if (acknowledged === null) {
    status = at-delivered > ackMins*60000 ? 'ACK_OVERDUE' : 'ACK_PENDING';
  } else if (!evidence.acknowledged) status='ACK_UNVERIFIED';
  else status='ACKNOWLEDGED';
  return {
    tool: 'human-alert', status, humanConfirmed: status==='ACKNOWLEDGED',
    observed: {
      created: created!==null, delivered:delivered!==null, acknowledged:acknowledged!==null,
      independentChannel: independent && incidentChannel!==alertChannel,
      deliveryEvidenceRecorded:evidence.delivered, ackEvidenceRecorded:evidence.acknowledged,
      minutesSinceDetection:Math.floor((at-detected)/60000)
    },
    limitations: [
      'Job success and a stored alert row do not prove external delivery or human acknowledgement.',
      'Delivery and acknowledgement evidence must be checked against private provider and human records.',
      'This gate never sends, pages, or acknowledges messages.'
    ]
  };
}

/** Local synthetic RED/GREEN outcome audit, not a test runner. */
function assessRegressionEvidence(input) {
  const x=object(input, 'regression');
  const at=stamp(x.evaluatedAt, 'evaluatedAt');
  const testId=text(x.testId, 'testId');
  text(x.fixRevision, 'fixRevision');
  const environment=text(x.environment, 'environment');
  const before=object(x.before, 'before'),after=object(x.after,'after');
  const negative=object(x.negativeControls,'negativeControls');
  const total=count(negative.total,'negativeControls.total');
  const passed=count(negative.passed,'negativeControls.passed');
  if (passed>total) throw new TypeError('negativeControls.passed exceeds total');
  for (const [name, value] of [['before',before],['after',after]]) {
    if (!['FAIL','PASS','NOT_RUN'].includes(value.outcome)) {
      throw new TypeError(name+'.outcome must be FAIL, PASS or NOT_RUN');
    }
  }
  const tBefore=optionalStamp(before.observedAt,'before.observedAt');
  const tAfter=optionalStamp(after.observedAt,'after.observedAt');
  if (tBefore !== null && tAfter !== null && tAfter <= tBefore) {
    throw new TypeError('after test must follow before test');
  }
  if ((tBefore !== null && tBefore > at) || (tAfter !== null && tAfter > at)) {
    throw new TypeError('test evidence must not be future-dated');
  }
  const hasEvidence = [before,after].every(v =>
    typeof v.evidenceId === 'string' && v.evidenceId.trim().length>0 &&
    v.observedAt != null) && before.evidenceId !== after.evidenceId;
  const red = before.outcome === 'FAIL', green = after.outcome === 'PASS';
  let status;
  if (environment !== 'isolated') status='UNSAFE_TEST_ENVIRONMENT';
  else if (before.outcome==='NOT_RUN' || after.outcome==='NOT_RUN' || !hasEvidence ||
    total === 0) status='INSUFFICIENT_EVIDENCE';
  else if (!red) status='NO_RED_BASELINE';
  else if (!green) status='POST_FIX_FAILURE';
  else if (passed !== total) status='CONTROL_FAILURE';
  else status='RED_GREEN_RECORDED';
  const review = x.independentReview == null ? null : object(x.independentReview,'independentReview');
  const reviewAttested = review?.completed === true &&
    typeof review.evidenceId==='string' && review.evidenceId.trim().length>0 &&
    review.reviewedAt != null && tAfter !== null &&
    stamp(review.reviewedAt,'independentReview.reviewedAt') >= tAfter;
  return {
    tool:'regression',status,
    evidenceRecorded:status==='RED_GREEN_RECORDED',
    observed:{testCaseRecorded:testId.length>0,red,green,
      negativeControlsTotal:total,negativeControlsPassed:passed,
      independentReviewAttested:reviewAttested},
    limitations:[
      'This gate checks supplied test summaries; it does not run the tests or verify CI artifact authenticity.',
      'Tests must run against isolated fixtures or disposable databases, never production mutations.',
      'The fix revision and original test evidence must be independently checked before claiming remediation.'
    ]
  };
}
module.exports={assessRuntimeIdentity,assessHumanAlert,assessRegressionEvidence};
