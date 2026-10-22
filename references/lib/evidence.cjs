'use strict';
/**
 * Small, zero-dependency evidence/CLI helpers shared by the three v1.4 tools.
 * These tools analyze an explicitly supplied local JSON snapshot. They never
 * connect to production, mutate records, merge PRs or trigger deployments.
 */
const fs = require('node:fs');

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requireObject(value, name) {
  if (!object(value)) throw new TypeError(name + ' must be a JSON object');
  return value;
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(name + ' must be a nonempty string');
  return value;
}
function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(name + ' must be true or false');
  return value;
}
function nonNegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(name + ' must be a finite nonnegative number');
  return value;
}
function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(name + ' must be an integer >= 1');
  return value;
}
function timestamp(value, name) {
  text(value, name);
  // Require an explicit timezone to keep all fixtures/reports reproducible.
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    throw new TypeError(name + ' must be an ISO 8601 timestamp with timezone');
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new TypeError(name + ' is not a valid timestamp');
  return ms;
}
function list(value, name) {
  if (!Array.isArray(value)) throw new TypeError(name + ' must be an array');
  return value;
}
function own(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function uniqueStrings(values, name) {
  list(values, name);
  const seen = new Set();
  values.forEach((v, index) => {
    text(v, name + '[' + index + ']');
    if (seen.has(v)) throw new TypeError(name + ' has duplicate id ' + v);
    seen.add(v);
  });
  return seen;
}
function loadCli(argv) {
  let input;
  let json = false;
  let strict = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') {
      if (input || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new TypeError('one --input <path> is required');
      input = argv[++i];
    } else if (argv[i] === '--json') {
      json = true;
    } else if (argv[i] === '--strict') {
      strict = true;
    } else {
      throw new TypeError('unknown argument: ' + argv[i]);
    }
  }
  if (!input) throw new TypeError('--input <path> is required');
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  return { data: requireObject(data, 'input'), json, strict };
}
function runCli(evaluate) {
  try {
    const args = loadCli(process.argv.slice(2));
    const result = evaluate(args.data);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(result.tool + ': ' + result.status);
      console.log(result.summary);
      console.log(JSON.stringify(result.metrics || result.checks || {}, null, 2));
      if (result.warnings?.length) console.log('Warnings: ' + result.warnings.join(' | '));
    }
    if (args.strict && result.safe !== true) process.exitCode = 1;
  } catch (error) {
    // Do not include input record contents, secrets, names or SQL in errors.
    console.error('ghost-busters: invalid input: ' + error.message);
    process.exitCode = 2;
  }
}
module.exports = {
  object, requireObject, text, boolean, nonNegative, positiveInteger,
  timestamp, list, own, uniqueStrings, runCli
};
