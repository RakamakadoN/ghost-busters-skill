'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {configFor,evolve,initialState,renderMarkdown}=require('../references/lib/hunter.cjs');
const {readFileEvidence,readHttpsEvidence,validateHttpsAddress,parseSmallJson,LIMIT}
  =require('../references/lib/hunter-sources.cjs');
const {run}=require('../references/ghost-hunter.cjs');

const sourcePath=path.join(__dirname,'../examples/pulse-suspected.json');
const source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const config={version:1,allowedHosts:[],checks:[{
  id:'orders-pulse',mode:'pulse',
  source:{kind:'file',path:'examples/pulse-suspected.json'},
  openAfter:2,resolveAfter:2
}]};
const T0='2026-10-22T16:01:00Z',T1='2026-10-22T16:02:00Z',
      T2='2026-10-22T16:03:00Z',T3='2026-10-22T16:04:00Z',
      T4='2026-10-22T16:05:00Z';

function step(state,observation,at) {
 return evolve(config,state,{'orders-pulse':observation},at);
}
function healthyPulse() {
 const r=structuredClone(source);
 r.runs[1].rowsImported=1;
 r.downstream.newRecords=1;
 return r;
}
test('config accepts explicit sources and threshold values',()=>{
 const c=configFor(config);
 assert.equal(c.checks.length,1);
 assert.equal(c.checks[0].openAfter,2);
});
test('rejects duplicate check ids',()=>{
 const x=structuredClone(config);x.checks.push(x.checks[0]);
 assert.throws(()=>configFor(x),/Duplicate/);
});
test('rejects invalid modes and empty sources',()=>{
 const x=structuredClone(config);x.checks[0].mode='shell';
 assert.throws(()=>configFor(x),/Unknown/);
 x.checks[0].mode='pulse';x.checks[0].source={kind:'command',command:'rm -rf'};
 assert.throws(()=>configFor(x),/source/);
});
test('rejects excessive checks and unsafe names',()=>{
 const x=structuredClone(config);x.checks[0].id='../bad';
 assert.throws(()=>configFor(x),/safe id/);
});
test('requires repeated failures before first alert',()=>{
 const r=step(initialState(),source,T0);
 assert.equal(r.report.summary.open,0);
 assert.equal(r.report.transitions.length,0);
 assert.equal(r.state.checks['orders-pulse'].badStreak,1);
});
test('second failed sample opens once, third does not spam',()=>{
 const a=step(initialState(),source,T0);
 const b=step(a.state,source,T1);
 const c=step(b.state,source,T2);
 assert.equal(b.report.transitions[0].event,'OPENED');
 assert.equal(c.report.transitions.length,0);
 assert.equal(c.report.summary.open,1);
});
test('recovery waits for two healthy observations',()=>{
 const a=step(step(initialState(),source,T0).state,source,T1);
 const b=step(a.state,healthyPulse(),T2);
 const c=step(b.state,healthyPulse(),T3);
 assert.equal(b.report.summary.open,1);
 assert.equal(c.report.transitions[0].event,'RECOVERED');
 assert.equal(c.report.summary.open,0);
});
test('missing evidence never marks existing problem resolved',()=>{
 const open=step(step(initialState(),source,T0).state,source,T1);
 const gone=step(open.state,null,T2);
 assert.equal(gone.report.checks[0].status,'EVIDENCE_ERROR');
 assert.equal(gone.report.summary.open,1);
 assert.equal(gone.report.transitions.length,0);
});
test('first missing observation is a potential alert, not healthy',()=>{
 const x=step(initialState(),null,T0);
 assert.equal(x.report.checks[0].classification,'BAD');
 assert.equal(x.report.summary.open,0);
});
test('unknown status does not auto-clear an incident',()=>{
 const open=step(step(initialState(),source,T0).state,source,T1);
 const uncertain=structuredClone(source);
 uncertain.independentSignal.activityCount=0;
 const x=step(open.state,uncertain,T2);
 assert.equal(x.report.checks[0].classification,'UNKNOWN');
 assert.equal(x.report.summary.open,1);
});
test('bad evidence interrupts recovery countdown',()=>{
 const open=step(step(initialState(),source,T0).state,source,T1);
 const once=step(open.state,healthyPulse(),T2);
 const bad=step(once.state,source,T3);
 const again=step(bad.state,healthyPulse(),T4);
 assert.equal(again.report.summary.open,1);
});
test('state timestamp cannot move backwards',()=>{
 const a=step(initialState(),source,T2);
 assert.throws(()=>step(a.state,source,T1),/precedes/);
});
test('corrupted state is fail-closed',()=>{
 assert.throws(()=>step({version:9,checks:{}},source,T0),/Previous state invalid/);
});
test('pulse metrics are whitelisted, source hash never exposed',()=>{
 const x=step(initialState(),source,T0).report;
 const rendered=JSON.stringify(x);
 assert.equal(rendered.includes('synthetic-unchanged-fingerprint'),false);
 assert.equal(rendered.includes('rowsImported'),true);
});
test('report markdown lists event transitions and evidence limit',()=>{
 const a=step(initialState(),source,T0);
 const b=step(a.state,source,T1);
 const markdown=renderMarkdown(b.report);
 assert.match(markdown,/OPENED/);
 assert.match(markdown,/Evidence limit/);
});
test('impact BLOCKED becomes a candidate alert',()=>{
 const x={version:1,checks:[{id:'bulk',mode:'impact',source:{kind:'file',path:'foo'},openAfter:1}]};
 const r=evolve(x,initialState(),{bulk:{beforeVisible:1000,afterVisible:1005,unsafeNewRecords:2,
  hiddenRecordsReviewed:true,bulkActionsReviewed:true,dependencyReviewComplete:true,
  bulkActions:[],dependencyChecks:[]}},T0);
 assert.equal(r.report.checks[0].status,'BLOCKED');
 assert.equal(r.report.summary.open,1);
});
test('release is unknown, not automatically an incident if awaiting deploy evidence',()=>{
 const cfg={version:1,checks:[{id:'release',mode:'release',source:{kind:'file',path:'foo'},openAfter:1}]};
 const obs=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/release-unverified.json'),'utf8'));
 const r=evolve(cfg,initialState(),{release:obs},T0);
 assert.equal(r.report.checks[0].classification,'UNKNOWN');
});
test('environment mismatch opens an incident immediately when openAfter=1',()=>{
 const cfg={version:1,checks:[{id:'env',mode:'environment',source:{kind:'file',path:'foo'},openAfter:1}]};
 const obs=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/environment-mismatch.json'),'utf8'));
 assert.equal(evolve(cfg,initialState(),{env:obs},T0).report.summary.open,1);
});
test('HTTPS allowlist rejects private URLs and unapproved hosts',()=>{
 const hosts=['monitor.example.com'];
 for(const url of [
   'http://monitor.example.com/data',
   'https://localhost/data',
   'https://127.0.0.1/data',
   'https://another.example.com/data',
   'https://monitor.example.com/data?key=secret',
   'https://operator:pass@monitor.example.com/data',
   'https://monitor.example.com:8443/data'
 ]) assert.throws(()=>validateHttpsAddress(url,hosts),/URL must/);
 assert.equal(validateHttpsAddress('https://monitor.example.com/summary',hosts).hostname,'monitor.example.com');
});
test('HTTPS collector only uses GET and bearer env credential',async()=>{
 let seen;
 const src={url:'https://monitor.example.com/safe-aggregate',tokenEnv:'GHOST_HUNTER_SECRET'};
 const evidence=await readHttpsEvidence(src,['monitor.example.com'],{GHOST_HUNTER_SECRET:'synthetic-token'},
   async(url,opts)=>{
     seen={url,opts};
     return new Response(JSON.stringify({status:'sample'}),{status:200,
       headers:{'content-type':'application/json'}});
   });
 assert.equal(evidence.status,'sample');
 assert.equal(seen.opts.method,'GET');
 assert.equal(seen.opts.redirect,'error');
 assert.equal(seen.opts.headers.authorization,'Bearer synthetic-token');
});
test('HTTPS collector rejects absent credentials before request',async()=>{
 await assert.rejects(()=>readHttpsEvidence({url:'https://monitor.example.com/s',
  tokenEnv:'GHOST_HUNTER_SECRET'},['monitor.example.com'],{},()=>{throw Error('sent');}),/missing/);
});
test('HTTPS collector rejects non-JSON content',async()=>{
 await assert.rejects(()=>readHttpsEvidence({url:'https://monitor.example.com/s'},
  ['monitor.example.com'],{},async()=>new Response('html',{headers:{'content-type':'text/html'}})),/non-JSON/);
});
test('HTTPS collector rejects oversized content',async()=>{
 const response=new Response('x'.repeat(LIMIT+1),{headers:{'content-type':'application/json'}});
 await assert.rejects(()=>readHttpsEvidence({url:'https://monitor.example.com/s'},
  ['monitor.example.com'],{},async()=>response),/Oversized/);
});
test('collector rejects arrays and oversized JSON evidence',()=>{
 assert.throws(()=>parseSmallJson(Buffer.from('[]')),/object/);
 assert.throws(()=>parseSmallJson(Buffer.alloc(LIMIT+1)),/exceeds/);
});
test('file reader rejects absolute path and escape',()=>{
 const configPath=path.join(__dirname,'../examples/hunter.config.json');
 assert.throws(()=>readFileEvidence(configPath,'/etc/passwd'),/Absolute/);
 assert.throws(()=>readFileEvidence(configPath,'../../package.json'),/inside/);
});
test('file reader loads permitted aggregate fixture',()=>{
 const configPath=path.join(__dirname,'../examples/hunter.config.json');
 const o=readFileEvidence(configPath,'pulse-suspected.json');
 assert.equal(o.snapshots.length,3);
});
test('CLI persists state across two runs without duplicate alerts',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-hunter-'));
 try{
  const cfg=path.join(dir,'config.json'),sample=path.join(dir,'sample.json');
  const state=path.join(dir,'state.json'),out=path.join(dir,'report.json'),
    md=path.join(dir,'report.md');
  fs.writeFileSync(sample,JSON.stringify(source));
  fs.writeFileSync(cfg,JSON.stringify({...config,checks:[
    {...config.checks[0],source:{kind:'file',path:'sample.json'}}
  ]}));
  for(const now of [T0,T1,T2]){
    assert.equal(await run(['--config',cfg,'--state',state,'--report',out,
      '--markdown',md,'--now',now]),0);
  }
  const report=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.equal(report.summary.open,1);
  assert.equal(report.transitions.length,0);
  assert.equal(fs.statSync(state).mode & 0o777,0o600);
 }finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI does not write output on invalid state',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-hunter-'));
 try{
  const cfg=path.join(dir,'config.json'),sample=path.join(dir,'sample.json');
  const state=path.join(dir,'state.json'),out=path.join(dir,'out.json'),
    md=path.join(dir,'report.md');
  fs.writeFileSync(sample,JSON.stringify(source));
  fs.writeFileSync(cfg,JSON.stringify({...config,checks:[
    {...config.checks[0],source:{kind:'file',path:'sample.json'}}
  ]}));
  fs.writeFileSync(state,JSON.stringify({version:999,checks:{}}));
  await assert.rejects(()=>run(['--config',cfg,'--state',state,'--report',out,
    '--markdown',md,'--now',T0]),/state invalid/);
  assert.equal(fs.existsSync(out),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
