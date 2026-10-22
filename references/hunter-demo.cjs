#!/usr/bin/env node
'use strict';

/** Always-current, synthetic two-run demonstration; no network or credentials. */
const fs=require('node:fs');
const path=require('node:path');
const {run}=require('./ghost-hunter.cjs');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'.ghost-hunter','synthetic-demo');
function write(name,o) {fs.writeFileSync(path.join(dir,name),JSON.stringify(o,null,2)+'\n',{mode:0o600});}
async function demo() {
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const config=JSON.parse(fs.readFileSync(path.join(root,'examples','hunter.config.json'),'utf8'));
  const files=['pulse-suspected.json','impact-blocked.json','release-unverified.json','environment-mismatch.json'];
  for(const file of files) {
    const o=JSON.parse(fs.readFileSync(path.join(root,'examples',file),'utf8'));
    if(file==='pulse-suspected.json') {
      const delta=Date.now()-Date.parse(o.evaluatedAt);
      const shift=s=>new Date(Date.parse(s)+delta).toISOString();
      for(const k of ['evaluatedAt','windowStart','windowEnd'])o[k]=shift(o[k]);
      for(const row of o.runs)row.at=shift(row.at);
      for(const row of o.snapshots)row.at=shift(row.at);
      o.businessHours={weekdays:[1,2,3,4,5,6,7],from:'00:00',to:'23:59'};
    }
    write(file,o);
  }
  const configFile=path.join(dir,'hunter.config.json');
  write('hunter.config.json',config);
  const state=path.join(dir,'state.json');
  const report=path.join(dir,'report.json'),markdown=path.join(dir,'report.md');
  if(fs.existsSync(state))fs.unlinkSync(state); // Demo state only, never user's live state.
  const args=['--config',configFile,'--state',state,'--report',report,'--markdown',markdown];
  await run([...args,'--now',new Date().toISOString()]);
  await run([...args,'--now',new Date(Date.now()+60000).toISOString()]);
  const result=JSON.parse(fs.readFileSync(report,'utf8'));
  if(result.summary.new<2) throw Error('Synthetic alert transitions not confirmed');
  console.log('SYNTHETIC DEMO PASS: '+result.summary.new+' new alerts after two observations.');
  console.log('Report: '+markdown);
}
if(require.main===module)demo().catch(()=>{console.error('Synthetic demonstration failed.');process.exitCode=1;});
module.exports={demo};
