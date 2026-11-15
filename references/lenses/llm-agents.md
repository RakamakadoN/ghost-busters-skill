# LLM agents — tool/state/observability lens

**Activate:** source shows tool-calling agent, retrieval/context assembly,
structured output validation or repeated model/tool interactions.

Investigate:
- Silent context truncation that removes required constraints, provenance or
  user instructions; confirm actual tokenizer/window behavior and relevant
  model version rather than guessing.
- Malformed JSON silently converted to `{}` or an empty task list; distinguish
  documented best-effort partial parse from falsely reported success.
- Unbounded or non-idempotent tool retries after unknown completion, including
  failed tool calls that are counted as successful.
- Multi-agent task deduplication, parallel workers and repeated side effects
  under at-least-once delivery.
- Budget exhaustion or tool timeout yielding a clean report instead of
  `PARTIAL/UNKNOWN`, plus missing independent evidence or stale retrieval.

**Negative controls:** a deliberate JSON default for optional metadata,
bounded retries with idempotency keys, explicit context clipping with an
observable omitted-section count.

**Reproducer:** fixed synthetic transcript and mocked *non-mutating* tool
responses; log tool-call identity, attempts, token budget and final status.
A mocked tool run is not proof of production accuracy or model reliability.
