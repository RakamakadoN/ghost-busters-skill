'use strict';

/**
 * Ghost Busters v1.6 Autonomous Hunter — deterministic transition engine.
 * No writes to target apps, no AI side effects, no patch generation. State is
 * only a local summary of alert lifecycle, not production evidence.
 */
const {assessPulse, assessImpact, assessRelease, assessEnvironment} = require('./guardrails.cjs');
const {assessRuntimeIdentity,assessHumanAlert,assessRegressionEvidence} = require('./v1-6-gates.cjs');

const evaluators = Object.freeze({
  pulse: assessPulse,
  impact: assessImpact,
  release: assessRelease,
  environment: assessEnvironment,
  'runtime-identity':assessRuntimeIdentity,
  'human-alert':assessHumanAlert,
  regression:assessRegressionEvidence
});
const MODES = Object.keys(evaluators);
const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

function configFor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) {
    throw new Error('Hunter config must be a version:1 object');
  }
  if (!Array.isArray(input.checks) || input.checks.length < 1 || input.checks.length > 30) {
    throw new Error('Hunter config requires 1–30 checks');
  }
  const ids = new Set();
  const checks = input.checks.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !ID_PATTERN.test(item.id)) {
      throw new Error('Each check requires a safe id [a-z][a-z0-9-]{0,63}');
    }
    if (ids.has(item.id)) throw new Error('Duplicate check id: '+item.id);
    ids.add(item.id);
    if (!MODES.includes(item.mode)) throw new Error('Unknown check mode: '+item.id);
    if (!item.source || typeof item.source !== 'object' || Array.isArray(item.source) ||
        !['file','https'].includes(item.source.kind)) {
      throw new Error('Check source must be file or https: '+item.id);
    }
    const openAfter = item.openAfter === undefined ? 2 : item.openAfter;
    const resolveAfter = item.resolveAfter === undefined ? 2 : item.resolveAfter;
    for (const [key, n] of [['openAfter',openAfter],['resolveAfter',resolveAfter]]) {
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        throw new Error(key+' must be 1..20: '+item.id);
      }
    }
    if (item.source.kind === 'file') {
      if (typeof item.source.path !== 'string' || !item.source.path.trim()) {
        throw new Error('File check needs a path: '+item.id);
      }
    }
    if (item.source.kind === 'https') {
      if (typeof item.source.url !== 'string') throw new Error('HTTPS check needs URL: '+item.id);
      if (item.source.tokenEnv !== undefined &&
          (typeof item.source.tokenEnv !== 'string' ||
           !/^GHOST_HUNTER_[A-Z0-9_]+$/.test(item.source.tokenEnv))) {
        throw new Error('tokenEnv must begin GHOST_HUNTER_: '+item.id);
      }
    }
    const maxEvidenceAgeMinutes = item.maxEvidenceAgeMinutes === undefined ? 360 : item.maxEvidenceAgeMinutes;
    if (!Number.isInteger(maxEvidenceAgeMinutes) ||
        maxEvidenceAgeMinutes < 1 || maxEvidenceAgeMinutes > 10080) {
      throw new Error('maxEvidenceAgeMinutes must be 1..10080: '+item.id);
    }
    return {id:item.id, mode:item.mode, source:item.source, openAfter, resolveAfter,
      maxEvidenceAgeMinutes};
  });
  const allowedHosts = input.allowedHosts === undefined ? [] : input.allowedHosts;
  if (!Array.isArray(allowedHosts) || allowedHosts.length > 20 ||
      allowedHosts.some(s => typeof s !== 'string' ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(s) ||
      s.length > 253 || s !== s.toLowerCase())) {
    throw new Error('allowedHosts must contain exact lowercase DNS hostnames');
  }
  return {version:1,checks,allowedHosts};
}

function initialState() {return {version:1,checks:{}};}
function stateFor(value) {
  if (value === undefined || value === null) return initialState();
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    value.version !== 1 || !value.checks || typeof value.checks !== 'object' ||
    Array.isArray(value.checks)) throw new Error('Previous state invalid: stop rather than losing alert history');
  return value;
}
function classify(mode, status) {
  const risks = {
    pulse:['SUSPECTED_SILENT_FAILURE','EXECUTION_FAILURE','EVIDENCE_ERROR'],
    impact:['BLOCKED','EVIDENCE_ERROR'],
    release:['BLOCKED','EVIDENCE_ERROR'],
    environment:['MISMATCH','UNSAFE_ACCESS','EVIDENCE_ERROR'],
    'runtime-identity':['MISMATCH','UNSAFE_ACCESS','STALE_EVIDENCE','EVIDENCE_ERROR'],
    'human-alert':['DEPENDENT_CHANNEL','ALERT_MISSING','DELIVERY_OVERDUE','DELIVERY_UNVERIFIED',
      'ACK_OVERDUE','ACK_UNVERIFIED','EVIDENCE_ERROR'],
    regression:['UNSAFE_TEST_ENVIRONMENT','NO_RED_BASELINE','POST_FIX_FAILURE',
      'CONTROL_FAILURE','EVIDENCE_ERROR']
  };
  const healthy = {
    pulse:['PROGRESS_OBSERVED'],
    impact:['CLEAR'],
    release:['VERIFIED_IN_PRODUCTION'],
    environment:['VERIFIED_CANDIDATE'],
    'runtime-identity':['CORROBORATED_CANDIDATE'],
    'human-alert':['ACKNOWLEDGED'],
    regression:['RED_GREEN_RECORDED']
  };
  if (risks[mode]?.includes(status)) return 'BAD';
  if (healthy[mode]?.includes(status)) return 'GOOD';
  return 'UNKNOWN';
}

function summarise(result) {
  // Whitelist aggregate metrics only; no raw records, URLs or tokens.
  if (result.tool === 'pulse') {
    const o=result.observed;
    return {runs:o.runs,successfulRuns:o.successfulRuns,rowsImported:o.imported,
      identicalSnapshots:o.identicalSnapshots,downstreamNewRecords:o.newRecords,
      independentActivity:o.independentActivityCount,businessHours:o.businessHours};
  }
  if (result.tool === 'impact') {
    const o=result.observed;
    return {beforeVisible:o.beforeVisible,afterVisible:o.afterVisible,
      added:o.added,unsafeNewRecords:o.unsafeNewRecords,
      blockers:result.blockers.length,unknowns:result.unknowns.length};
  }
  if (result.tool === 'release') {
    return {gatesPassed:Object.values(result.flags).filter(Boolean).length,
      gatesTotal:Object.keys(result.flags).length,
      smokeAfterDeployment:result.observed.smokeAfterDeployment};
  }
  if (result.tool === 'environment') {
    return {projectRefMatches:result.checks.projectRefMatches,
      runtimeBindingMatches:result.checks.runtimeBindingMatches,
      expectedDataPresent:result.checks.expectedDataPresent,
      readOnly:result.checks.accessReadOnly};
  }
  if (result.tool === 'runtime-identity') {
    return {channels:result.observed.channels,...result.checks};
  }
  if (result.tool === 'human-alert') {
    return result.observed;
  }
  if (result.tool === 'regression') {
    return result.observed;
  }
  return {};
}
function sampleEvidence(mode, observation, now, maxAge) {
  if (observation === null || observation === undefined) {
    return {status:'EVIDENCE_ERROR',metrics:{},note:'Evidence source unavailable or invalid'};
  }
  try {
    // A successful retrieval of an old snapshot is not a fresh observation.
    // Pulse summaries contain their own source observation timestamp.
    if (['pulse','runtime-identity','human-alert','regression'].includes(mode)) {
      const stamp = Date.parse(observation.evaluatedAt);
      const age = Date.parse(now)-stamp;
      if (!Number.isFinite(stamp) || age < -5*60000 || age > maxAge*60000) {
        return {status:'EVIDENCE_ERROR',metrics:{},
          note:'Evaluation evidence is stale, future-dated or missing a timestamp'};
      }
    }
    const result = evaluators[mode](observation);
    return {status:result.status,metrics:summarise(result),note:null};
  } catch (_) {
    return {status:'EVIDENCE_ERROR',metrics:{},note:'Evidence source unavailable or invalid'};
  }
}
function evolve(config, previous, observations, now) {
  const c=configFor(config), state=stateFor(previous);
  if (typeof now !== 'string' || !Number.isFinite(Date.parse(now)) ||
      !/(?:Z|[+-]\d{2}:\d{2})$/.test(now)) {
    throw new Error('now must be an explicit ISO timestamp with offset');
  }
  if (!observations || typeof observations !== 'object' || Array.isArray(observations)) {
    throw new Error('Observations must be an object indexed by check id');
  }
  const next={version:1,checks:{...state.checks}}, results=[],transitions=[];
  for (const check of c.checks) {
    const current=state.checks[check.id]||{};
    if (current.lastSeen && Date.parse(now)<Date.parse(current.lastSeen)) {
      throw new Error('Observation time precedes stored state for '+check.id);
    }
    const found=sampleEvidence(check.mode,observations[check.id],now,check.maxEvidenceAgeMinutes);
    const classification=classify(check.mode,found.status);
    const record={
      badStreak:Number.isSafeInteger(current.badStreak)&&current.badStreak>=0?current.badStreak:0,
      goodStreak:Number.isSafeInteger(current.goodStreak)&&current.goodStreak>=0?current.goodStreak:0,
      open:current.open===true,
      firstSeen:typeof current.firstSeen==='string'?current.firstSeen:null,
      lastSeen:now, lastStatus:found.status
    };
    let transition=null;
    if (classification==='BAD') {
      record.badStreak=Math.min(record.badStreak+1,check.openAfter);
      record.goodStreak=0;
      if (!record.open && record.badStreak>=check.openAfter) {
        record.open=true; record.firstSeen=now;transition='OPENED';
      }
    } else if(classification==='GOOD') {
      record.goodStreak=Math.min(record.goodStreak+1,check.resolveAfter);
      record.badStreak=0;
      if(record.open && record.goodStreak>=check.resolveAfter) {
        record.open=false;record.firstSeen=null;transition='RECOVERED';
      }
    } else {
      // Missing evidence or partial rollout must not clear an incident.
      record.badStreak=0;record.goodStreak=0;
    }
    next.checks[check.id]=record;
    const result={id:check.id,mode:check.mode,status:found.status,
      classification,alertOpen:record.open,transition,metrics:found.metrics,
      note:found.note};
    results.push(result);
    if(transition) transitions.push({id:check.id,mode:check.mode,event:transition,status:found.status});
  }
  return {state:next,report:{
    schemaVersion:1,checkedAt:now,checks:results,transitions,
    summary:{total:results.length,open:results.filter(x=>x.alertOpen).length,
      new:transitions.filter(x=>x.event==='OPENED').length,
      recovered:transitions.filter(x=>x.event==='RECOVERED').length,
      unknown:results.filter(x=>x.classification==='UNKNOWN').length},
    warning:'Read-only evidence evaluation; not a production repair or independently proven root cause.'
  }};
}
function renderMarkdown(report) {
  const lines=[
    '# Ghost Busters Autonomous Hunter — run',
    '',
    '**Evaluated:** '+report.checkedAt,
    '**Checks:** '+report.summary.total+' · **Open alerts:** '+report.summary.open+
      ' · **New:** '+report.summary.new+' · **Recovered:** '+report.summary.recovered,
    '',
    '| Check | Mode | Assessment | Alert | Change |',
    '|---|---|---|---|---|'
  ];
  for(const c of report.checks) {
    lines.push('| '+c.id+' | '+c.mode+' | '+c.status+' | '+
      (c.alertOpen?'OPEN':'—')+' | '+(c.transition||'—')+' |');
  }
  if(report.transitions.length) {
    lines.push('','## Changes since previous run');
    for(const t of report.transitions) {
      lines.push('- **'+t.event+'** · '+t.id+' — '+t.status);
    }
  } else lines.push('','No new or recovered alerts in this run.');
  lines.push('','**Evidence limit:** Findings are derived only from authorized summaries; unknown is not healthy.',
    'This runner cannot modify production, merge code, send messages, or confirm a root cause by itself.','');
  return lines.join('\n');
}
module.exports={configFor,stateFor,initialState,evolve,renderMarkdown,classify};
