# Cross-Layer Contract Matrix: database → API → client

Trace the **same request, role, tenant, date range and deployed revision**.
Do not conflate empty allowed data with refused or failed data.

| Layer | Read from supplied code | Possible ghost | Counterexample / required evidence |
| --- | --- | --- | --- |
| Database & migration | nullability, defaults, unique constraints, RLS, grants, view security mode | valid query silently omits authorized rows, nullable change breaks reader | inspect policies for actual JWT claims and role; empty result can be correct |
| Query / service | filtering, pagination, ordering, transaction boundary and affected-row counts | partial or truncated result labelled complete | exact query shape, count/range, deterministic order with tie-breaker |
| API / serializer | route, response_model, status code, error envelopes and Pydantic defaults | error or missing field becomes HTTP 200 with empty/success object | documented response contract; deliberate 202/204 or optional field may be valid |
| Client transport | fetch/axios error branch, res.ok, JSON parser and typed decoding | network/authorization failure turned into [] | inspect actual error handling and caller expectations |
| UI / state | fallback values, loading/empty/error branch, stale cache or optimistic update | success toast despite durable state unchanged | evidence for real user role, query cache and eventual consistency |

For each edge identify its caller file:line and callee file:line if both were
actually provided. Missing source means UNKNOWN_EDGE. A source-only
cross-file trace never proves production data loss. If the observation was
performed under a DB owner account, it does not prove what RLS does for a
normal logged-in user.

Required report: data invariant; endpoint, response field and status; client
consumer; transition where an error/absent field changes meaning; trigger;
expected vs code-derived; missing independent observation; falsifier.
