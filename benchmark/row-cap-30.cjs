'use strict';
// Independent, pre-registered 30-case benchmark for the row-cap signature.
// Labels: 1=static risk signature, 0=no static risk signature, null=requires manual review.
// Label audit 2026-10-22: range-computed changed from 0 to null because a
// computed .range() alone does not prove page iteration/completeness.
// This denominator change is NOT an independent/blind validation.
// These labels are NOT production-bug ground truth.
const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const cases=[["unbounded-basic",1,"const q = supabase.from('orders').select('*');"],["unbounded-filter",1,"const q = supabase.from('orders').select('id').eq('status','open');"],["unbounded-order",1,"const q = supabase.from('orders').select('id').order('id');"],["unbounded-variable",1,"const q = supabase.from('orders').select('id');\nq.eq('status','open');"],["unbounded-await",1,"async function run(){return await supabase.from('orders').select('*');}"],["range-fixed",1,"const q = supabase.from('orders').select('*').range(0,999);"],["range-fixed-small",1,"const q = supabase.from('orders').select('*').range(0,99);"],["limit-above-cap",1,"const q = supabase.from('orders').select('*').limit(50000);"],["conditional-limit",1,"let q = supabase.from('orders').select('*');\nif (flag) q=q.limit(10);"],["conditional-range",1,"const q = supabase.from('orders').select('*');\nif(flag) q.range(0,10);"],["rebound",1,"let q = supabase.from('orders').select('*');\nq=supabase.from('customers').select('*');"],["unbounded-whitespace",1,"const q = supabase\n .from('orders')\n .select('id');"],["unbounded-template",1,"const q = supabase.from(`orders`).select('id');"],["range-large",1,"const q = supabase.from('orders').select('*').range(0,2000);"],["limit-large",1,"const q = supabase.from('orders').select('*').limit(1001);"],["single",0,"const q = supabase.from('orders').select('*').single();"],["maybe-single",0,"const q = supabase.from('orders').select('*').maybeSingle();"],["head-count",0,"const q = supabase.from('orders').select('*',{head:true,count:'exact'});"],["range-computed",null,"const q = supabase.from('orders').select('*').range(offset,offset+999);"],["limit-small",0,"const q = supabase.from('orders').select('*').limit(20);"],["write-update",0,"const q = supabase.from('orders').update({status:'ok'}).eq('id',1);"],["write-insert",0,"const q = supabase.from('orders').insert({id:1});"],["write-delete",0,"const q = supabase.from('orders').delete().eq('id',1);"],["storage-from",0,"const q = supabase.storage.from('orders').download('a');"],["array-from",0,"const q = Array.from([1,2,3]);"],["dynamic-table",null,"const q = supabase.from(tableName).select('*');"],["dynamic-limit",null,"const q = supabase.from('orders').select('*').limit(maxRows);"],["branch-bounds",null,"let q=supabase.from('orders').select('*');\nif(flag){q=q.limit(20)}else{q=q.limit(30)}"],["nonliteral-head",null,"const q=supabase.from('orders').select('*',{head:countOnly});"],["single-no-order",null,"const q=supabase.from('orders').select('*').range(start,end);"]];
const root=path.resolve(__dirname,'..');
const dir=mkdtempSync(path.join(tmpdir(),'ghost-benchmark-'));
try {
  for(const [id,,code] of cases){const d=path.join(dir,id);mkdirSync(d);writeFileSync(path.join(d,'case.ts'),code+'\n');}
  const run=spawnSync(process.execPath,[path.join(root,'references/scan-unbounded-reads.cjs'),dir,'--json'],{cwd:root,encoding:'utf8'});
  if(run.error||run.status!==0){throw new Error('scanner failed: '+(run.error?.message||run.stderr));}
  const found=JSON.parse(run.stdout);
  const risky=f=>['UNBOUNDED','CONDITIONAL','UNKNOWN','RANGE_SINGLE','DYNAMIC_TABLE','EARLY_EXECUTION'].includes(f.kind)||f.falseCeiling===true||f.uncertainBound===true||f.paginationUnverified===true;
  const results=cases.map(([id,label])=>{
    const hits=found.filter(f=>f.file.replaceAll('\\','/').includes('/'+id+'/'));
    return {id,expected:label,observed:hits.some(risky)?1:0,kinds:hits.map(x=>x.kind),findingCount:hits.length};
  });
  const definite=results.filter(x=>x.expected!==null);
  const tp=definite.filter(x=>x.expected===1&&x.observed===1).length;
  const fn=definite.filter(x=>x.expected===1&&x.observed===0).length;
  const fp=definite.filter(x=>x.expected===0&&x.observed===1).length;
  const tn=definite.filter(x=>x.expected===0&&x.observed===0).length;
  const ratio=(a,b)=>b?a/b:null;
  const summary={total:results.length,scored:definite.length,ambiguous:results.length-definite.length,tp,fn,fp,tn,precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),specificity:ratio(tn,tn+fp)};
  console.log(JSON.stringify({summary,results},null,2));
  if(process.argv.includes('--strict')&&(fn||fp))process.exitCode=1;
} finally {rmSync(dir,{recursive:true,force:true});}
