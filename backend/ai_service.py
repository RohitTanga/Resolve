import json
import os
from datetime import datetime

import anthropic
from dotenv import load_dotenv

from state_machine import BorrowerState, Intent

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def detect_intent(borrower_reply: str, borrower_context: dict) -> Intent:
    """Classify a borrower's reply into an Intent enum value."""
    system_prompt = (
        "You are an AI assistant that classifies borrower replies in a debt collection context.\n"
        "Classify the reply into exactly one of these intents:\n"
        "- WILL_PAY: Borrower commits to paying\n"
        "- CANT_PAY: Borrower says they cannot pay\n"
        "- PARTIAL_PAY: Borrower offers partial payment\n"
        "- ASKING_DETAILS: Borrower is asking for loan or payment details\n"
        "- DISPUTE: Borrower disputes the debt\n"
        "- PAID: Borrower claims they have already paid — use this for ANY past-tense payment statement "
        "such as 'I paid', 'I have paid', 'done payment', 'sent the money', 'payment done', "
        "'already transferred', 'check your account'; NEVER classify these as WILL_PAY\n"
        "- UNKNOWN: Intent is unclear\n\n"
        'Respond with ONLY valid JSON: {"intent": "INTENT_VALUE", "confidence": 0.9}'
    )

    user_message = (
        f"Borrower context:\n"
        f"Name: {borrower_context.get('name')}\n"
        f"EMI Amount: {borrower_context.get('emi_amount')}\n"
        f"Days Overdue: {borrower_context.get('days_overdue')}\n"
        f"Current State: {borrower_context.get('state')}\n\n"
        f'Borrower\'s reply: "{borrower_reply}"\n\n'
        "Classify the intent."
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    text = next(b.text for b in response.content if b.type == "text")
    print(f"[detect_intent] raw response: {text!r}")
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(text)
        intent_str = data.get("intent", "UNKNOWN")
        return Intent[intent_str]
    except (json.JSONDecodeError, KeyError) as e:
        print(f"[detect_intent] parse error ({e}), defaulting to UNKNOWN")
        return Intent.UNKNOWN


def _greeting_instruction(borrower_name: str, message_history: list) -> tuple[str, str]:
    """
    Returns (greeting_rule, length_rule) based on time since the last message.
    Also returns a human-readable time label used in the prompt.
    """
    if not message_history:
        return (
            f"This is your very first message to {borrower_name}. "
            "Introduce yourself warmly and briefly as Priya from Resolve.",
            "2-3 sentences.",
        )

    last_ts = message_history[-1].get("timestamp", "")
    try:
        last_dt = datetime.fromisoformat(last_ts)
        hours_ago = (datetime.utcnow() - last_dt).total_seconds() / 3600
    except (ValueError, TypeError):
        hours_ago = 0.0

    if hours_ago < 2:
        return (
            "Last message was less than 2 hours ago — you are mid-conversation. "
            "NO greeting at all. Jump straight into what you need to say, "
            "exactly as you would in an active WhatsApp thread.",
            "1-2 sentences.",
        )
    elif hours_ago < 24:
        return (
            f"Last message was {hours_ago:.0f} hours ago — use a light, casual greeting only, "
            f"like 'Hey {borrower_name},' or just their name. "
            "NEVER re-introduce yourself as Priya from Resolve.",
            "1-2 sentences.",
        )
    else:
        days_ago = hours_ago / 24
        return (
            f"Last message was {days_ago:.0f} day(s) ago — open with a warm, human check-in, "
            f"like 'Hi {borrower_name}, hope you're doing okay' or similar. "
            "NEVER re-introduce yourself as Priya from Resolve.",
            "2-3 sentences.",
        )


def generate_message(
    borrower: dict, state: BorrowerState, intent: Intent | None = None,
    message_history: list | None = None,
) -> str:
    """Generate a warm WhatsApp message for the borrower as Priya from Resolve."""
    if message_history is None:
        message_history = []

    borrower_name = borrower.get("name", "there")
    greeting_rule, length_rule = _greeting_instruction(borrower_name, message_history)

    last_5 = message_history[-5:]
    if last_5:
        history_lines = []
        for msg in last_5:
            speaker = "Priya" if msg.get("role") == "agent" else borrower_name
            history_lines.append(f"{speaker}: {msg.get('content', '')}")
        history_block = "Previous conversation:\n" + "\n".join(history_lines)
    else:
        history_block = ""

    system_prompt = (
        "You are Priya, a compassionate credit wellness assistant at Resolve.\n"
        "Your role is to help borrowers navigate their loan repayment journey with empathy.\n"
        "Guidelines:\n"
        "- Always be warm, respectful, and non-threatening\n"
        "- Always offer a clear path forward\n"
        "- Never use aggressive or intimidating language\n"
        "- Be professional and culturally sensitive\n"
        "- Vary your sentence structure — don't start every message the same way\n"
        "- Sound like a real empathetic person texting, not a customer service bot\n"
        f"- Greeting rule: {greeting_rule}\n"
        f"- Length: {length_rule}"
    )

    intent_context = (
        f"\nBorrower's most recent intent: {intent.value}" if intent else ""
    )
    history_section = f"\n\n{history_block}" if history_block else ""

    user_message = (
        f"Borrower details:\n"
        f"Name: {borrower_name}\n"
        f"EMI Amount: ₹{borrower.get('emi_amount')}\n"
        f"Days Overdue: {borrower.get('days_overdue')}\n"
        f"Loan Type: {borrower.get('loan_type', 'personal loan')}\n"
        f"Current State: {state.value}"
        f"{intent_context}"
        f"{history_section}\n\n"
        "Write the next WhatsApp message as Priya."
    )

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=512,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    return next(b.text for b in response.content if b.type == "text")


def generate_risk_summary(borrower: dict, message_history: list) -> dict:
    """Analyze the last 10 messages and return a structured risk assessment."""
    last_10 = message_history[-10:]
    history_text = "\n".join(
        f"[{msg.get('role', 'unknown')}]: {msg.get('content', '')}"
        for msg in last_10
    )

    system_prompt = (
        "You are a credit risk analyst. Analyze borrower interactions and return a structured assessment.\n"
        "Respond with ONLY valid JSON matching this schema exactly:\n"
        "{\n"
        '  "payment_intent_score": <integer 1-10>,\n'
        '  "emotional_state": "<string>",\n'
        '  "recommended_action": "<string>",\n'
        '  "risk_level": "<low|medium|high>",\n'
        '  "key_insight": "<string>"\n'
        "}"
    )

    user_message = (
        f"Analyze this borrower and their recent conversation:\n\n"
        f"Borrower Details:\n"
        f"Name: {borrower.get('name')}\n"
        f"EMI Amount: ₹{borrower.get('emi_amount')}\n"
        f"Days Overdue: {borrower.get('days_overdue')}\n"
        f"Loan Type: {borrower.get('loan_type', 'personal loan')}\n"
        f"Current State: {borrower.get('state')}\n\n"
        f"Recent Message History (last 10 messages):\n"
        f"{history_text}\n\n"
        "Provide a risk assessment in the specified JSON format."
    )

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    text = next(b.text for b in response.content if b.type == "text")
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"[generate_risk_summary] parse error ({e}), returning default")
        return {"risk_level": "medium", "payment_intent_score": 5}
