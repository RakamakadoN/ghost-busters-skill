# Ghost Busters

**A debugging skill for hunting bugs that never crash.** — **v1.5.0**

Originally developed for Claude Code, Ghost Busters provides a reusable investigation
protocol, standalone Node.js scanners, offline evidence gates, and a read-only monitoring runner. The protocol can also guide OpenAI Codex
sessions when its instructions and project-specific context are supplied; a native
Codex integration has not yet been verified.

A ghost is a bug that does not fail. It shows 0 instead of an error, "success"
instead of 0 rows, green CI instead of a broken screen, silence instead of an
alarm. Stack traces do not find ghosts. Instruments do.

This skill is a hunting protocol distilled from roughly sixty production
incidents in a CRM/ERP (React + TypeScript + Supabase/PostgreSQL + an external
accounting system) over three months of pair-debugging between a solo
developer and Claude. Every class in the catalogue was caught at least twice.

## What's inside

```
ghost-busters/
├── SKILL.md                     the protocol: 8 phases + raid, report format, excuses table
├── references/
│   ├── ghost-classes.md         13 classes of silent bugs, probes, traps, real precedents
│   ├── probes.sql               read-only production probes (Postgres / Supabase / pg_cron)
│   ├── hunt-report.md           report template + a worked example
│   ├── scan-unbounded-reads.cjs AST scan: supabase-js reads without paging (class 3 signature)
│   ├── scan-select-columns.cjs  AST scan: selected/filtered columns vs generated types (class 5)
│   ├── ghost-guard.cjs         offline CLI: pulse / impact / release / environment
│   ├── ghost-hunter.cjs        v1.5 stateful read-only runner
│   ├── autonomous-hunter.md    private deployment guide
│   ├── v1.4-guards.md          input formats, statuses, safety rules, reproduction
│   ├── evidence-ledger.md      incident evidence tiers and benchmark protocol
│   ├── finance-invariants.md   opt-in finance invariants (templates only)
│   └── lib/                   AST chain walker + pure guardrail evaluators
├── examples/                    synthetic examples and private scheduler template
├── tests/                       scanner + evidence-gate regressions, hunt scenarios
├── CUSTOMIZE.md                 the six things that are yours to fill in
└── LICENSE                      MIT
```

## What's new in v1.4.0

The original eight-phase investigation process and 13 ghost classes remain intact.
Four **offline evidence gates** make important conclusions inspectable and repeatable:

| Gate | Question | Output |
| --- | --- | --- |
| **Ghost Pulse** | The scheduler is green — but is the source fresh, the data moving, and independent business activity present? | Suspected silent failure vs insufficient evidence or observed progress |
| **Ghost Impact** | Will removing a cap/filter make unsafe hidden rows eligible for bulk actions? | `BLOCKED`, `REVIEW_REQUIRED`, `CLEAR` |
| **Ghost Release** | Is the fix really merged, deployed and observed working for users? | From `FIX_PREPARED` through `VERIFIED_IN_PRODUCTION` |
| **Ghost Environment** | Are we measuring the project ref actually used by the deployed application? | Identity matched, mismatch or insufficient evidence |

```bash
node references/ghost-guard.cjs pulse --input examples/pulse-suspected.json --json
node references/ghost-guard.cjs impact --input examples/impact-blocked.json --json
node references/ghost-guard.cjs release --input examples/release-unverified.json --json
node references/ghost-guard.cjs environment --input examples/environment-mismatch.json --json
npm test
```

**No production credentials are required.** The tool reads sanitized aggregate JSON summaries and has **no network calls or write actions**. It does not actively monitor a system: users or agents supply timestamped evidence. Positive gate results are not authorization to alter production.

[Read the complete v1.4 guide](references/v1.4-guards.md) ·
[Evidence ledger & independent evaluation](references/evidence-ledger.md) ·
[Finance consistency playbook](references/finance-invariants.md)

## The protocol in one screen

```
0 CALL        symptom with a number, a screen, a period · which source answers this type of question
1 ARCHIVE     engineering memory before the first hypothesis · rejected hypotheses first
2 INSTRUMENTS production read-only probes by class · "no access" = diagnosis is a hypothesis
3 TRAIL       the single proven path from screen to writer to schedule · "why doesn't it know?"
4 TRAP        a test that fails now and describes the class, not the instance
5 EXORCISM    what else hangs on this code · rollout order · guarantee lives in the DB
6 WATCHDOG    how long it lived, which signal should have fired, can it physically fire
7 RECORD      ticket → project state → memory, rejected hypotheses included
RAID          after one catch, sweep for siblings of the same class with parallel agents
```

## The thirteen ghosts

| # | Class | Looks like |
|---|---|---|
| 1 | Muted watchdog | pipeline dead for days, dashboard green |
| 2 | Silent refusal | "done" with 0 rows changed; "0 debts" on a failed load |
| 3 | Row-cap truncation | totals short by exactly a tail |
| 4 | Home-made predicate | a new screen counts differently from the rest |
| 5 | Code ≠ production | fix in the repo, symptom in production |
| 6 | Identity by position | another client's order got your amount |
| 7 | Check-then-act race | allocations exceed the invoice |
| 8 | Crossed axes | business A's manager sees business B |
| 9 | Green tests, dead screen | CI green, user sees black on black |
| 10 | Swallowed error | import "succeeded" with lost rows |
| 11 | Open door | the anonymous role can call that RPC |
| 12 | Drowned signal | the alert fired, into 2 446 other alerts |
| 13 | Lying default | no error anywhere, a `?? 0` replaced the truth |

## Install

### Claude Code

Copy the folder into your project's skills directory:

```bash
git clone https://github.com/RakamakadoN/ghost-busters-skill .claude/skills/ghost-busters
```

Then fill in `CUSTOMIZE.md` (canonical sources, home predicates, rollout pipeline, pipelines
and their watchdogs, axes and windows, memory tools). Without it the skill
still works; with it the hunt stops asking.

Invoke with `/ghost-busters <symptom>` or `/ghost-busters raid <area>`. Claude
Code also picks it up automatically from the `description` when a symptom
matches.

### OpenAI Codex (manual use)

Use `SKILL.md` as the investigation instructions and adapt `CUSTOMIZE.md` to
your project. Provide both as context to a Codex session, along with the
symptom you want investigated. The Node.js scanners can be run separately
using the commands below. This is a manual workflow, not a claim of native
Codex skill discovery or validated integration.

## Does it work? What is evidence and what is not

Four different kinds of claim live here. They are not equally strong.

**1. The author's experience (not independently verifiable).** The skill was
distilled from roughly sixty incidents in one production CRM/ERP, and the
catalogue's precedents are those incidents, anonymised. Its first live raid
(class 3) scanned 916 query chains and found 4 screens truncating in
production, 4 more near the threshold; 3 fixes were merged across the following days with
RED→GREEN paging tests, and one fix was held because un-truncating the
screen would have fed 402 false payment demands into a bulk send — that is
where the "what the fix will open" rule comes from. Version 1.2 came from 22
tickets filed by scheduled hunters over the next three days. None of these
logs are published here; the numbers are the author's account, and the
count of tickets says nothing about their quality.

**2. One published, checkable example.** `references/hunt-report.md` holds
the same scenario — *"the debt tile shows 9.4M, accounting says half have
paid, meeting in 30 minutes"* — run once with the skill and once without,
read-only, same tool budget, with both transcripts summarised:

| | without | with |
|---|---|---|
| engineering memory | skipped ("needed to understand the code fast") | 4 queries; found the precedent |
| diagnosis | from code only; fix proposed before any observation | "pipeline stalled", labelled *hypothesis* pending probes |
| fix | rewrite the task function, pause its cron | no change until confirmed; listed everything else on the same table |
| watchdog | not raised | freshness watchdog proposed |

It is a single pair of runs on one scenario: a worked example of what the
protocol changes, not a measurement of how often.

**3. Reproducible tests (run them).** The two scanners and the v1.4 evidence gates have regression tests on small local fixtures, no database needed:

```bash
npm install
npm test
```

The v1.4 guard tests also check business-hour windows, independent liveness signals, blocking unsafe bulk actions, preserving deployment prerequisites, and rejecting wrong database identities. All test inputs are synthetic; they do not measure production precision or recall.

The original scanner tests pin the classification of plain, whitespace-broken, variable-built,
conditional and rebound chains, scope separation including nested shadowing
and closures over an outer variable, non-table `.from()` calls, select-list
parsing (casts, aliases, JSON paths, embeds, unsupported items), missing
columns and objects, the column scanner's refusal to attribute methods after
a rebinding, and exit-code consistency between text and JSON modes. `tests/scenarios.md` adds a small set of hunt scenarios with
pass criteria for anyone who wants to evaluate the protocol itself.

**4. Limits of the evidence.** There is no benchmark of the protocol across
many agents or incidents, no measurement of false-positive and false-negative
rates for the hunt, and the scanners are static: they find suspicious call
sites and cannot prove a production bug exists or that none does. Treat the
catalogue as a checklist shaped by one system's history, and the scanners
as a way to find candidates for the probes.

## Two static scanners

```bash
node references/scan-unbounded-reads.cjs src                       # class 3: reads that can hit the row cap
node references/scan-select-columns.cjs src \
     --types src/types/database.types.ts --schema-for features/epm/=epm   # class 5: columns the schema lacks
```

(When installed as a skill, prefix the paths with `.claude/skills/ghost-busters/`.)

Both walk every supabase-js `.from(` chain with the TypeScript compiler API,
follow chains assembled through a variable by resolving later calls to that
variable's declaration through lexical scopes (a shadowing `const q` in an
inner block is another variable; a closure over the outer one still counts),
and print file:line findings grouped by table. A bound that exists on only
one control-flow path is reported as CONDITIONAL, a variable bound to two
different queries as UNKNOWN (the column scanner then checks only the
direct part of each chain), a literal `.range(0, 999)` as one page rather
than pagination. The second scanner needs the generated Supabase
types and prints how old they are. Their analysis limits are listed at the
top of `references/lib/chains.cjs`; a finding is a call site to check, not a
proven bug, and a clean scan is not proof of absence.

## Adapting

The protocol and classes are stack-agnostic. `probes.sql` is written for
PostgreSQL behind PostgREST/Supabase with pg_cron; see the stack notes in
`CUSTOMIZE.md` for other setups.

## Origin

Built by Diyaz with Claude Code while shipping a two-business CRM/ERP. The
Russian-language, project-specific version lives inside that project; this is
the portable one.

---

**Русская версия в двух словах.** Это протокол охоты за «призраками» —
багами, которые не падают, а показывают 0, «успех» или зелёный CI. Восемь фаз
плюс рейд, каталог тринадцати классов с реальными прецедентами, read-only
зонды прода и обязательный формат отчёта. Проверен парным прогоном агента
без скилла и со скиллом на реальном инциденте.
