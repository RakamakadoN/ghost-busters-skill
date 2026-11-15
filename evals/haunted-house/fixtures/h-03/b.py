# Synthetic Python payment/webhook example. NOT executed by the evaluator.
from typing import Protocol

class PaymentStore(Protocol):
    def append_once(self, event_id: str, amount: int) -> bool: ...

class Event:
    def __init__(self, event_id: str, amount: int):
        self.event_id = event_id
        self.amount = amount

def handle_event(store: PaymentStore, event: Event) -> str:
    # append_once has an explicit, independent database contract:
    # a durable unique event ID, atomic ledger insert and replay.
    # The fixture assumes that contract; production code must prove it.
    created = store.append_once(event.event_id, event.amount)
    return "created" if created else "already_processed"

# Negative control: two distinct event IDs must be processed twice.
# Merely naming a function append_once would NOT establish safety
# if its implementation failed to use a unique constraint.
# Verify the real durable boundary before making any claim.
