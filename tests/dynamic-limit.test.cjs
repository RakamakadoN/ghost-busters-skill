'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const scanner=path.join(root,'references/scan-unbounded-reads.cjs');

test('dynamic limit is explicitly uncertain and triggers strict mode',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-dynamic-limit-'));
 try{
  fs.writeFileSync(path.join(dir,'case.ts'),[
   "const a=db.from('orders').select('*').limit(maxRows);",
   "const b=db.from('orders').select('*').limit(20);",
   "const c=db.from('orders').select('*').limit(2000);"
  ].join('\n'));
  const r=spawnSync(process.execPath,[scanner,dir,'--json','--strict'],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,1,r.stderr);
  const f=JSON.parse(r.stdout);
  assert.equal(f.length,3);
  assert.equal(f[0].kind,'LIMIT');
  assert.equal(f[0].uncertainBound,true);
  assert.equal(f[0].falseCeiling,false);
  assert.equal(f[1].uncertainBound,false);
  assert.equal(f[1].falseCeiling,false);
  assert.equal(f[2].uncertainBound,false);
  assert.equal(f[2].falseCeiling,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
