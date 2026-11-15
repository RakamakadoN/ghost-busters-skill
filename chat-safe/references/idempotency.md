# Idempotency / retry / TOCTOU review

Investigate only operations whose contract requires at-most-once,
exactly-once *effect*, or safe repeat semantics. Missing an
idempotency_key is a **lead**, not an automatic vulnerability: a unique
business key, transaction, or naturally idempotent operation may suffice.

| Scenario | Candidate mechanism | Contract / falsifier |
| --- | --- | --- |
| Duplicate payment webhook | delivery retried, side effect applied twice | payment/provider event identifier deduplicated at durable boundary |
| Double-click order submit | SELECT then INSERT races | database uniqueness or locking may already serialize |
| Retry after timeout | original commit succeeds, caller retries | persistent idempotency key and replayed committed result |
| Queue redelivery | at-least-once worker redoes debit/status transition | atomic guarded update, outbox or durable processed marker |
| Concurrent inventory hold | check stock then decrement in separate transactions | atomic predicate update / appropriate isolation & verified constraints |
| Late failed retry | earlier response settled but asynchronous retry still mutates | inspect lifecycle and documented retry contract |

Always inspect transaction boundaries, indexes, scope of idempotency key,
isolation level, failover behavior, result reuse and allowed expiry.
Compare 1 call, 2 identical sequential calls, 2 concurrent calls and
timeout-with-retry, using a reviewed oracle in a disposable environment.
Only the operator may authorize actual execution of mutation tests;
Chat-Safe itself never runs them.

**Do not infer a real race from an unexecuted schedule.** A pair of
transactions can be synchronized internally, including through unique
constraints invisible in the service function. Record those unknowns.
