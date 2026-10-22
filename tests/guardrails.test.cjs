'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {assessPulse,assessImpact,assessRelease,assessEnvironment,businessHoursBetween}
 =require('../references/lib/guardrails.cjs');

function pulse() {
 return {
  evaluatedAt:'2026-10-22T14:05:00Z',windowStart:'2026-10-21T04:00:00Z',
  windowEnd:'2026-10-22T14:00:00Z',timezone:'Asia/Almaty',
  businessHours:{weekdays:[1,2,3,4,5],from:'09:00',to:'19:00'},
  minimumBusinessHours:2,
  runs:[
   {at:'2026-10-21T04:30:00Z',ok:true,rowsImported:0},
   {at:'2026-10-21T05:00:00Z',ok:true,rowsImported:0},
   {at:'2026-10-22T06:30:00Z',ok:true,rowsImported:0}
  ],
  snapshots:[
   {at:'2026-10-21T05:00:00Z',fingerprint:'example-unchanged-hash',rowsCount:1300},
   {at:'2026-10-21T06:00:00Z',fingerprint:'example-unchanged-hash',rowsCount:1300},
   {at:'2026-10-22T08:00:00Z',fingerprint:'example-unchanged-hash',rowsCount:1300}
  ],
  downstream:{newRecords:0}, independentSignal:{activityCount:91,description:'Independent operational activity'}
 };
}
function impact(){
 return {
  beforeVisible:1000,afterVisible:1682,hiddenRecordsReviewed:true,
  unsafeNewRecords:0,bulkActionsReviewed:true,dependencyReviewComplete:true,
  bulkActions:[{name:'Send reminders',canActOnNewRecords:true,safeguardsVerified:true}],
  dependencyChecks:[{id:'stale-record cleanup',passed:true}]
 };
}
function release(){
 return {prMerged:true,commitInMain:true,requiredCiPassed:true,
  deploymentContainsFix:true,productionSmokePassed:true,environmentVerified:true,
  migrations:{required:false},deployedAt:'2026-10-22T12:00:00Z',
  smokeObservedAt:'2026-10-22T12:30:00Z'};
}
function environment(){
 return {expectedProjectRef:'stable-project-ref-01',observedProjectRef:'stable-project-ref-01',
  deployedProjectRef:'stable-project-ref-01',accessReadOnly:true,
  anchor:{name:'orders',observedRows:1517,minimumRows:100}};
}

test('pulse catches green runs with unchanged source and independent activity',()=>{
 const r=assessPulse(pulse());
 assert.equal(r.status,'SUSPECTED_SILENT_FAILURE');
 assert.equal(r.observed.imported,0);
 assert.equal(r.signals.unchangedSource,true);
 assert.equal(r.risk,'P1');
});
test('pulse does not misdiagnose progress as a stall',()=>{
 const x=pulse();x.runs[1].rowsImported=5;x.downstream.newRecords=5;
 assert.equal(assessPulse(x).status,'PROGRESS_OBSERVED');
});
test('pulse requires independent activity',()=>{
 const x=pulse();x.independentSignal.activityCount=0;
 assert.equal(assessPulse(x).status,'INSUFFICIENT_EVIDENCE');
});
test('pulse is not a ghost if the job has failed',()=>{
 const x=pulse();x.runs[0].ok=false;
 assert.equal(assessPulse(x).status,'EXECUTION_FAILURE');
});
test('pulse does not call one changed snapshot a frozen source',()=>{
 const x=pulse();x.snapshots[1].fingerprint='different';
 assert.equal(assessPulse(x).status,'NEEDS_INVESTIGATION');
});
test('pulse requires evidence during business hours',()=>{
 const x=pulse();
 x.businessHours.weekdays=[7];
 assert.equal(assessPulse(x).status,'INSUFFICIENT_EVIDENCE');
});
test('pulse rejects windows ending after evaluation',()=>{
 const x=pulse(); x.evaluatedAt='2026-10-21T00:00:00Z';
 assert.throws(()=>assessPulse(x),/Invalid pulse window/);
});
test('pulse rejects samples with no timezone on timestamp',()=>{
 const x=pulse();x.runs[0].at='2026-10-21T04:30:00';
 assert.throws(()=>assessPulse(x),/timezone/);
});
test('pulse ignores extra samples outside the declared window',()=>{
 const x=pulse();
 x.runs.push({at:'2026-10-20T00:00:00Z',ok:false,rowsImported:999});
 assert.equal(assessPulse(x).status,'SUSPECTED_SILENT_FAILURE');
});
test('pulse business hours use user timezone not UTC',()=>{
 const hours=businessHoursBetween(Date.parse('2026-10-22T04:00:00Z'),Date.parse('2026-10-22T07:00:00Z'),
  'Asia/Almaty',{weekdays:[1,2,3,4,5],from:'09:00',to:'19:00'});
 assert.equal(hours,3);
});
test('impact catches unsafe newly exposed records',()=>{
 const x=impact();x.unsafeNewRecords=402;
 const r=assessImpact(x);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.releaseAllowed,false);
 assert.match(r.blockers.join(' '),/402/);
});
test('impact blocks on failed prerequisite',()=>{
 const x=impact();x.dependencyChecks[0].passed=false;
 assert.equal(assessImpact(x).status,'BLOCKED');
});
test('impact blocks on unsafe bulk action',()=>{
 const x=impact();x.bulkActions[0].safeguardsVerified=false;
 assert.equal(assessImpact(x).status,'BLOCKED');
});
test('impact blocks ambiguous bulk-action review',()=>{
 const x=impact();x.bulkActionsReviewed=null;
 assert.equal(assessImpact(x).status,'REVIEW_REQUIRED');
});
test('impact does not approve an unreviewed hidden population',()=>{
 const x=impact();x.unsafeNewRecords=null;
 assert.equal(assessImpact(x).status,'REVIEW_REQUIRED');
});
test('impact clears a fully verified controlled expansion',()=>{
 const r=assessImpact(impact());
 assert.equal(r.status,'CLEAR');
 assert.equal(r.releaseAllowed,true);
});
test('impact refuses fake counts larger than added records',()=>{
 const x=impact();x.unsafeNewRecords=900;
 assert.throws(()=>assessImpact(x),/exceed/);
});
test('release requires the fix in deployed artifact',()=>{
 const x=release();x.deploymentContainsFix=false;
 assert.equal(assessRelease(x).status,'MERGED_NOT_DEPLOYED');
});
test('release separates prepared fix from delivered fix',()=>{
 const x=release();x.prMerged=false;
 assert.equal(assessRelease(x).status,'FIX_PREPARED');
});
test('release refuses to mark a missing smoke test as verified',()=>{
 const x=release();x.productionSmokePassed=null;
 assert.equal(assessRelease(x).status,'DEPLOYED_UNVERIFIED');
});
test('release blocks a required unapplied migration',()=>{
 const x=release();x.migrations={required:true,applied:false};
 assert.equal(assessRelease(x).status,'BLOCKED');
});
test('release refuses to claim production verification without observation timestamps',()=>{
 const x=release();delete x.smokeObservedAt;
 assert.equal(assessRelease(x).status,'DEPLOYED_UNVERIFIED');
 delete x.deployedAt;
 assert.equal(assessRelease(x).status,'DEPLOYED_UNVERIFIED');
});
test('release rejects predeployment smoke observation',()=>{
 const x=release();x.smokeObservedAt='2026-10-22T11:00:00Z';
 assert.equal(assessRelease(x).status,'BLOCKED');
});
test('release only verifies fully evidenced deployments',()=>{
 const r=assessRelease(release());
 assert.equal(r.status,'VERIFIED_IN_PRODUCTION');
 assert.equal(r.verified,true);
});
test('environment checks project ref and runtime binding, not display name',()=>{
 assert.equal(assessEnvironment(environment()).status,'VERIFIED_CANDIDATE');
});
test('environment detects wrong database even if it has the same display name',()=>{
 const x=environment();x.observedProjectRef='different-db';
 assert.equal(assessEnvironment(x).status,'MISMATCH');
});
test('environment with empty anchor cannot claim production',()=>{
 const x=environment();x.anchor.observedRows=0;
 assert.equal(assessEnvironment(x).status,'INSUFFICIENT_EVIDENCE');
});
test('environment with unknown binding cannot claim production',()=>{
 const x=environment();delete x.deployedProjectRef;
 assert.equal(assessEnvironment(x).status,'INSUFFICIENT_EVIDENCE');
});
test('environment refuses write-capable probe session',()=>{
 const x=environment();x.accessReadOnly=false;
 assert.equal(assessEnvironment(x).status,'UNSAFE_ACCESS');
});
test('offline CLI JSON strict mode succeeds only for verified release',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'ghost-guard-test-'));
 try{
  const filename=path.join(folder,'release.json');
  writeFileSync(filename,JSON.stringify(release()));
  const cli=path.resolve(__dirname,'../references/ghost-guard.cjs');
  const result=spawnSync(process.execPath,[cli,'release','--input',filename,'--json','--strict'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).status,'VERIFIED_IN_PRODUCTION');
 } finally{rmSync(folder,{recursive:true,force:true});}
});
test('offline CLI strict rejects a risky impact and errors invalid input',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'ghost-guard-test-'));
 try {
  const filename=path.join(folder,'impact.json');
  const data=impact();data.unsafeNewRecords=402;
  writeFileSync(filename,JSON.stringify(data));
  const cli=path.resolve(__dirname,'../references/ghost-guard.cjs');
  const risk=spawnSync(process.execPath,[cli,'impact','--input',filename,'--strict'],{encoding:'utf8'});
  assert.equal(risk.status,1);
  writeFileSync(filename,'{"secret":');
  const bad=spawnSync(process.execPath,[cli,'impact','--input',filename,'--strict'],{encoding:'utf8'});
  assert.equal(bad.status,2);
 } finally{rmSync(folder,{recursive:true,force:true});}
});
