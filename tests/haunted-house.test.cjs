'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {load,verify,evaluateScannerResult,blobSha}=require('../evals/haunted-house/verify.cjs');
const {score}=require('../evals/haunted-house/score.cjs');
function run(args){return spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:20000,maxBuffer:1024*1024});}
test('Six source-pinned bug/safe pairs and fixed scanner support scope',()=>{
 const m=load();
 assert.equal(m.cases.length,6);
 assert.equal(m.cases.filter(x=>x.supportedByBundledAutomatedScanner).length,1);
 for(const c of m.cases)assert.ok(['a','b'].includes(c.buggyVariant));
 const sha=blobSha(Buffer.from('fixture'));
 assert.match(sha,/^[a-f0-9]{40}$/);
});
test('Supported scanner actually distinguishes row-cap positive/negative',()=>{
 const m=verify();
 assert.equal(m.status,'PASS_FOR_ONE_SUPPORTED_SYNTHETIC_PAIR');
 assert.equal(m.automatedPairs,1);
 assert.equal(m.agentOnlyPairs,5);
 assert.deepEqual(m.supportedConfusionMatrix,{tp:1,fp:0,fn:0,tn:1});
 assert.equal(m.toolExecutedTargetCode,false);
});
test('META-GHOST detects lost or malformed supported scanner observations',()=>{
 const c=load().cases.find(x=>x.id==='H-06');
 assert.throws(()=>evaluateScannerResult([],c),/coverage changed/);
 assert.throws(()=>evaluateScannerResult([{file:'evals/haunted-house/fixtures/h-06/a.ts',kind:'RANGE',line:4},{file:'evals/haunted-house/fixtures/h-06/b.ts',kind:'RANGE',line:5}],c),/missed/);
 assert.throws(()=>evaluateScannerResult([{file:'evals/haunted-house/fixtures/h-06/a.ts',kind:'UNBOUNDED',line:4},{file:'evals/haunted-house/fixtures/h-06/b.ts',kind:'UNBOUNDED',line:5}],c),/negative control/);
});
test('Scorer does not turn abstentions or missing cases into true negatives',()=>{
 const m=load();
 const s=score({schemaVersion:'haunted-house-predictions-0.1',predictions:[]},m);
 assert.equal(s.status,'PARTIAL_CLASSIFICATION');
 assert.equal(s.unknown,12);
 assert.equal(s.tn,0);assert.equal(s.fn,0);
 assert.equal(s.precisionWithinAnswered,null);
});
test('Scorer labels real TP/FP and preserves unknown separately',()=>{
 const m=load(),c=m.cases[0],bad=c.buggyVariant,good=bad==='a'?'b':'a';
 const input={schemaVersion:'haunted-house-predictions-0.1',predictions:[
  {caseId:c.id,variant:bad,decision:'BUG',file:c.variants[bad].file,line:7,trigger:'bad response',falsifier:'allowed empty on error'},
  {caseId:c.id,variant:good,decision:'BUG',file:c.variants[good].file,line:7,trigger:'claim wrong',falsifier:'negative control'}
 ]};
 const s=score(input,m);
 assert.deepEqual([s.tp,s.fp,s.fn,s.tn,s.unknown],[1,1,0,0,10]);
 const duplicate={...input,predictions:[input.predictions[0],input.predictions[0]]};
 assert.throws(()=>score(duplicate,m),/duplicate/i);
});
test('Scorer refuses asserted bug without location and falsifier',()=>{
 const c=load().cases[0];
 assert.throws(()=>score({schemaVersion:'haunted-house-predictions-0.1',
  predictions:[{caseId:c.id,variant:'a',decision:'BUG'}]}),/requires file:line/);
});
test('Both offline CLI entrypoints produce bounded JSON without target execution',()=>{
 const r=run(['evals/haunted-house/verify.cjs','--json']);
 assert.equal(r.status,0,r.stderr);
 assert.equal(JSON.parse(r.stdout).toolExecutedTargetCode,false);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haunted-score-'));
 try{
  const file=path.join(dir,'input.json');
  fs.writeFileSync(file,JSON.stringify({schemaVersion:'haunted-house-predictions-0.1',predictions:[]}));
  const scoreResult=run(['evals/haunted-house/score.cjs','--input',file,'--json']);
  assert.equal(scoreResult.status,0,scoreResult.stderr);
  assert.equal(JSON.parse(scoreResult.stdout).unknown,12);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
