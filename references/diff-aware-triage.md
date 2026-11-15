# Diff-aware TRIAGE — changed paths are leads, not coverage

For a symptom associated with recent code changes, use the trusted bundled
read-only CLI to obtain a bounded changed-file inventory. It does **not**
replace HUNT or general-purpose code review and **does not** analyze caller
or contract edges automatically.

Usage (local authorized Git repository):

~~~sh
node references/diff-triage.cjs --repo /path/to/project --base main --json
~~~

The tool computes a merge-base diff (`main...HEAD`), checks the working tree
for uncommitted changes and returns renamed, added, modified and deleted
paths plus an `UNTRACED` dependency boundary. Changed files are prioritized
for human follow-up, never treated as a complete causal impact graph.

For each changed function, inspect its callers, service boundaries, schema,
RLS policies, generated types, queues and error/negative paths. If a caller or
service cannot be resolved, record `UNKNOWN_EDGE` and escalate to a wider
scope. If the change touches migrations, auth, transaction guarantees, shared
DTOs or public APIs, prefer full scoped HUNT/RAID even when diff is tiny.

**META-GHOST:** an empty diff does not establish a healthy project; the
source may be outside scope or the branch may be unchanged while production
drifted. Unknown ref, incomplete diff or dirty tree is reported explicitly.
A checked diff only authenticates the committed file names/paths at those
revisions, not the deployed artifact.
