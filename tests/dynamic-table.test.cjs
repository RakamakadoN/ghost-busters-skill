'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('dynamic tables are review findings, not storage or Array calls',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-dynamic-table-'));
 try{
  fs.writeFileSync(path.join(dir,'case.ts'),[
   "db.from(tableName).select('*');",
   "db.from(`prefix_${suffix}`).select('id');",
   "db.from('orders').select('*').limit(20);",
   "db.storage.from(bucket).download('x');",
   "Array.from(items);",
   "db.from(tableName).insert({id:1});"
  ].join('\n'));
  const result=spawnSync(process.execPath,[path.join(root,'references/scan-unbounded-reads.cjs'),dir,'--json','--strict'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);
  const findings=JSON.parse(result.stdout);
  assert.equal(findings.filter(x=>x.kind==='DYNAMIC_TABLE').length,2);
  assert.equal(findings.filter(x=>x.kind==='LIMIT').length,1);
  assert.equal(findings.filter(x=>x.kind==='WRITE').length,0);
  assert.equal(findings.length,3);
  assert.ok(findings.filter(x=>x.kind==='DYNAMIC_TABLE').every(x=>x.table===null));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
