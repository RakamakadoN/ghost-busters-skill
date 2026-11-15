# Synthetic Python payment/webhook example. NOT executed by the evaluator.
from typing import Protocol

class PaymentStore(Protocol):
    def has_event(self, event_id: str) -> bool: ...
    def append_ledger(self, event_id: str, amount: int) -> None: ...

class Event:
    def __init__(self, event_id: str, amount: int):
        self.event_id = event_id
        self.amount = amount

def handle_event(store: PaymentStore, event: Event) -> str:
    if not store.has_event(event.event_id):
        # Two concurrent handlers can both observe "absent".
        # This is not the authoritative commit boundary.
        store.append_ledger(event.event_id, event.amount)
    return "accepted"

# Business contract: one durable credit for one provider event ID.
# Trigger concept: same event delivered twice concurrently.
# A real database may contain hidden unique constraints or locks.
# No actual provider request, ledger write or transaction was run.
