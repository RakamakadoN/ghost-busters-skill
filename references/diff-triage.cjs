#!/usr/bin/env node
'use strict';

// Read-only, bounded merge-base diff inventory for symptom-driven TRIAGE.
// Never executes project scripts, tests, hooks, custom git diff drivers or uploads.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const MAX_BUFFER=1024*1024,MAX_FILES=500;
const FLAG_REF=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
function help(){
 return ['Usage: node references/diff-triage.cjs --repo <authorized-directory> [--base main] [--json]',
  'Bounded, read-only merge-base diff; caller/dependency graph NOT TRACED. No target code execution.',
  'Exit 0 complete scope inventory, exit 1 partial/dirty, exit 2 error.'].join('\n')+'\n';
}
function sha(text){return crypto.createHash('sha256').update(text).digest('hex');}
function parseOptions(argv){
 if(argv.length===1&&['--help','-h'].includes(argv[0]))return {help:true};
 const options={base:'main'},seen=new Set();
 while(argv.length){
  const flag=argv.shift();
  if(seen.has(flag))throw new Error('Duplicate option');
  seen.add(flag);
  if(flag==='--json'){options.json=true;continue;}
  if(flag!=='--repo'&&flag!=='--base')throw new Error('Unknown option');
  const value=argv.shift();
  if(!value||value.startsWith('--'))throw new Error('Missing value');
  options[flag.slice(2)]=value;
 }
 if(!options.repo)throw new Error('Explicit --repo required');
 if(!FLAG_REF.test(options.base)||options.base.includes('..')||options.base.startsWith('-')||
    options.base.endsWith('/')||options.base.includes('//'))throw new Error('Unsupported base ref');
 return options;
}
function runGit(cwd,args){
 const env={...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',
  GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',
  GIT_PAGER:'cat',GIT_EXTERNAL_DIFF:'',GIT_TERMINAL_PROMPT:'0'};
 const p=spawnSync('git',['--no-optional-locks',...args],{
  cwd,env,encoding:'utf8',shell:false,timeout:5000,maxBuffer:MAX_BUFFER,
  windowsHide:true,stdio:['ignore','pipe','pipe']
 });
 if(p.error||p.status!==0||p.signal)throw new Error('Git read failed: '+args[0]);
 if(typeof p.stdout!=='string'||p.stdout.length>=MAX_BUFFER)throw new Error('Git output too large');
 return p.stdout;
}
function parseNames(out){
 if(!out.endsWith('\0')&&out!=='')throw new Error('Truncated NUL-delimited git inventory');
 const pieces=out?out.slice(0,-1).split('\0'):[];
 const files=[];
 for(let i=0;i<pieces.length;){
  const status=pieces[i++];
  if(!/^(?:A|M|D|T|R[0-9]{1,3}|C[0-9]{1,3})$/.test(status))
   throw new Error('Unsupported git status');
  const oldPath=pieces[i++];
  if(typeof oldPath!=='string'||!oldPath||oldPath.length>1024||
     oldPath.includes('\uFFFD'))throw new Error('Unsupported file path');
  let newPath=null;
  if(status[0]==='R'||status[0]==='C'){
   newPath=pieces[i++];
   if(typeof newPath!=='string'||!newPath||newPath.length>1024||
      newPath.includes('\uFFFD'))throw new Error('Unsupported renamed path');
  }
  files.push({status:status[0],path:newPath??oldPath,
    ...(newPath?{previousPath:oldPath}:{}),
    analysis:'CHANGED_PATH_ONLY',callerEdges:'NOT_TRACED'});
  if(files.length>MAX_FILES)throw new Error('Changed-file budget exceeded');
 }
 return files;
}
function classify(file){
 const p=file.path.toLowerCase();
 const categories=[];
 if(/(?:^|\/)(?:migrations?|policies|schema|supabase)(?:\/|$)|\.sql$/.test(p))
  categories.push('DB_SCHEMA_OR_POLICY');
 if(/(?:^|\/)(?:api|backend|routes?|handlers?|services?)(?:\/|$)|openapi|pydantic/.test(p))
  categories.push('API_OR_SERVICE');
 if(/(?:^|\/)(?:src|app|client|components?|pages?|hooks?)(?:\/|$)|\.(?:tsx|jsx)$/.test(p))
  categories.push('CLIENT_OR_UI');
 if(/(?:^|\/)(?:workflows|\.github|jobs?|queue|workers?)(?:\/|$)/.test(p))
  categories.push('ASYNCHRONOUS_OR_CI');
 return categories.length?categories:['UNCLASSIFIED'];
}
function reviewDiff({repo,base}){
 const cwd=fs.realpathSync(repo);
 if(!fs.statSync(cwd).isDirectory())throw new Error('Repository must be a directory');
 const root=fs.realpathSync(runGit(cwd,['rev-parse','--show-toplevel']).trim());
 if(cwd!==root)throw new Error('Use the Git repository root, not a partial subdirectory');
 const b=runGit(root,['rev-parse','--verify','--end-of-options',base+'^{commit}']).trim();
 const head=runGit(root,['rev-parse','--verify','--end-of-options','HEAD^{commit}']).trim();
 const mergeBase=runGit(root,['merge-base',b,head]).trim();
 if(!/^[a-f0-9]{40,64}$/.test(mergeBase)||!/^[a-f0-9]{40,64}$/.test(head))
  throw new Error('Invalid Git revision identity');
 const status=runGit(root,['status','--porcelain=v1','-z','--untracked-files=normal']);
 const dirty=status.length>0;
 const raw=runGit(root,['diff','--name-status','-z','--find-renames','--no-ext-diff',
  '--no-textconv',mergeBase,head,'--']);
 const files=parseNames(raw).map(f=>({...f,categories:classify(f)}));
 const boundaryReasons=[
  'Callers, consumers and cross-file contract edges were not traced.',
  'Git merge-base diff only covers committed changes between selected revisions.',
  ...(dirty?['Uncommitted or untracked work exists; worktree behavior may differ from HEAD.']:[])
 ];
 return {schemaVersion:'ghost-diff-0.1',mode:'TRIAGE_CHANGE_PRIORITIZATION',
  root,baseRef:base,baseCommit:b,headCommit:head,mergeBase,
  worktree:dirty?'DIRTY':'CLEAN',
  coverage:'CHANGED_PATHS_ONLY',evidence:'E0_CANDIDATE_ONLY',
  status:dirty?'PARTIAL':'SCOPED_INVENTORY_ONLY',
  sourceIdentitySha256:sha(raw),changedCount:files.length,files,
  needsWiderReview:dirty||files.some(f=>f.categories.some(c=>c!=='UNCLASSIFIED')),
  untracedEdges:'UNKNOWN',limitations:boundaryReasons,
  nextStep:'Inspect one-hop callers, DB migrations, RLS and serialization contracts; widen HUNT/RAID on any unresolved edge. Empty diff is not proof of no bug.'};
}
function main(args){
 const opts=parseOptions([...args]);if(opts.help){process.stdout.write(help());return 0;}
 const result=reviewDiff(opts);
 if(opts.json)process.stdout.write(JSON.stringify(result,null,2)+'\n');
 else{
  process.stdout.write('Ghost Busters — diff TRIAGE ('+result.status+')\n');
  process.stdout.write('Base '+result.baseCommit+'; HEAD '+result.headCommit+
   '; merge-base '+result.mergeBase+'\n');
  for(const file of result.files)process.stdout.write(file.status+' '+JSON.stringify(file.path)+
    ' ['+file.categories.join(', ')+']\n');
  process.stdout.write('Dependency graph: UNKNOWN. Read-only scope leads, not proof.\n');
 }
 return result.status==='PARTIAL'?1:0;
}
if(require.main===module){
 try{process.exitCode=main(process.argv.slice(2));}
 catch(err){process.stderr.write('diff-triage: '+String(err.message).replace(/[\x00-\x1f\x7f]/g,' ')+'\n');process.exitCode=2;}
}
module.exports={reviewDiff,parseNames,parseOptions};
