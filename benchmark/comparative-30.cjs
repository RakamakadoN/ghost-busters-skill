'use strict';
// Controlled synthetic benchmark: Ghost Busters actual scanner vs a documented
// lightweight regex detector. It is NOT a head-to-head run against paid skills.
// Labels authored before the first run, not blinded, no production ground truth.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const cases = [
  ['plain-await', 1, 'const rows = await supabase.from("invoices").select("id");'],
  ['filtered', 1, 'const rows = supabase.from("invoices").select("*").eq("status", "open");'],
  ['ordered', 1, 'const rows = supabase.from("invoices").select("id").order("id");'],
  ['multiline-chain', 1, 'const rows = supabase\n  .from("invoices")\n  .select("id");'],
  ['fixed-first-page', 1, 'const rows = supabase.from("invoices").select("*").range(0, 999);'],
  ['fixed-second-page', 1, 'const rows = supabase.from("invoices").select("*").range(1000, 1999);'],
  ['oversized-limit', 1, 'const rows = supabase.from("invoices").select("*").limit(4000);'],
  ['conditional-limit', 1, 'let q = supabase.from("invoices").select("*"); if (flag) q = q.limit(10);'],
  ['conditional-range', 1, 'let q = supabase.from("invoices").select("*"); if (flag) q = q.range(0, 99);'],
  ['await-before-limit', 1, 'async function get() { let q = supabase.from("invoices").select("*"); await q; q = q.limit(10); return q; }'],
  ['then-before-limit', 1, 'let q = supabase.from("invoices").select("*"); q.then(() => {}); q = q.limit(10);'],
  ['async-unbounded', 1, 'async function getOrders() { return await supabase.from("invoices").select("id, total"); }'],
  ['variable-follow-filter', 1, 'let q = supabase.from("invoices").select("id"); q = q.eq("closed", false); return q;'],
  ['ordered-oversized-limit', 1, 'const q = supabase.from("invoices").select("id").order("id").limit(2000);'],
  ['variable-rebound', 1, 'let q = supabase.from("invoices").select("*"); q = supabase.from("clients").select("*").limit(10);'],

  ['small-limit', 0, 'const q = supabase.from("invoices").select("*").limit(25);'],
  ['single-row', 0, 'const q = supabase.from("invoices").select("*").eq("id", 1).single();'],
  ['maybe-single', 0, 'const q = supabase.from("invoices").select("*").eq("id", 1).maybeSingle();'],
  ['count-head', 0, 'const q = supabase.from("invoices").select("*", { head: true, count: "exact" });'],
  ['insert-only', 0, 'const q = supabase.from("invoices").insert({ id: 1 });'],
  ['update-only', 0, 'const q = supabase.from("invoices").update({ paid: true }).eq("id", 1);'],
  ['delete-only', 0, 'const q = supabase.from("invoices").delete().eq("id", 1);'],
  ['storage-from', 0, 'const q = supabase.storage.from("files").download("report.pdf");'],
  ['comment-decoy', 0, '// const q = supabase.from("invoices").select("*");\nconst answer = 42;'],
  ['other-library-decoy', 0, 'const q = knex.from("invoices").select("*");'],

  ['computed-range', null, 'const q = supabase.from("invoices").select("*").range(offset, offset + pageSize - 1);'],
  ['dynamic-limit', null, 'const q = supabase.from("invoices").select("*").limit(cap);'],
  ['dynamic-table', null, 'const q = supabase.from(tableName).select("*");'],
  ['dynamic-head', null, 'const q = supabase.from("invoices").select("*", { head: onlyCount });'],
  ['both-branches-bounded', null, 'let q = supabase.from("invoices").select("*"); if (x) {q=q.limit(5);} else {q=q.limit(10);}']
];

function atRisk(f) {
  return ['UNBOUNDED', 'CONDITIONAL', 'UNKNOWN', 'RANGE_SINGLE', 'DYNAMIC_TABLE', 'EARLY_EXECUTION'].includes(f.kind) ||
         f.falseCeiling === true || f.uncertainBound === true || f.paginationUnverified === true;
}

// Deliberately simple text heuristic. This is a baseline, not a paid skill.
// It cannot reason about conditional/late bounding or fixed pages.
function regexBaseline(source) {
  if (!/\bsupabase\s*\.\s*from\s*\(/s.test(source)) return 0;
  if (!/\.\s*select\s*\(/s.test(source)) return 0;
  if (/\.\s*(single|maybeSingle|limit|range)\s*\(/s.test(source)) return 0;
  if (/\bhead\s*:\s*true\b/s.test(source)) return 0;
  return 1;
}

function metrics(items, key) {
  const scored = items.filter(x => x.expected !== null);
  const tp = scored.filter(x => x.expected === 1 && x[key] === 1).length;
  const fn = scored.filter(x => x.expected === 1 && x[key] === 0).length;
  const fp = scored.filter(x => x.expected === 0 && x[key] === 1).length;
  const tn = scored.filter(x => x.expected === 0 && x[key] === 0).length;
  const ratio = (n, d) => d ? Number((n / d).toFixed(4)) : null;
  return {
    total: items.length,
    scored: scored.length,
    review: items.length - scored.length,
    tp, fn, fp, tn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    specificity: ratio(tn, tn + fp),
    accuracy: ratio(tp + tn, scored.length)
  };
}

const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-comparison-'));
try {
  for (const [id, , source] of cases) {
    const caseDir = path.join(dir, id);
    fs.mkdirSync(caseDir);
    fs.writeFileSync(path.join(caseDir, 'case.ts'), source + '\n');
  }
  const cli = path.join(root, 'references', 'scan-unbounded-reads.cjs');
  const run = cp.spawnSync(process.execPath,
    [cli, dir, '--client-root', 'supabase', '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (run.error || run.status !== 0) throw Error('Scanner failed: ' + (run.error?.message || run.stderr));
  const findings = JSON.parse(run.stdout);
  const results = cases.map(([id, expected, source]) => {
    const hits = findings.filter(f => f.file.replaceAll('\\', '/').includes('/' + id + '/'));
    return {
      id,
      expected,
      ghost: hits.some(atRisk) ? 1 : 0,
      baseline: regexBaseline(source),
      findings: hits.map(f => f.kind)
    };
  });
  const output = {
    title: 'Controlled static row-cap test, not a paid-skill head-to-head',
    date: '2026-10-22',
    scanner: 'references/scan-unbounded-reads.cjs on benchmark branch',
    scannerOptions: '--client-root supabase --json',
    warning: 'Hand-authored synthetic labels; not blinded; not production-bug ground truth. Review cases excluded from metrics. A positive means suspected row-cap signature, not a confirmed bug.',
    ghost: metrics(results, 'ghost'),
    regexBaseline: metrics(results, 'baseline'),
    results
  };
  const json = JSON.stringify(output, null, 2);
  fs.writeFileSync(path.join(root, 'benchmark', 'comparative-results.json'), json + '\n');
  console.log('COMPARATIVE_BENCHMARK_JSON_START');
  console.log(json);
  console.log('COMPARATIVE_BENCHMARK_JSON_END');
  if (process.argv.includes('--strict') && results.some(x => x.expected !== null && x.expected !== x.ghost)) process.exitCode = 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
