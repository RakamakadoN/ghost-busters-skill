# Finance invariants — optional Ghost Busters v1.4 playbook

**This is a configuration template, not an executable database migration or accounting rulebook.** The system owner must map the authoritative ledgers, cutoff dates, legal entities, statuses and currency policy before any assertion is treated as evidence.

## Invariants to configure

| Invariant | Symptom it detects | False-positive controls |
| --- | --- | --- |
| Unknown cost must not equal zero | Profit overstatement when SKU mapping or accepted lots are missing | A legitimate zero-cost promotional transaction must be explicitly classified; preserve `NULL` for unknown |
| Allocation conservation | Amount paid is not equal to applied/available balance | Refunds, credit notes, currencies, open periods and asynchronous payment settlement |
| Document deletion propagation | Source tombstone leaves financial allocations or cash marts active | Reversal accounting and soft-delete semantics, reconciliation window |
| Shipment inventory conservation | Double outflow or outflow against a depleted/incorrect lot | Returns, transfers, negative-stock policy, unit conversion |
| Consistent receivables predicate | Two screens disagree on what is collectible | Current invoice and cancellation states, customer scope and RLS |
| Financial window alignment | Reports shift first-/last-day transactions | Explicit time zone, source datetime format, local cutoff and daylight saving |
| Unknown financial estimate | UI displays a precise number despite missing authoritative inputs | Mark estimates distinctly from recognized/posted facts |

## Guardrails

1. **Never silently replace missing with 0.** Use an explicit state `UNKNOWN` / `UNAVAILABLE`, retain the original reason, and surface incomplete coverage.
2. Do not write accounting journal lines, stock moves, invoice status, or partner system records from a diagnostic probe. Read-only sampling and local fixtures first.
3. Do not infer a general tax percentage or VAT basis from a single case. Legal/tax treatment varies by country, entity and accounting method; request governing rules from the responsible accountant.
4. Preserve separate `expected`, `observed`, `variance`, `as_of`, `scope`, `role`, `currency`, `source` and `confidence` fields.
5. Never aggregate across currencies/entities without an approved conversion and consolidation rule.
6. If a proposed change expands a list of payable/collectible items or a bulk action, run the [Impact gate](./v1.4-guards.md) first.
7. If a financial correction needs a migration, retain the gate requiring explicit owner approval; `Release` must remain `BLOCKED` until authorized and applied.

## Example invariant (pseudocode, not an executable production query)

```text
for each accounting period and legal entity:
    if unmapped_goods_kg > 0 or unpriced_goods_kg > 0:
        cost_of_goods_state = UNKNOWN
        do not show fully computed gross_margin
    else:
        assert abs(source_cost - ledger_cost) <= documented_tolerance
```

This rule reflects the class-13 failure mode (lying defaults), **not** an automatically validated claim about an installation. Test it on representative fixtures and independent source evidence before adding it to a project.
