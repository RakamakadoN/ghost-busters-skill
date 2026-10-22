'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {assessRuntimeIdentity,assessHumanAlert,assessRegressionEvidence}
  =require('../references/lib/v1-6-gates.cjs');
const {configFor,evolve,initialState}=require('../references/lib/hunter.cjs');

function runtime() {
  return {
    evaluatedAt:'2026-10-23T10:00:00Z',maxAgeMinutes:60,
    expectedProjectRef:'synthetic-production-id',accessReadOnly:true,
    deployment:{source:'deployment-provider',observedAt:'2026-10-23T09:50:00Z',
      evidenceId:'private-ledger/deploy-01',projectRef:'synthetic-production-id',
      artifactId:'synthetic-build-hash'},
    runtime:{source:'runtime-response',observedAt:'2026-10-23T09:51:00Z',
      evidenceId:'private-ledger/runtime-01',projectRef:'synthetic-production-id',
      artifactId:'synthetic-build-hash'},
    database:{source:'readonly-database',observedAt:'2026-10-23T09:52:00Z',
      evidenceId:'private-ledger/db-01',projectRef:'synthetic-production-id',
      anchorRows:1300,minimumRows:100}
  };
}
function alert() {
  return {
    evaluatedAt:'2026-10-23T10:00:00Z',detectedAt:'2026-10-23T09:00:00Z',
    createdAt:'2026-10-23T09:02:00Z',deliveredAt:'2026-10-23T09:03:00Z',
    acknowledgedAt:'2026-10-23T09:04:00Z',
    maxCreateMinutes:10,maxDeliveryMinutes:10,maxAckMinutes:20,
    incidentChannel:'whatsapp',alertChannel:'email',channelIndependent:true,
    deliveryEvidenceId:'provider-receipt-A',ackEvidenceId:'acknowledgement-A'
  };
}
function regression() {
  return {
    evaluatedAt:'2026-10-23T10:00:00Z',environment:'isolated',
    testId:'synthetic-duplicate-posting',fixRevision:'synthetic-commit',
    before:{outcome:'FAIL',observedAt:'2026-10-23T08:00:00Z',
      evidenceId:'private-ci/red-01'},
    after:{outcome:'PASS',observedAt:'2026-10-23T09:00:00Z',
      evidenceId:'private-ci/green-01'},
    negativeControls:{total:3,passed:3}
  };
}
test('runtime: independent deployment/runtime/db sources corroborate candidate',()=>{
  const r=assessRuntimeIdentity(runtime());
  assert.equal(r.status,'CORROBORATED_CANDIDATE');
  assert.equal(r.corroborated,true);
  assert.equal(JSON.stringify(r).includes('synthetic-production-id'),false);
  assert.equal(JSON.stringify(r).includes('synthetic-build-hash'),false);
});
test('runtime: runtime points at a different database even if deployment agrees',()=>{
  const x=runtime();x.runtime.projectRef='different-database';
  assert.equal(assessRuntimeIdentity(x).status,'MISMATCH');
});
test('runtime: deployed runtime code differs from hosting artifact',()=>{
  const x=runtime();x.runtime.artifactId='older-build';
  assert.equal(assessRuntimeIdentity(x).status,'MISMATCH');
});
test('runtime: old telemetry is never fresh production proof',()=>{
  const x=runtime();x.runtime.observedAt='2026-10-22T01:00:00Z';
  assert.equal(assessRuntimeIdentity(x).status,'STALE_EVIDENCE');
});
test('runtime: read-only requirement blocks potential writes',()=>{
  const x=runtime();x.accessReadOnly=false;
  assert.equal(assessRuntimeIdentity(x).status,'UNSAFE_ACCESS');
});
test('runtime: empty/missing business data anchor cannot corroborate',()=>{
  const x=runtime();x.database.anchorRows=0;
  assert.equal(assessRuntimeIdentity(x).status,'INSUFFICIENT_EVIDENCE');
});
test('runtime: duplicate evidence ids and fake sources fail closed',()=>{
  const x=runtime();x.database.evidenceId=x.runtime.evidenceId;
  assert.throws(()=>assessRuntimeIdentity(x),/distinct/);
  x.database.evidenceId='other';x.runtime.source='operator-docs';
  assert.throws(()=>assessRuntimeIdentity(x),/runtime.source/);
});
test('human alert: verified independent delivery and acknowledgement',()=>{
  const r=assessHumanAlert(alert());
  assert.equal(r.status,'ACKNOWLEDGED');
  assert.equal(r.humanConfirmed,true);
  assert.equal(JSON.stringify(r).includes('provider-receipt-A'),false);
});
test('human alert: created task only, overdue delivery',()=>{
  const x=alert();x.deliveredAt=null;x.acknowledgedAt=null;
  assert.equal(assessHumanAlert(x).status,'DELIVERY_OVERDUE');
});
test('human alert: completed cron with no created task',()=>{
  const x=alert();x.createdAt=null;x.deliveredAt=null;x.acknowledgedAt=null;
  assert.equal(assessHumanAlert(x).status,'ALERT_MISSING');
});
test('human alert: received message without acknowledgement is unresolved',()=>{
  const x=alert();x.acknowledgedAt=null;
  assert.equal(assessHumanAlert(x).status,'ACK_OVERDUE');
});
test('human alert: current channel cannot be the only alert destination',()=>{
  const x=alert();x.alertChannel='whatsapp';
  assert.equal(assessHumanAlert(x).status,'DEPENDENT_CHANNEL');
});
test('human alert: false channel independence is a blocker',()=>{
  const x=alert();x.channelIndependent=false;
  assert.equal(assessHumanAlert(x).status,'DEPENDENT_CHANNEL');
});
test('human alert: an acknowledgement with no evidence is not confirmed',()=>{
  const x=alert();delete x.ackEvidenceId;
  assert.equal(assessHumanAlert(x).status,'ACK_UNVERIFIED');
});
test('human alert: impossible chronology rejected instead of reported healthy',()=>{
  const x=alert();x.acknowledgedAt='2026-10-23T08:00:00Z';
  assert.throws(()=>assessHumanAlert(x),/chronology/);
});
test('human alert: threshold not yet passed returns pending',()=>{
  const x=alert();x.evaluatedAt='2026-10-23T09:05:00Z';x.acknowledgedAt=null;
  assert.equal(assessHumanAlert(x).status,'ACK_PENDING');
});
test('regression: RED, then GREEN, plus controls recorded',()=>{
  const r=assessRegressionEvidence(regression());
  assert.equal(r.status,'RED_GREEN_RECORDED');
  assert.equal(r.evidenceRecorded,true);
  assert.equal(JSON.stringify(r).includes('private-ci'),false);
});
test('regression: green-only cannot prove fix resolved a defect',()=>{
  const x=regression();x.before.outcome='PASS';
  assert.equal(assessRegressionEvidence(x).status,'NO_RED_BASELINE');
});
test('regression: failing post-fix test does not count as repaired',()=>{
  const x=regression();x.after.outcome='FAIL';
  assert.equal(assessRegressionEvidence(x).status,'POST_FIX_FAILURE');
});
test('regression: failing negative control rejects verification',()=>{
  const x=regression();x.negativeControls.passed=2;
  assert.equal(assessRegressionEvidence(x).status,'CONTROL_FAILURE');
});
test('regression: test execution on production is always rejected',()=>{
  const x=regression();x.environment='production';
  assert.equal(assessRegressionEvidence(x).status,'UNSAFE_TEST_ENVIRONMENT');
});
test('regression: absent RED evidence is not silently accepted',()=>{
  const x=regression();delete x.before.evidenceId;
  assert.equal(assessRegressionEvidence(x).status,'INSUFFICIENT_EVIDENCE');
});
test('regression: reversed test chronology and duplicate evidence fail',()=>{
  const x=regression();x.after.observedAt='2026-10-23T07:00:00Z';
  assert.throws(()=>assessRegressionEvidence(x),/after test must follow/);
  x.after.observedAt='2026-10-23T09:00:00Z';x.after.evidenceId=x.before.evidenceId;
  assert.equal(assessRegressionEvidence(x).status,'INSUFFICIENT_EVIDENCE');
});
test('regression: independent review is an attestation, never a CI replacement',()=>{
  const x=regression();x.independentReview={completed:true,evidenceId:'private/review',
    reviewedAt:'2026-10-23T09:10:00Z'};
  assert.equal(assessRegressionEvidence(x).observed.independentReviewAttested,true);
  x.after.outcome='FAIL';
  assert.equal(assessRegressionEvidence(x).status,'POST_FIX_FAILURE');
});
test('CLI: strict passes only corroborated runtime, acknowledged alert and recorded regression',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-v16-'));
  const cli=path.resolve(__dirname,'../references/ghost-guard.cjs');
  try {
    const f=path.join(dir,'data.json');
    for(const [mode,x] of [['runtime-identity',runtime()],['human-alert',alert()],
      ['regression',regression()]]) {
      fs.writeFileSync(f,JSON.stringify(x));
      let run=spawnSync(process.execPath,[cli,mode,'--input',f,'--strict','--json'],
        {encoding:'utf8'});
      assert.equal(run.status,0,run.stderr);
      if(mode==='human-alert') x.acknowledgedAt=null;
      if(mode==='runtime-identity') x.runtime.artifactId='other';
      if(mode==='regression') x.negativeControls.passed=0;
      fs.writeFileSync(f,JSON.stringify(x));
      run=spawnSync(process.execPath,[cli,mode,'--input',f,'--strict'],
        {encoding:'utf8'});
      assert.equal(run.status,1,mode+' should block');
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('Hunter: new modes are available, with aggregate-only reporting',()=>{
  const c={version:1,checks:[
    {id:'runtime',mode:'runtime-identity',source:{kind:'file',path:'a'},openAfter:1},
    {id:'alert',mode:'human-alert',source:{kind:'file',path:'b'},openAfter:1},
    {id:'regression',mode:'regression',source:{kind:'file',path:'c'},openAfter:1}
  ]};
  assert.equal(configFor(c).checks.length,3);
  const bad=alert();bad.acknowledgedAt=null;
  const obs={runtime:runtime(),alert:bad,regression:regression()};
  const r=evolve(c,initialState(),obs,'2026-10-23T10:05:00Z');
  assert.equal(r.report.summary.open,1);
  assert.equal(r.report.checks[0].classification,'GOOD');
  assert.equal(r.report.checks[1].classification,'BAD');
  assert.equal(r.report.checks[2].classification,'GOOD');
  const json=JSON.stringify(r.report);
  assert.equal(json.includes('private-ledger'),false);
  assert.equal(json.includes('private-ci'),false);
  assert.equal(json.includes('provider-receipt'),false);
});
test('Hunter: stale evidence cannot resolve a previous alert',()=>{
  const c={version:1,checks:[{
    id:'alert',mode:'human-alert',source:{kind:'file',path:'b'},openAfter:1,resolveAfter:1
  }]};
  const bad=alert();bad.acknowledgedAt=null;
  const first=evolve(c,initialState(),{alert:bad},'2026-10-23T10:05:00Z');
  assert.equal(first.report.summary.open,1);
  const stale=alert();
  const next=evolve(c,first.state,{alert:stale},'2026-10-24T10:00:00Z');
  assert.equal(next.report.checks[0].status,'EVIDENCE_ERROR');
  assert.equal(next.report.summary.open,1);
});
