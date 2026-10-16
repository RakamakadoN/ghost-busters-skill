# Ghost Busters

**A Claude Code skill for hunting bugs that never crash.**

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
│   ├── ghost-classes.md         12 classes of silent bugs, probes, traps, real precedents
│   ├── probes.sql               read-only production probes (Postgres / Supabase / pg_cron)
│   └── hunt-report.md           report template + a worked example
├── CUSTOMIZE.md                 the five things that are yours to fill in
└── LICENSE                      MIT
```

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

## The twelve ghosts

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

## Install

Copy the folder into your project's skills directory:

```bash
git clone https://github.com/<you>/ghost-busters-skill .claude/skills/ghost-busters
```

Then fill in `CUSTOMIZE.md` (canonical sources, home predicates, pipelines
and their watchdogs, axes and windows, memory tools). Without it the skill
still works; with it the hunt stops asking.

Invoke with `/ghost-busters <symptom>` or `/ghost-busters raid <area>`. Claude
Code also picks it up automatically from the `description` when a symptom
matches.

## Does it work?

The skill was built test-first. The same scenario — *"the debt tile shows
9.4M, accounting says half have paid, meeting in 30 minutes"* — was given to
an agent with and without the skill, read-only, same tool budget.

| | without | with |
|---|---|---|
| engineering memory | skipped ("needed to understand the code fast") | 4 queries; found the precedent |
| diagnosis | from code only; fix proposed before any observation | "pipeline stalled", labelled *hypothesis* pending probes |
| fix | rewrite the task function, pause its cron | no change until confirmed; listed everything else on the same table |
| watchdog | not raised | freshness watchdog proposed |

The full example is in `references/hunt-report.md`.

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
плюс рейд, каталог двенадцати классов с реальными прецедентами, read-only
зонды прода и обязательный формат отчёта. Проверен парным прогоном агента
без скилла и со скиллом на реальном инциденте.
