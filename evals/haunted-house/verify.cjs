#!/usr/bin/env node
'use strict';
// META-GHOST: deterministic integrity and supported-scanner smoke test.
// Executes only the repository's bundled static scanner on reviewed synthetic
// fixture text. NEVER executes fixture code, loads target modules or reads prod.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const corpus=path.join(__dirname,'fixtures');
const manifestPath=path.join(__dirname,'cases.json');
const EXPECTED_CASES=6;
const MAX_BYTES=32768;
function blobSha(bytes){
 return crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}
function guardFile(p){
 const rel=path.relative(root,p);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))
  throw new Error('Escaped trusted eval root');
 let cursor=root;
 for(const part of rel.split(path.sep)){
  cursor=path.join(cursor,part);
  if(fs.lstatSync(cursor).isSymbolicLink())throw new Error('Symlinked eval fixture refused');
 }
 const stat=fs.statSync(p);
 if(!stat.isFile()||stat.size>MAX_BYTES)throw new Error('Oversized or non-regular fixture');
 return fs.readFileSync(p);
}
function load(){
 const raw=guardFile(manifestPath);
 const manifest=JSON.parse(raw.toString('utf8'));
 if(manifest?.schemaVersion!=='haunted-house-0.1'||!Array.isArray(manifest.cases)||
    manifest.cases.length!==EXPECTED_CASES)throw new Error('Unexpected eval manifest');
 const ids=new Set(),named=new Set();
 for(const c of manifest.cases){
  if(!/^H-0[1-6]$/.test(c.id)||ids.has(c.id)||
     !['a','b'].includes(c.buggyVariant)||
     typeof c.oracle!=='string'||!c.oracle||
     typeof c.safeControl!=='string'||!c.safeControl||
     typeof c.supportedByBundledAutomatedScanner!=='boolean')
     throw new Error('Invalid or duplicate case oracle');
  ids.add(c.id);
  for(const v of ['a','b']){
   const a=c.variants?.[v];
   const ext=c.id==='H-03'?'py':'ts';
   const required='evals/haunted-house/fixtures/'+c.id.toLowerCase()+'/'+v+'.'+ext;
   if(a?.file!==required||typeof a.gitBlobSha1!=='string'||
      !/^[a-f0-9]{40}$/.test(a.gitBlobSha1)||named.has(required))
     throw new Error('Unexpected fixture identity');
   named.add(required);
   const bytes=guardFile(path.join(root,required));
   if(blobSha(bytes)!==a.gitBlobSha1)throw new Error('Fixture git blob mismatch: '+required);
  }
 }
 const found=[];
 function walk(dir){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   const p=path.join(dir,e.name);
   if(e.isSymbolicLink())throw new Error('Symlinked directory or file');
   if(e.isDirectory())walk(p);
   else if(e.isFile())found.push(path.relative(root,p).split(path.sep).join('/'));
   else throw new Error('Unsupported fixture node');
  }
 }
 walk(corpus);
 if(found.length!==named.size||found.some(s=>!named.has(s)))
  throw new Error('Unexpected additional or missing fixture: coverage incomplete');
 return manifest;
}
function evaluateScannerResult(output,caseData){
 if(!Array.isArray(output)||output.length!==2)
  throw new Error('Scanner coverage changed: expected two row-cap chains');
 const byVariant=new Map();
 for(const o of output){
  if(!o||typeof o.file!=='string'||!Number.isSafeInteger(o.line)||o.line<=0||
     typeof o.kind!=='string')throw new Error('Malformed scanner finding');
  const normalize=o.file.replaceAll('\\','/');
  const variant=normalize.endsWith('/h-06/a.ts')?'a':
    normalize.endsWith('/h-06/b.ts')?'b':null;
  if(!variant||byVariant.has(variant))throw new Error('Unexpected/duplicate scanner finding');
  byVariant.set(variant,{kind:o.kind,line:o.line,file:normalize});
 }
 const bug=caseData.buggyVariant;
 const good=bug==='a'?'b':'a';
 if(byVariant.get(bug)?.kind!=='UNBOUNDED')
  throw new Error('META-GHOST: scanner missed the supported defect fixture');
 if(byVariant.get(good)?.kind!=='RANGE')
  throw new Error('META-GHOST: supported negative control changed or was flagged');
 return {tp:1,fp:0,fn:0,tn:1,observations:[byVariant.get('a'),byVariant.get('b')]};
}
function verify(){
 const manifest=load(),caseData=manifest.cases.find(x=>x.id==='H-06');
 if(!caseData||!caseData.supportedByBundledAutomatedScanner||
    manifest.cases.filter(x=>x.supportedByBundledAutomatedScanner).length!==1)
  throw new Error('Supported scanner coverage changed');
 const cmd=path.join(root,'references/scan-unbounded-reads.cjs');
 guardFile(cmd);
 const proc=spawnSync(process.execPath,[cmd,path.join(corpus,'h-06'),'--cap','1000','--json'],{
  cwd:root,env:{...process.env,NODE_OPTIONS:''},encoding:'utf8',
  shell:false,timeout:12000,maxBuffer:256*1024,stdio:['ignore','pipe','pipe']
 });
 if(proc.error||proc.signal||proc.status!==0)
  throw new Error('META-GHOST: scanner unavailable, timed out, or failed');
 let output;
 try{output=JSON.parse(proc.stdout);}catch{throw new Error('META-GHOST: invalid scanner JSON');}
 const scored=evaluateScannerResult(output,caseData);
 return {schemaVersion:'haunted-house-smoke-0.1',
  status:'PASS_FOR_ONE_SUPPORTED_SYNTHETIC_PAIR',
  harness:'REPO_BUNDLED_SCANNER_ON_HASH_PINNED_FIXTURES',
  fixtureCount:12,pairs:6,automatedPairs:1,agentOnlyPairs:5,
  toolExecutedTargetCode:false,evidenceLevel:'SYNTHETIC_REGRESSION_ONLY',
  parserHealthy:true,scopeCompleteForSupportedPair:true,
  supportedConfusionMatrix:{tp:scored.tp,fp:scored.fp,fn:scored.fn,tn:scored.tn},
  observations:scored.observations,
  limitations:[
   'Five other pairs require a separate agent/human evaluation and were not automatically detected.',
   'A matched synthetic pair is not independent third-party precision or recall.',
   'Passing the scanner smoke does not prove production behavior or complete repository coverage.'
  ]};
}
if(require.main===module){
 try{
  const args=process.argv.slice(2);
  if(args.length&&!(args.length===1&&args[0]==='--json'))
   throw new Error('Supported option: --json');
  const r=verify();
  process.stdout.write(args.length?JSON.stringify(r,null,2)+'\n':
   'Haunted House META-GHOST: '+r.status+
   '; automated pairs '+r.automatedPairs+'/'+r.pairs+'\n');
 }catch(e){process.stderr.write('haunted-house: '+String(e.message).replace(/[\x00-\x1f\x7f]/g,' ')+'\n');process.exitCode=2;}
}
module.exports={load,verify,evaluateScannerResult,blobSha};
