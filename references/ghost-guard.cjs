#!/usr/bin/env node
'use strict';

/**
 * Offline evidence evaluator. JSON input must contain aggregate counts,
 * hashes and evidence statuses only. NEVER pass secrets, client records,
 * tokens, phone numbers or full payment/accounting exports.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  assessPulse, assessImpact, assessRelease, assessEnvironment
} = require('./lib/guardrails.cjs');
const {
  assessRuntimeIdentity, assessHumanAlert, assessRegressionEvidence
} = require('./lib/v1-6-gates.cjs');

const commands = {pulse: assessPulse, impact: assessImpact,
  release: assessRelease, environment: assessEnvironment,
  'runtime-identity': assessRuntimeIdentity, 'human-alert': assessHumanAlert,
  regression: assessRegressionEvidence};
function usage() {
  console.error('Usage: node references/ghost-guard.cjs <pulse|impact|release|environment|runtime-identity|human-alert|regression> --input <summary.json> [--json] [--strict]');
  console.error('Offline, read-only; no network calls or production writes.');
}
function main(argv) {
  const command = argv[0];
  if (!Object.hasOwn(commands, command)) {usage(); return 2;}
  const i=argv.indexOf('--input');
  if (i < 0 || !argv[i+1] || argv[i+1].startsWith('--')) {usage(); return 2;}
  if (argv.filter(x=>x==='--input').length!==1) {usage(); return 2;}
  const inputPath=path.resolve(argv[i+1]);
  let data;
  try {
    const stats = fs.statSync(inputPath);
    if (stats.size > 1024*1024) throw Error('Summary exceeds 1 MiB; do not supply raw data');
    data=JSON.parse(fs.readFileSync(inputPath,'utf8'));
    const result=commands[command](data);
    if (argv.includes('--json')) console.log(JSON.stringify(result,null,2));
    else {
      console.log('GHOST BUSTERS v1.6 — '+command.toUpperCase());
      console.log('STATUS: '+result.status);
      console.log('EVIDENCE: '+JSON.stringify(result.observed));
      if (result.blockers?.length) console.log('BLOCKERS: '+result.blockers.join('; '));
      if (result.unknowns?.length) console.log('UNKNOWN: '+result.unknowns.join('; '));
      if (result.limitations?.length) console.log('LIMITATIONS: '+result.limitations.join(' | '));
    }
    if (argv.includes('--strict') && (
      (command==='pulse' && result.status!=='PROGRESS_OBSERVED') ||
      (command==='impact' && !result.releaseAllowed) ||
      (command==='release' && !result.verified) ||
      (command==='environment' && !result.canClaimProduction) ||
      (command==='runtime-identity' && !result.corroborated) ||
      (command==='human-alert' && !result.humanConfirmed) ||
      (command==='regression' && !result.evidenceRecorded)
    )) return 1;
    return 0;
  } catch (err) {
    console.error('Ghost Busters input error: '+err.message);
    return 2;
  }
}
process.exitCode=main(process.argv.slice(2));
