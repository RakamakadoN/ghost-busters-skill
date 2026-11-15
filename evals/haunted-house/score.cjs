#!/usr/bin/env node
'use strict';
// Offline grader for human/agent reports. Never runs investigated source.
const fs=require('node:fs');
const path=require('node:path');
const {load}=require('./verify.cjs');
function score(predictions,corpus=load()){
 if(!predictions||predictions.schemaVersion!=='haunted-house-predictions-0.1'||
   !Array.isArray(predictions.predictions)||predictions.predictions.length>12)
  throw new Error('Invalid prediction schema or budget');
 const allowed=new Map();
 for(const c of corpus.cases){
  for(const v of ['a','b'])allowed.set(c.id+':'+v,c.buggyVariant===v);
 }
 const results=new Map();
 for(const p of predictions.predictions){
  const key=p?.caseId+':'+p?.variant;
  if(!allowed.has(key)||results.has(key)||!['BUG','SAFE','UNKNOWN'].includes(p?.decision))
   throw new Error('Unknown, duplicate or invalid prediction');
  if(p.decision==='BUG'&&
    !(typeof p.file==='string'&&p.file.length<256&&
      Number.isSafeInteger(p.line)&&p.line>0&&
      typeof p.trigger==='string'&&p.trigger.trim()&&p.trigger.length<1500&&
      typeof p.falsifier==='string'&&p.falsifier.trim()&&p.falsifier.length<1500))
    throw new Error('BUG prediction requires file:line, trigger and falsifier');
  results.set(key,p.decision);
 }
 let tp=0,fp=0,fn=0,tn=0,unknown=0;
 for(const [key,isBug] of allowed){
  const predicted=results.get(key)??'UNKNOWN';
  if(predicted==='UNKNOWN'){unknown++;continue;}
  if(predicted==='BUG'){if(isBug)tp++;else fp++;}
  else if(isBug)fn++;else tn++;
 }
 const answered=tp+fp+fn+tn;
 return {schemaVersion:'haunted-house-score-0.1',
  oracle:'AUTHOR_LABELLED_SYNTHETIC_FIXTURES',
  status:unknown?'PARTIAL_CLASSIFICATION':'FULL_CLASSIFICATION',
  scoredVariants:answered,totalVariants:allowed.size,unknown,
  tp,fp,fn,tn,
  precisionWithinAnswered:(tp+fp)?tp/(tp+fp):null,
  recallWithinAnswered:(tp+fn)?tp/(tp+fn):null,
  limitations:[
    'Published author-written labels are not a blinded or independent test set.',
    'Unknown or skipped examples are not counted as true negatives.',
    'This evaluates predictions against fixture labels, not actual production behavior or E2 proof.',
    'Source locations and claimed execution logs still require independent human validation.'
  ]};
}
function main(args){
 if(args[0]!=='--input'||!args[1]||args.length>3||
    args.length===3&&args[2]!=='--json')throw new Error('Usage: --input <predictions.json> [--json]');
 const file=path.resolve(args[1]),st=fs.lstatSync(file);
 if(st.isSymbolicLink()||!st.isFile()||st.size>65536)throw new Error('Invalid prediction file');
 const result=score(JSON.parse(fs.readFileSync(file,'utf8')));
 process.stdout.write(args.includes('--json')?JSON.stringify(result,null,2)+'\n':
   'Haunted House: '+result.status+'; TP='+result.tp+' FP='+result.fp+
   ' FN='+result.fn+' TN='+result.tn+' UNKNOWN='+result.unknown+'\n');
}
if(require.main===module){
 try{main(process.argv.slice(2));}catch(err){
  process.stderr.write('haunted-house-score: '+String(err.message).replace(/[\x00-\x1f\x7f]/g,' ')+'\n');
  process.exitCode=2;
 }
}
module.exports={score};
