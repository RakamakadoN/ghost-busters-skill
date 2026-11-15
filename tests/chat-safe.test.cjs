const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const base=path.join(root,'chat-safe');
test('Chat-Safe variant contains only six approved Markdown sources',()=>{
  const manifest=['SKILL.md','references/triage-protocol.md',
    'references/ghost-classes.md','references/cross-layer-contracts.md',
    'references/idempotency.md','references/evidence-and-output.md'].sort();
  const files=fs.readdirSync(base,{recursive:true,withFileTypes:true})
    .filter(x=>x.isFile()).map(x=>path.join(x.parentPath??x.path,x.name))
    .map(x=>path.relative(base,x).replaceAll(path.sep,'/')).sort();
  assert.deepEqual(files,manifest);
  const skill=fs.readFileSync(path.join(base,'SKILL.md'),'utf8');
  const pkg=require('../package.json');
  assert.match(skill,new RegExp('source-version: '+pkg.version.replaceAll('.','\\.')));
  for(const [,ref] of skill.matchAll(/\]\((references\/[^)]+)\)/g))
    assert.ok(manifest.includes(ref),'Broken Chat-Safe link '+ref);
  assert.match(skill,/NOT_RUN/);
  assert.match(skill,/Chat-Safe/);
});
test('Chat-Safe 13 class names agree with canonical reference',()=>{
 const source=fs.readFileSync(path.join(root,'references/ghost-classes.md'),'utf8');
 const safe=fs.readFileSync(path.join(base,'references/ghost-classes.md'),'utf8');
 const sourceClasses=[...source.matchAll(/^## ([1-9]|1[0-3])\. (.+)$/gm)]
   .map(m=>m[1]+': '+m[2]);
 const safeClasses=[...safe.matchAll(/^([1-9]|1[0-3])\. \*\*(.+?)\*\*/gm)]
   .map(m=>m[1]+': '+m[2]);
 assert.equal(sourceClasses.length,13);
 assert.deepEqual(safeClasses,sourceClasses);
});
test('Chat-Safe directions cannot authenticate E2 or execute arbitrary target code',()=>{
  const docs=['SKILL.md','references/evidence-and-output.md','references/idempotency.md']
   .map(f=>fs.readFileSync(path.join(base,f),'utf8')).join('\n');
  assert.match(docs,/does not run AST parsers/);
  assert.match(docs,/Chat-Safe alone does \*\*not\*\* provide E2/);
  assert.match(docs,/never runs them/);
});
