# UX for operational software: role → exception → action

Do not start with a decorative dashboard. Discover the user's top decisions, daily triggers and accountability.

## Five-layer screen design

1. **Domain**: what decision changes money, people, inventory, operations or service quality?
2. **Role**: manager, dispatcher, accountant, executive, operator. Each needs a different answer, not merely a different menu.
3. **Exceptions first**: overdue, stuck, inconsistent, missing, duplicated or stale must be visible before generic averages.
4. **Actionable pathway**: exception → affected entity → verified context → permitted action → confirmation → observed result.
5. **Evidence**: “last updated”, source-of-truth label, applied filter and permission-related missingness. Zero is not the same as not loaded.

## Wireframe checklist

- Name the primary user task and success metric for each screen.
- Loading, empty, partial, stale, forbidden and error have distinct states and messages.
- Show a small number of decisive KPIs with denominators; don't bury overdue actions in total counts.
- Provide keyboard and screen-reader semantics, responsive layout and usable touch targets.
- Make destructive actions confirm scope and affected count; undo/reversal when possible.
- Keep user context (filters, time range, tenant, workspace) visible and durable when appropriate.
- Ensure errors link to a recovery action or support evidence, not a generic silent toast.

## Component strategy

Reuse the project's existing design system. Create shared components after repeated practical needs, not on speculation. For hundreds of rows implement server paging or virtualization and verify aggregate/count semantics. Prefer CSS/WAAPI to high-frequency React state for animations.

## Acceptance test

Can the target role identify the most urgent exception and navigate to the correct record, without privileged data leakage, in a few clear interactions? Can they distinguish “0” from “no data” and “not authorized”?
