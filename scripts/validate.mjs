import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, reason) => { if (!condition) throw Error(reason); };
const skill = load('SKILL.md');
assert(skill.startsWith('---\n'), 'SKILL.md must have YAML frontmatter');
assert(/^name:\s*diyaz-forge\s*$/m.test(skill), 'Frontmatter name missing');
assert(/^  version:\s*2\.1\.0\s*$/m.test(skill), 'Wrong skill version');
assert(/^description:/m.test(skill), 'Description missing');
const files = [];
function walk(path = '') {
  for (const name of readdirSync(join(root, path))) {
    const next = join(path, name);
    if (name === '.git' || name === 'node_modules') continue;
    if (statSync(join(root, next)).isDirectory()) walk(next);
    else files.push(next.replaceAll('\\', '/'));
  }
}
walk();
const links = [...skill.matchAll(/`(references\/[^`]+\.md)`/g)].map(x => x[1]);
for (const link of links) assert(files.includes(link), `Missing reference: ${link}`);
const forbidden = ['using (true) with check (true)', 'grant select, insert, update, delete on public.%i to anon'];
const docs = files.filter(x => x.endsWith('.md')).map(x => load(x).toLowerCase()).join('\n');
for (const pattern of forbidden) {
  // Forbidden phrase may be mentioned as warning, but must not appear in executable SQL example.
  assert(!load('examples/secure-rls.sql').toLowerCase().includes(pattern), `Dangerous SQL fixture: ${pattern}`);
}
assert(!/service_role_key\s*=/.test(load('examples/paginated-read.ts')), 'Potential secret in example');
assert(/no production mutation without specific owner approval/i.test(load('references/migrations-release.md')), 'Production approval gate missing');
assert(/anonymous writes/i.test(skill), 'Missing anonymous write warning');
assert(/pagination/i.test(skill), 'Missing data completeness requirement');
console.log(`PASS: frontmatter, references, security fixtures, gates (${files.length} files)`);
