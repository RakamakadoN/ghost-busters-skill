'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {reviewDiff,parseNames,parseOptions}=require('../references/diff-triage.cjs');
const cli=path.resolve(__dirname,'../references/diff-triage.cjs');
function git(dir,...args){
 const r=spawnSync('git',args,{cwd:dir,encoding:'utf8',timeout:6000});
 assert.equal(r.status,0,(r.stderr||'')+' '+args.join(' '));
 return r.stdout;
}
function tmpRepo(t){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-diff-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 git(d,'init','-q','-b','main');
 fs.mkdirSync(path.join(d,'src'));
 fs.writeFileSync(path.join(d,'src/original.ts'),'export const original = 1;\n');
 git(d,'add','.');
 git(d,'-c','user.name=Fixture','-c','user.email=fixture@example.org','commit','-qm','base');
 git(d,'checkout','-q','-b','feature');
 return d;
}
test('Name/status NUL parser handles rename, modifications and rejects malformed entries',()=>{
 assert.deepEqual(parseNames('M\0src/a.ts\0R100\0src/old.ts\0src/new.ts\0'),[
  {status:'M',path:'src/a.ts',analysis:'CHANGED_PATH_ONLY',callerEdges:'NOT_TRACED'},
  {status:'R',path:'src/new.ts',previousPath:'src/old.ts',
   analysis:'CHANGED_PATH_ONLY',callerEdges:'NOT_TRACED'}
 ]);
 assert.throws(()=>parseNames('M\0src/a.ts'),/Truncated/);
 assert.throws(()=>parseNames('X\0src/a.ts\0'),/Unsupported git status/);
});
test('Options reject unknown base refs and require explicit authorized path',()=>{
 assert.throws(()=>parseOptions(['--base','main']),/repo/);
 assert.throws(()=>parseOptions(['--repo','/tmp','--base','--bad']),/Missing/);
 assert.throws(()=>parseOptions(['--repo','/tmp','--base','../main']),/Unsupported/);
 assert.throws(()=>parseOptions(['--repo','/tmp','--execute']),/Unknown/);
});
test('Merge-base inventory prioritizes files while leaving callers UNKNOWN',t=>{
 const d=tmpRepo(t);
 fs.mkdirSync(path.join(d,'db/migrations'),{recursive:true});
 fs.writeFileSync(path.join(d,'db/migrations/001.sql'),'ALTER TABLE orders ADD COLUMN status text;\n');
 fs.writeFileSync(path.join(d,'src/original.ts'),'export const original = 2;\n');
 git(d,'add','.');
 git(d,'-c','user.name=Fixture','-c','user.email=fixture@example.org','commit','-qm','changed');
 const report=reviewDiff({repo:d,base:'main'});
 assert.equal(report.status,'SCOPED_INVENTORY_ONLY');
 assert.equal(report.changedCount,2);
 assert.equal(report.worktree,'CLEAN');
 assert.equal(report.untracedEdges,'UNKNOWN');
 assert.equal(report.needsWiderReview,true);
 assert.ok(report.files.some(f=>f.categories.includes('DB_SCHEMA_OR_POLICY')));
 assert.ok(report.files.some(f=>f.categories.includes('CLIENT_OR_UI')));
 assert.ok(report.files.every(f=>f.callerEdges==='NOT_TRACED'));
 assert.match(report.mergeBase,/^[a-f0-9]{40}$/);
});
test('Dirty worktree never yields a complete/invariant-clean report',t=>{
 const d=tmpRepo(t);
 fs.writeFileSync(path.join(d,'src/original.ts'),'changed but uncommitted\n');
 const report=reviewDiff({repo:d,base:'main'});
 assert.equal(report.changedCount,0);
 assert.equal(report.status,'PARTIAL');
 assert.equal(report.worktree,'DIRTY');
 assert.match(report.nextStep,/Empty diff is not proof/);
 const p=spawnSync(process.execPath,[cli,'--repo',d,'--base','main','--json'],{
  encoding:'utf8',timeout:10000});
 assert.equal(p.status,1,p.stderr);
 assert.equal(JSON.parse(p.stdout).status,'PARTIAL');
});
test('Missing base ref and hostile ref syntax fail closed',t=>{
 const d=tmpRepo(t);
 assert.throws(()=>reviewDiff({repo:d,base:'nonexistent'}),/Git read failed/);
 const p=spawnSync(process.execPath,[cli,'--repo',d,'--base','--evil','--json'],{
  encoding:'utf8',timeout:10000});
 assert.equal(p.status,2);
 assert.match(p.stderr,/Missing value/);
});
test('Empty diff is scoped inventory, never assertion of no defects',t=>{
 const d=tmpRepo(t);
 const report=reviewDiff({repo:d,base:'main'});
 assert.equal(report.status,'SCOPED_INVENTORY_ONLY');
 assert.equal(report.changedCount,0);
 assert.equal(report.coverage,'CHANGED_PATHS_ONLY');
 assert.equal(report.evidence,'E0_CANDIDATE_ONLY');
});
