# Resolve — Credit Recovery Intelligence

AI-powered borrower follow-up agent with real-time intelligence dashboard.
Built to demonstrate how AI agents can handle debt recovery workflows at scale.

## What it does

Resolve automates borrower outreach across the entire recovery lifecycle:
- Detects borrower intent from WhatsApp replies using Claude AI
- Transitions borrower state automatically via a 7-state FSM engine
- Generates empathetic, context-aware follow-up messages
- Provides AI risk analysis with payment intent scoring
- Gives loan officers a real-time dashboard to monitor and act

## Demo

- Add borrowers and track them across 7 states
- Simulate borrower replies and watch state transitions happen live
- Generate AI risk summaries with emotional state and recommended actions
- One-click escalation to human agents with audit trail

## Architecture

```
┌─────────────────────────────────────────┐
│         Loan Officer Dashboard          │
│         (React + TypeScript)            │
└──────────────────┬──────────────────────┘
                   │ simulate reply / send message
                   ▼
┌─────────────────────────────────────────┐
│            FastAPI Backend              │
│         (Python + Uvicorn)              │
└──────┬───────────────────┬──────────────┘
       │                   │
       ▼                   ▼
┌─────────────┐   ┌─────────────────────┐
│   Intent    │   │   State Machine     │
│  Detection  │   │     FSM Engine      │
│   (Haiku)   │   │     7 States        │
└──────┬──────┘   └──────────┬──────────┘
       │                     │
       └──────────┬──────────┘
                  ▼
┌─────────────────────────────────────────┐
│    Response Generation (Sonnet)         │
│   Context-aware, empathetic messages    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│           Dashboard Update              │
│      State change + Message logged      │
└─────────────────────────────────────────┘
```

## State Machine

| State | Meaning |
|-------|---------|
| NEW | Added, not yet contacted |
| CONTACTED | First message sent |
| NO_RESPONSE | 24h+ silence |
| NEGOTIATING | Active conversation |
| PROMISED | Committed to pay date |
| RESOLVED | Payment confirmed |
| ESCALATED | Handed to human agent |

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: FastAPI (Python)
- **AI**: Anthropic Claude API (Haiku for classification, Sonnet for generation)
- **State Machine**: Custom FSM engine

## Setup

### Backend
```
cd backend
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## WhatsApp Integration (optional, not required for demo)
1. Create Twilio account at twilio.com
2. Join WhatsApp sandbox
3. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env
4. Run ngrok http 8000
5. Set webhook URL in Twilio console to https://your-ngrok-url/webhook/whatsapp

## Built by
Rohit — exploring AI-first fintech infrastructure for India
