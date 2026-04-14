from enum import Enum


class BorrowerState(Enum):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    NO_RESPONSE = "NO_RESPONSE"
    NEGOTIATING = "NEGOTIATING"
    PROMISED = "PROMISED"
    RESOLVED = "RESOLVED"
    ESCALATED = "ESCALATED"


class Intent(Enum):
    WILL_PAY = "WILL_PAY"
    CANT_PAY = "CANT_PAY"
    PARTIAL_PAY = "PARTIAL_PAY"
    ASKING_DETAILS = "ASKING_DETAILS"
    DISPUTE = "DISPUTE"
    PAID = "PAID"
    GHOSTING = "GHOSTING"
    UNKNOWN = "UNKNOWN"


TRANSITIONS: dict[tuple[BorrowerState, Intent], BorrowerState] = {
    # From NEW — any intent moves to CONTACTED
    (BorrowerState.NEW, Intent.WILL_PAY): BorrowerState.CONTACTED,
    (BorrowerState.NEW, Intent.CANT_PAY): BorrowerState.CONTACTED,
    (BorrowerState.NEW, Intent.PARTIAL_PAY): BorrowerState.CONTACTED,
    (BorrowerState.NEW, Intent.ASKING_DETAILS): BorrowerState.CONTACTED,
    (BorrowerState.NEW, Intent.DISPUTE): BorrowerState.CONTACTED,
    (BorrowerState.NEW, Intent.PAID): BorrowerState.CONTACTED,
    (BorrowerState.NEW, Intent.GHOSTING): BorrowerState.CONTACTED,
    (BorrowerState.NEW, Intent.UNKNOWN): BorrowerState.CONTACTED,
    # From CONTACTED
    (BorrowerState.CONTACTED, Intent.WILL_PAY): BorrowerState.PROMISED,
    (BorrowerState.CONTACTED, Intent.CANT_PAY): BorrowerState.NEGOTIATING,
    (BorrowerState.CONTACTED, Intent.GHOSTING): BorrowerState.NO_RESPONSE,
    (BorrowerState.CONTACTED, Intent.PAID): BorrowerState.RESOLVED,
    # From NO_RESPONSE
    (BorrowerState.NO_RESPONSE, Intent.GHOSTING): BorrowerState.ESCALATED,
    # From NEGOTIATING
    (BorrowerState.NEGOTIATING, Intent.WILL_PAY): BorrowerState.PROMISED,
    (BorrowerState.NEGOTIATING, Intent.PAID): BorrowerState.RESOLVED,
    # From PROMISED
    (BorrowerState.PROMISED, Intent.PAID): BorrowerState.RESOLVED,
    (BorrowerState.PROMISED, Intent.GHOSTING): BorrowerState.NO_RESPONSE,
    # From ESCALATED
    (BorrowerState.ESCALATED, Intent.PAID): BorrowerState.RESOLVED,
    (BorrowerState.ESCALATED, Intent.WILL_PAY): BorrowerState.PROMISED,
    (BorrowerState.ESCALATED, Intent.PARTIAL_PAY): BorrowerState.NEGOTIATING,
    (BorrowerState.ESCALATED, Intent.CANT_PAY): BorrowerState.NEGOTIATING,
}


def transition(current_state: BorrowerState, intent: Intent) -> BorrowerState:
    return TRANSITIONS.get((current_state, intent), current_state)


def get_next_action(state: BorrowerState) -> str:
    actions = {
        BorrowerState.NEW: "Send initial outreach message to the borrower.",
        BorrowerState.CONTACTED: "Wait for borrower response and classify their intent.",
        BorrowerState.NO_RESPONSE: "Follow up with a second message; escalate if still no reply.",
        BorrowerState.NEGOTIATING: "Work with borrower to agree on a payment plan or settlement.",
        BorrowerState.PROMISED: "Send a payment reminder and confirm the agreed-upon date.",
        BorrowerState.RESOLVED: "Mark account as resolved. No further action needed.",
        BorrowerState.ESCALATED: "Hand off to human agent or escalation team for further action.",
    }
    return actions[state]
