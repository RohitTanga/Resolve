import type { Borrower, BorrowerDetail, RiskSummary, Stats } from "../types";

const BASE_URL = "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function getBorrowers(): Promise<Borrower[]> {
  return request<Borrower[]>("/borrowers");
}

export function getBorrower(id: string): Promise<BorrowerDetail> {
  return request<BorrowerDetail>(`/borrowers/${id}`);
}

export function getRiskSummary(id: string): Promise<RiskSummary> {
  return request<RiskSummary>(`/borrowers/${id}/summary`);
}

export function getStats(): Promise<Stats> {
  return request<Stats>("/stats");
}

export function sendMessage(borrowerId: string): Promise<void> {
  return request<void>(`/borrowers/${borrowerId}/send`, { method: "POST" });
}

export function simulateReply(borrowerId: string, reply: string): Promise<void> {
  return request<void>(`/borrowers/${borrowerId}/simulate-reply`, {
    method: "POST",
    body: JSON.stringify({ reply }),
  });
}

export function escalateBorrower(borrowerId: string): Promise<BorrowerDetail> {
  return request<BorrowerDetail>(`/borrowers/${borrowerId}/escalate`, { method: "POST" });
}

export interface AddBorrowerPayload {
  name: string;
  phone: string;
  emi_amount: number;
  loan_type: string;
  days_overdue: number;
}

export function addBorrower(payload: AddBorrowerPayload): Promise<Borrower> {
  return request<Borrower>("/borrowers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
