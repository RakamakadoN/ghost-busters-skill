'use strict';
// Harder second-round challenge. Frozen labels before execution.
// "safe" means no risk signature under documented static heuristics,
// NOT that the query is complete or safe in production.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const cases=[["plain-missing-pagination","risk","const r=await db.from('orders').select('id');"],["filtered-unbounded","risk","const r=await db.from('orders').select('*').gte('created_at','2025-01-01');"],["fixed-first-page","risk","const r=await db.from('orders').select('*').range(0,999);"],["oversized-limit","risk","const r=await db.from('orders').select('*').limit(100000);"],["conditional-bound","risk","let q=db.from('orders').select('*');if(flag)q=q.limit(10);"],["multiline-unbounded","risk","const r=db\n .from('orders')\n .select('id');"],["unbounded-in-function","risk","function read(){return db.from('orders').select('id');}"],["shadow-unbounded","risk","function f(){const q=db.from('orders').select('*');{const q=db.from('users').select('*').single();}return q;}"],["fixed-page-2","risk","const r=db.from('orders').select('*').range(1000,1999);"],["no-bound-with-order","risk","const r=db.from('orders').select('id').order('id',{ascending:true});"],["head-only","safe","const r=db.from('orders').select('*',{head:true,count:'exact'});"],["single-row","safe","const r=db.from('orders').select('*').single();"],["maybe-single-row","safe","const r=db.from('orders').select('*').maybeSingle();"],["computed-range","safe","const r=db.from('orders').select('*').range(offset,offset+pageSize-1);"],["small-limit","safe","const r=db.from('orders').select('*').limit(50);"],["insert-write","safe","const r=db.from('orders').insert({id:1});"],["update-write","safe","const r=db.from('orders').update({ok:true}).eq('id',1);"],["storage-call","safe","const r=db.storage.from('orders').download('x');"],["array-call","safe","const r=Array.from([1,2,3]);"],["delete-write","safe","const r=db.from('orders').delete().eq('id',1);"],["dynamic-table-name","review","const r=db.from(tableName).select('*');"],["dynamic-limit","review","const r=db.from('orders').select('*').limit(maxRows);"],["dynamic-head","review","const r=db.from('orders').select('*',{head:onlyCount});"],["if-else-bounded","review","let q=db.from('orders').select('*');if(flag){q=q.limit(10);}else{q=q.limit(20);}"],["range-dynamic-without-loop","review","const r=db.from('orders').select('*').range(start,end);"],["limit-zero","review","const r=db.from('orders').select('*').limit(0);"],["runtime-conditional-single","review","let q=db.from('orders').select('*');if(flag)q=q.single();"],["table-variable-in-template","review","const r=db.from(`${prefix}_orders`).select('*');"],["range-non-numeric","review","const r=db.from('orders').select('*').range('0','999');"],["nested-call-chain","review","const r=wrap(db.from('orders').select('*'));"]];
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-challenge-'));
try{
 for(const [id,,source] of cases){const d=path.join(dir,id);fs.mkdirSync(d);fs.writeFileSync(path.join(d,'case.ts'),source+'\n');}
 const run=cp.spawnSync(process.execPath,[path.join(root,'references/scan-unbounded-reads.cjs'),dir,'--json'],{cwd:root,encoding:'utf8'});
 if(run.error||run.status!==0)throw Error('Scanner failed: '+(run.error?.message||run.stderr));
 const all=JSON.parse(run.stdout);
 const risky=f=>['UNBOUNDED','CONDITIONAL','UNKNOWN','RANGE_SINGLE','DYNAMIC_TABLE'].includes(f.kind)||f.falseCeiling===true||f.uncertainBound===true;
 const results=cases.map(([id,expected])=>{
   const matches=all.filter(f=>f.file.replaceAll('\\','/').includes('/'+id+'/'));
   const observed=matches.some(risky)?'risk':'safe';
   return {id,expected,observed,kinds:matches.map(f=>f.kind),pass:expected==='review'?null:expected===observed};
 });
 const scored=results.filter(r=>r.pass!==null);
 const tp=scored.filter(r=>r.expected==='risk'&&r.observed==='risk').length;
 const fn=scored.filter(r=>r.expected==='risk'&&r.observed==='safe').length;
 const fp=scored.filter(r=>r.expected==='safe'&&r.observed==='risk').length;
 const tn=scored.filter(r=>r.expected==='safe'&&r.observed==='safe').length;
 const div=(a,b)=>b?a/b:null;
 console.log(JSON.stringify({summary:{total:results.length,scored:scored.length,review:results.length-scored.length,tp,fn,fp,tn,precision:div(tp,tp+fp),recall:div(tp,tp+fn),specificity:div(tn,tn+fp)},results},null,2));
 if(process.argv.includes('--strict')&&(fp||fn))process.exitCode=1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
