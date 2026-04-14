export const BorrowerState = {
  NEW:          "NEW",
  CONTACTED:    "CONTACTED",
  NO_RESPONSE:  "NO_RESPONSE",
  NEGOTIATING:  "NEGOTIATING",
  PROMISED:     "PROMISED",
  RESOLVED:     "RESOLVED",
  ESCALATED:    "ESCALATED",
} as const;

export type BorrowerState = (typeof BorrowerState)[keyof typeof BorrowerState];

export interface Borrower {
  id: string;
  name: string;
  phone: string;
  emi_amount: number;
  loan_type: string;
  days_overdue: number;
  state: BorrowerState;
  attempt_count: number;
  last_contacted_at: string | null;
  promise_date: string | null;
  created_at: string;
  next_action: string | null;
  message_count: number;
}

export interface Message {
  direction: "IN" | "OUT";
  content: string;
  timestamp: string;
}

export interface BorrowerDetail extends Borrower {
  messages: Message[];
}

export interface RiskSummary {
  payment_intent_score: number;
  emotional_state: string;
  recommended_action: string;
  risk_level: string;
  key_insight: string;
}

export interface Stats {
  total_borrowers: number;
  total_overdue_amount: number;
  resolved_today: number;
  escalated: number;
  state_distribution: Record<BorrowerState, number>;
  avg_days_overdue: number;
}
