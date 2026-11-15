# FastAPI / Pydantic — contract and lifecycle lens

**Activate:** source imports FastAPI or Pydantic and shows a route or response
model. Record major versions and exact route:line before applying patterns.

Investigate:
- A handler's `response_model` and optional/null fields: compare *actual
  schema contract* with `exclude_unset`, `exclude_none`, aliases, filtered
  fields and client expectations. Missing optional fields may be intentional.
- Exception handlers returning `200 OK`/`[]` when the documented contract
  requires an error/unknown state; distinguish deliberate `202 Accepted`.
- An `async def` route making blocking I/O calls without appropriate
  threadpool or async client; synchronous dependencies may be scheduled in
  worker threads, so inspect the real call context.
- `BackgroundTasks` for critical durable effects after a response. A worker
  restart can lose in-process work, but a properly persisted task/outbox may
  make the effect reliable. Do not call every background job a defect.
- Request-scoped mutable objects and shared state; do not blanket-claim that
  Pydantic field defaults or `Depends` are shared-mutability bugs.

**Negative controls:** correct intentionally nullable DTO; persistent queued
job with explicit accepted semantics; a synchronous endpoint appropriately
offloaded from the event loop.

**Reproducer:** isolated ASGI test with matching response schema; inject
timeout, cancellation or restart in a disposable environment. Without real
execution use `NOT_RUN`.
