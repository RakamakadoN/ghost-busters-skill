import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const scenarios = JSON.parse(readFileSync(resolve(root, 'evals/scenarios.json'), 'utf8'));
const ids = new Set();
for (const item of scenarios) {
  if (!item.id || ids.has(item.id)) throw Error(`Bad/duplicate eval id: ${item.id}`);
  ids.add(item.id);
  if (!item.request || !item.must?.length || !item.must_not?.length) throw Error(`Incomplete scenario: ${item.id}`);
}
console.log(`PASS: ${scenarios.length} well-formed evaluation prompts`);
console.log('NOTE: This validates scenario structure; it does not execute any LLM or measure model quality.');
