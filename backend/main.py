import os
from datetime import datetime

from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ai_service import detect_intent, generate_message, generate_risk_summary
from state_machine import BorrowerState, Intent, get_next_action, transition
from store import borrowers, messages

app = FastAPI(title="Resolve Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_borrower_or_404(borrower_id: str) -> dict:
    borrower = borrowers.get(borrower_id)
    if not borrower:
        raise HTTPException(status_code=404, detail="Borrower not found")
    return borrower


def send_whatsapp(to: str, body: str) -> None:
    """Send a WhatsApp message via Twilio, falling back to console if creds are missing."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")

    if account_sid and auth_token:
        from twilio.rest import Client as TwilioClient
        twilio = TwilioClient(account_sid, auth_token)
        try:
            twilio.messages.create(
                from_="whatsapp:+14155238886",
                to=to,
                body=body,
            )
        except Exception as e:
            print(f"[TWILIO ERROR] {e}")
            return
    else:
        print(f"[TWILIO NOT CONFIGURED] To: {to}\nMessage: {body}\n")


def log_message(borrower_id: str, role: str, content: str) -> None:
    messages.setdefault(borrower_id, []).append({
        "role": role,
        "content": content,
        "timestamp": datetime.utcnow().isoformat(),
    })


def run_reply_pipeline(borrower: dict, reply_text: str) -> dict:
    """Shared logic for simulate-reply and the WhatsApp webhook."""
    borrower_id = borrower["id"]
    previous_state = BorrowerState(borrower["state"])

    context = {
        "name": borrower["name"],
        "emi_amount": borrower["emi_amount"],
        "days_overdue": borrower["days_overdue"],
        "state": borrower["state"],
    }

    intent = detect_intent(reply_text, context)
    new_state = transition(previous_state, intent)

    log_message(borrower_id, "borrower", reply_text)

    # Track repeated refusals for auto-escalation
    if intent in (Intent.CANT_PAY, Intent.UNKNOWN):
        borrower["cant_pay_count"] = borrower.get("cant_pay_count", 0) + 1

    borrower["state"] = new_state.value

    # Auto-escalate: stalled in negotiation after 5+ attempts with repeated refusals
    if (
        borrower.get("attempt_count", 0) >= 5
        and new_state == BorrowerState.NEGOTIATING
        and borrower.get("cant_pay_count", 0) >= 2
    ):
        new_state = BorrowerState.ESCALATED
        borrower["state"] = new_state.value

    response_text = generate_message(
        borrower, new_state, intent,
        message_history=messages.get(borrower_id, []),
    )
    log_message(borrower_id, "agent", response_text)

    send_whatsapp(borrower["phone"], response_text)

    borrower["attempt_count"] = borrower.get("attempt_count", 0) + 1
    borrower["last_contacted_at"] = datetime.utcnow().isoformat()

    return {
        "detected_intent": intent.value,
        "previous_state": previous_state.value,
        "new_state": new_state.value,
        "response_sent": response_text,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"status": "Resolve API running"}


class AddBorrowerRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=1, max_length=20)
    emi_amount: float = Field(..., gt=0)
    loan_type: str = Field(..., min_length=1, max_length=50)
    days_overdue: int = Field(..., ge=0)


@app.post("/borrowers")
def add_borrower(body: AddBorrowerRequest):
    # Generate next ID
    existing_nums = []
    for bid in borrowers:
        try:
            existing_nums.append(int(bid[1:]))
        except ValueError:
            pass
    next_num = max(existing_nums, default=0) + 1
    borrower_id = f"B{next_num:03d}"

    borrower = {
        "id": borrower_id,
        "name": body.name,
        "phone": f"whatsapp:{body.phone}" if not body.phone.startswith("whatsapp:") else body.phone,
        "emi_amount": body.emi_amount,
        "loan_type": body.loan_type,
        "days_overdue": body.days_overdue,
        "state": BorrowerState.NEW.value,
        "attempt_count": 0,
        "last_contacted_at": None,
        "promise_date": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    borrowers[borrower_id] = borrower
    messages[borrower_id] = []

    state = BorrowerState(borrower["state"])
    return {
        **borrower,
        "next_action": get_next_action(state),
        "message_count": 0,
    }


@app.get("/borrowers")
def list_borrowers():
    result = []
    for b in borrowers.values():
        state = BorrowerState(b["state"])
        result.append({
            **b,
            "next_action": get_next_action(state),
            "message_count": len(messages.get(b["id"], [])),
        })
    return result


@app.get("/borrowers/{borrower_id}")
def get_borrower(borrower_id: str):
    borrower = get_borrower_or_404(borrower_id)
    state = BorrowerState(borrower["state"])
    raw_messages = messages.get(borrower_id, [])
    formatted_messages = [
        {
            "direction": "OUT" if m["role"] == "agent" else "IN",
            "content": m["content"],
            "timestamp": m["timestamp"],
        }
        for m in raw_messages
    ]
    return {
        **borrower,
        "next_action": get_next_action(state),
        "messages": formatted_messages,
    }


@app.get("/borrowers/{borrower_id}/summary")
def get_borrower_summary(borrower_id: str):
    borrower = get_borrower_or_404(borrower_id)
    history = messages.get(borrower_id, [])
    summary = generate_risk_summary(borrower, history)
    return summary


@app.get("/stats")
def get_stats():
    all_borrowers = list(borrowers.values())
    total = len(all_borrowers)
    overdue = sum(b["emi_amount"] for b in all_borrowers if b["days_overdue"] > 0)
    escalated = sum(1 for b in all_borrowers if b["state"] == BorrowerState.ESCALATED.value)
    resolved = sum(1 for b in all_borrowers if b["state"] == BorrowerState.RESOLVED.value)
    avg_days = (
        sum(b["days_overdue"] for b in all_borrowers) / total if total else 0
    )

    state_distribution: dict[str, int] = {}
    for b in all_borrowers:
        state_distribution[b["state"]] = state_distribution.get(b["state"], 0) + 1

    return {
        "total_borrowers": total,
        "total_overdue_amount": overdue,
        "escalated": escalated,
        "resolved_today": resolved,
        "state_distribution": state_distribution,
        "avg_days_overdue": round(avg_days, 1),
    }


@app.post("/borrowers/{borrower_id}/send")
def send_message(borrower_id: str):
    borrower = get_borrower_or_404(borrower_id)
    state = BorrowerState(borrower["state"])

    message_text = generate_message(
        borrower, state,
        message_history=messages.get(borrower_id, []),
    )
    send_whatsapp(borrower["phone"], message_text)
    log_message(borrower_id, "agent", message_text)

    borrower["attempt_count"] = borrower.get("attempt_count", 0) + 1
    borrower["last_contacted_at"] = datetime.utcnow().isoformat()

    if state == BorrowerState.NEW:
        borrower["state"] = BorrowerState.CONTACTED.value

    return {
        "message_sent": message_text,
        "new_state": borrower["state"],
    }


class SimulateReplyRequest(BaseModel):
    reply: str = Field(..., min_length=1, max_length=1000)


@app.post("/borrowers/{borrower_id}/simulate-reply")
def simulate_reply(borrower_id: str, body: SimulateReplyRequest):
    borrower = get_borrower_or_404(borrower_id)
    return run_reply_pipeline(borrower, body.reply)


@app.post("/borrowers/{borrower_id}/escalate")
def escalate_borrower(borrower_id: str):
    borrower = get_borrower_or_404(borrower_id)
    borrower["state"] = BorrowerState.ESCALATED.value
    log_message(borrower_id, "agent", "Case escalated to human agent")
    state = BorrowerState(borrower["state"])
    raw_messages = messages.get(borrower_id, [])
    formatted_messages = [
        {
            "direction": "OUT" if m["role"] == "agent" else "IN",
            "content": m["content"],
            "timestamp": m["timestamp"],
        }
        for m in raw_messages
    ]
    return {
        **borrower,
        "next_action": get_next_action(state),
        "messages": formatted_messages,
    }


@app.post("/webhook/whatsapp")
def whatsapp_webhook(From: str = Form(...), Body: str = Form(...)):
    # Find borrower by phone number
    borrower = next(
        (b for b in borrowers.values() if b["phone"] == From), None
    )
    if not borrower:
        return {"status": "unknown sender"}

    result = run_reply_pipeline(borrower, Body)
    return {"status": "ok", **result}
