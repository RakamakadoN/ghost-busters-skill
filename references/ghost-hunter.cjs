#!/usr/bin/env node
'use strict';

/** Ghost Busters Autonomous Hunter: explicit, read-only evidence evaluation. */
const fs=require('node:fs');
const path=require('node:path');
const {configFor,initialState,evolve,renderMarkdown}=require('./lib/hunter.cjs');
const {collect}=require('./lib/hunter-sources.cjs');

const MAX_CONFIG_BYTES=256*1024;
function arg(argv,name) {
  const ix=argv.indexOf(name);
  if(ix<0 || !argv[ix+1] || argv[ix+1].startsWith('--')) {
    throw new Error('Missing required argument '+name);
  }
  return argv[ix+1];
}
function parseDocument(file,limit=MAX_CONFIG_BYTES) {
  const stat=fs.statSync(file);
  if(!stat.isFile() || stat.size>limit) throw new Error('JSON file must be <=256 KiB');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function storeAtomic(filename,data) {
  const dest=path.resolve(filename);
  fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});
  const tmp=dest+'.'+process.pid+'.tmp';
  try {
    fs.writeFileSync(tmp,data,{mode:0o600,flag:'wx'});
    fs.renameSync(tmp,dest);
  } finally {
    if(fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
async function run(argv,env=process.env,fetchImpl=globalThis.fetch) {
  const configFile=path.resolve(arg(argv,'--config'));
  const stateFile=path.resolve(arg(argv,'--state'));
  const reportFile=path.resolve(arg(argv,'--report'));
  const markdownFile=path.resolve(arg(argv,'--markdown'));
  const now=argv.includes('--now') ? arg(argv,'--now') : new Date().toISOString();
  const config=configFor(parseDocument(configFile));
  const previous=fs.existsSync(stateFile)?parseDocument(stateFile):initialState();
  const observations=await collect(config,configFile,env,fetchImpl);
  const {state,report}=evolve(config,previous,observations,now);
  // Deliver the report first; never advance saved alert state without an
  // inspectable report. State contains only statuses/counters and timestamps.
  storeAtomic(reportFile,JSON.stringify(report,null,2)+'\n');
  storeAtomic(markdownFile,renderMarkdown(report));
  storeAtomic(stateFile,JSON.stringify(state,null,2)+'\n');
  if(argv.includes('--json')) console.log(JSON.stringify(report));
  else console.log('Ghost Busters v1.5 — '+report.summary.total+
    ' checks, '+report.summary.open+' open, '+report.summary.new+
    ' new, '+report.summary.recovered+' recovered. Report: '+reportFile);
  return 0;
}
if(require.main===module) {
  run(process.argv.slice(2)).catch(_=>{
    // Never interpolate HTTP errors, config contents or credential values
    // into logs. The private operator can inspect the local input directly.
    console.error('Ghost Hunter failed to initialize or store its report. Check config, state and filesystem.');
    process.exitCode=2;
  });
}
module.exports={run,parseDocument,storeAtomic};
