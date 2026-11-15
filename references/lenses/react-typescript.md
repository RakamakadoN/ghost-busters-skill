# React / TypeScript — asynchronous UI integrity lens

**Activate:** React hooks/state plus TypeScript or a browser HTTP client in
the supplied source. Inspect mounted route, active build and data flow.

Investigate:
- `useEffect`/`useCallback` dependencies and stale closures: a snapshot
  may be valid for an event handler; verify the documented lifecycle.
- Racing requests from fast tab/filter changes. Cancellation via
  `AbortController` is one option, but a generation token or ignore-on-cleanup
  can correctly prevent stale commits too.
- An optimistic UI that confirms completion without rollback/compensation or
  an explicit queued/pending state after rejected mutation.
- Transport `res.ok`, HTTP/JSON parse failure, optional DTO fields and
  catch-to-empty-array defaults. Distinguish empty-success from unknown.
- `undefined`, `NaN`, stale cache and lossy string/number conversions
  reaching financial or count displays.

**Negative controls:** intentionally stale-but-cached data with a visible
timestamp; ignored obsolete response; correct rollback after a rejected
optimistic update.

**Reproducer:** isolated component test with controlled response ordering and
a rejected network mutation; assert rendered state and the authoritative
server-side record separately.
