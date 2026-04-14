from datetime import datetime, timedelta

from state_machine import BorrowerState

borrowers: dict[str, dict] = {}
messages: dict[str, list] = {}


def seed_data():
    global borrowers, messages

    now = datetime.utcnow()

    borrowers = {
        "B001": {
            "id": "B001",
            "name": "Ravi Kumar",
            "phone": "whatsapp:+919876543210",
            "emi_amount": 4500,
            "loan_type": "personal loan",
            "days_overdue": 3,
            "state": BorrowerState.NEW.value,
            "attempt_count": 0,
            "last_contacted_at": None,
            "promise_date": None,
            "created_at": (now - timedelta(days=90)).isoformat(),
        },
        "B002": {
            "id": "B002",
            "name": "Priya Sharma",
            "phone": "whatsapp:+919845123456",
            "emi_amount": 8200,
            "loan_type": "home loan",
            "days_overdue": 12,
            "state": BorrowerState.CONTACTED.value,
            "attempt_count": 2,
            "last_contacted_at": (now - timedelta(days=2)).isoformat(),
            "promise_date": None,
            "created_at": (now - timedelta(days=180)).isoformat(),
        },
        "B003": {
            "id": "B003",
            "name": "Arjun Mehta",
            "phone": "whatsapp:+917700112233",
            "emi_amount": 3200,
            "loan_type": "two-wheeler loan",
            "days_overdue": 28,
            "state": BorrowerState.NEGOTIATING.value,
            "attempt_count": 5,
            "last_contacted_at": (now - timedelta(days=1)).isoformat(),
            "promise_date": None,
            "created_at": (now - timedelta(days=60)).isoformat(),
        },
        "B004": {
            "id": "B004",
            "name": "Sunita Devi",
            "phone": "whatsapp:+918888901234",
            "emi_amount": 6750,
            "loan_type": "gold loan",
            "days_overdue": 7,
            "state": BorrowerState.PROMISED.value,
            "attempt_count": 3,
            "last_contacted_at": (now - timedelta(hours=18)).isoformat(),
            "promise_date": (now + timedelta(days=2)).date().isoformat(),
            "created_at": (now - timedelta(days=120)).isoformat(),
        },
        "B005": {
            "id": "B005",
            "name": "Mohammed Irfan",
            "phone": "whatsapp:+919123456780",
            "emi_amount": 11500,
            "loan_type": "business loan",
            "days_overdue": 45,
            "state": BorrowerState.ESCALATED.value,
            "attempt_count": 9,
            "last_contacted_at": (now - timedelta(days=5)).isoformat(),
            "promise_date": None,
            "created_at": (now - timedelta(days=200)).isoformat(),
        },
        "B006": {
            "id": "B006",
            "name": "Kavitha Nair",
            "phone": "whatsapp:+919567890123",
            "emi_amount": 5100,
            "loan_type": "education loan",
            "days_overdue": 0,
            "state": BorrowerState.RESOLVED.value,
            "attempt_count": 4,
            "last_contacted_at": (now - timedelta(days=3)).isoformat(),
            "promise_date": None,
            "created_at": (now - timedelta(days=150)).isoformat(),
        },
        "B007": {
            "id": "B007",
            "name": "Deepak Joshi",
            "phone": "whatsapp:+917654321098",
            "emi_amount": 2800,
            "loan_type": "consumer durable loan",
            "days_overdue": 19,
            "state": BorrowerState.NO_RESPONSE.value,
            "attempt_count": 6,
            "last_contacted_at": (now - timedelta(days=7)).isoformat(),
            "promise_date": None,
            "created_at": (now - timedelta(days=75)).isoformat(),
        },
    }

    def ts(delta: timedelta) -> str:
        return (now - delta).isoformat()

    messages = {
        "B001": [],
        # Priya Sharma — contacted, no clear commitment yet
        "B002": [
            {
                "role": "agent",
                "content": (
                    "Hi Priya! This is Priya from Resolve. I noticed your home loan EMI of "
                    "₹8,200 is 12 days overdue. I understand life gets busy — would you like to "
                    "arrange the payment today or discuss a convenient date?"
                ),
                "timestamp": ts(timedelta(days=2, hours=3)),
            },
            {
                "role": "borrower",
                "content": "Hi, yes I know. I've been travelling for work. Can I pay by end of this week?",
                "timestamp": ts(timedelta(days=2, hours=2)),
            },
            {
                "role": "agent",
                "content": (
                    "Of course, Priya! That works perfectly — I'll note Friday as your payment date. "
                    "You can pay via the Resolve app or NEFT to our account. "
                    "I'll send you a reminder on Thursday. 😊"
                ),
                "timestamp": ts(timedelta(days=2, hours=1, minutes=55)),
            },
        ],
        # Arjun Mehta — negotiating partial payment
        "B003": [
            {
                "role": "agent",
                "content": (
                    "Hello Arjun, this is Priya from Resolve. Your two-wheeler loan EMI of ₹3,200 "
                    "has been overdue for 28 days. I'd love to help find a solution that works for you — "
                    "could we talk about what's making it difficult right now?"
                ),
                "timestamp": ts(timedelta(days=3)),
            },
            {
                "role": "borrower",
                "content": "I lost my job last month. I can only pay 1500 right now. The rest I need more time.",
                "timestamp": ts(timedelta(days=2, hours=22)),
            },
            {
                "role": "agent",
                "content": (
                    "I'm sorry to hear that, Arjun — losing a job is incredibly stressful. "
                    "A partial payment of ₹1,500 is a great start and shows good faith. "
                    "Let me check with our team about a short restructuring plan for the remaining amount — "
                    "we want to support you through this."
                ),
                "timestamp": ts(timedelta(days=2, hours=21, minutes=50)),
            },
        ],
        # Sunita Devi — promised to pay in 2 days
        "B004": [
            {
                "role": "agent",
                "content": (
                    "Namaste Sunita ji! I'm Priya from Resolve. Your gold loan EMI of ₹6,750 "
                    "is due. Is everything okay? I'm here to help if you need any assistance."
                ),
                "timestamp": ts(timedelta(hours=20)),
            },
            {
                "role": "borrower",
                "content": "Haan, mujhe pata hai. Mere bete ki school fees aayi thi isliye der ho gayi. 2 din mein zaroor dunga.",
                "timestamp": ts(timedelta(hours=19)),
            },
            {
                "role": "agent",
                "content": (
                    "Bilkul samajh sakti hoon, Sunita ji — school fees pehle aati hain. "
                    "Main 2 din ke liye note kar leti hoon. Koi bhi help chahiye ho toh please batayein!"
                ),
                "timestamp": ts(timedelta(hours=18, minutes=50)),
            },
        ],
        # Mohammed Irfan — escalated, history of non-response
        "B005": [
            {
                "role": "agent",
                "content": (
                    "Hello Mohammed, this is Priya from Resolve regarding your business loan EMI "
                    "of ₹11,500 which is now 45 days overdue. We'd really like to work with you to "
                    "resolve this — please get in touch at your earliest convenience."
                ),
                "timestamp": ts(timedelta(days=10)),
            },
            {
                "role": "borrower",
                "content": "Will call you back",
                "timestamp": ts(timedelta(days=9, hours=20)),
            },
            {
                "role": "agent",
                "content": (
                    "Thank you for responding, Mohammed! Whenever you're ready, I'm here. "
                    "You can also reply here on WhatsApp — whatever is more convenient for you."
                ),
                "timestamp": ts(timedelta(days=9, hours=19, minutes=55)),
            },
        ],
        # Kavitha Nair — resolved
        "B006": [
            {
                "role": "agent",
                "content": (
                    "Hi Kavitha! Priya here from Resolve. Just a gentle reminder that your "
                    "education loan EMI of ₹5,100 was due recently. Would you like help with the payment?"
                ),
                "timestamp": ts(timedelta(days=4)),
            },
            {
                "role": "borrower",
                "content": "I already paid it yesterday via NEFT. Please check.",
                "timestamp": ts(timedelta(days=3, hours=22)),
            },
            {
                "role": "agent",
                "content": (
                    "Wonderful, Kavitha! I can see the payment — thank you so much! "
                    "Your account is now up to date. Have a great day! 🌟"
                ),
                "timestamp": ts(timedelta(days=3, hours=21, minutes=45)),
            },
        ],
        "B007": [],
    }


seed_data()
