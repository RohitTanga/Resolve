import { useState, useEffect, useCallback, useRef } from "react";
import type { Borrower, BorrowerDetail, RiskSummary, Stats, Message } from "./types";
import { BorrowerState } from "./types";
import {
  getBorrowers,
  getBorrower,
  getRiskSummary,
  getStats,
  sendMessage,
  simulateReply,
  escalateBorrower,
  addBorrower,
  type AddBorrowerPayload,
} from "./lib/api";

// ─── helpers ────────────────────────────────────────────────────────────────

const STATE_COLORS: Record<BorrowerState, { bg: string; color: string }> = {
  [BorrowerState.NEW]:          { bg: "#dbeafe", color: "#1d4ed8" },
  [BorrowerState.CONTACTED]:    { bg: "#dcfce7", color: "#166534" },
  [BorrowerState.NO_RESPONSE]:  { bg: "#fef3c7", color: "#92400e" },
  [BorrowerState.NEGOTIATING]:  { bg: "#ede9fe", color: "#6d28d9" },
  [BorrowerState.PROMISED]:     { bg: "#ccfbf1", color: "#0f766e" },
  [BorrowerState.RESOLVED]:     { bg: "#dcfce7", color: "#166534" },
  [BorrowerState.ESCALATED]:    { bg: "#fee2e2", color: "#991b1b" },
};

const STATE_LABELS: Record<BorrowerState, string> = {
  [BorrowerState.NEW]:         "New",
  [BorrowerState.CONTACTED]:   "Contacted",
  [BorrowerState.NO_RESPONSE]: "No Response",
  [BorrowerState.NEGOTIATING]: "Negotiating",
  [BorrowerState.PROMISED]:    "Promised",
  [BorrowerState.RESOLVED]:    "Resolved",
  [BorrowerState.ESCALATED]:   "Escalated",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN").format(n);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StateBadge({ state }: { state: BorrowerState }) {
  const c = STATE_COLORS[state];
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      background: c.bg,
      color: c.color,
      whiteSpace: "nowrap",
    }}>
      {STATE_LABELS[state]}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      flex: 1,
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      padding: "14px 18px",
      background: "#fff",
    }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{value}</div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: Message }) {
  const out = msg.direction === "OUT";
  return (
    <div style={{
      display: "flex",
      justifyContent: out ? "flex-end" : "flex-start",
      marginBottom: 8,
    }}>
      <div style={{
        maxWidth: "80%",
        padding: "8px 12px",
        borderRadius: out ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
        background: out ? "#111827" : "#f3f4f6",
        color: out ? "#fff" : "#111827",
        fontSize: 13,
        lineHeight: 1.5,
      }}>
        <div>{msg.content}</div>
        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
          {fmtDate(msg.timestamp)}
        </div>
      </div>
    </div>
  );
}

// ─── main app ───────────────────────────────────────────────────────────────

const ALL_STATES = Object.values(BorrowerState);

export default function App() {
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<BorrowerState | "ALL">("ALL");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BorrowerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"messages" | "ai">("messages");
  const [riskSummary, setRiskSummary] = useState<RiskSummary | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const EMPTY_FORM: AddBorrowerPayload = { name: "", phone: "", emi_amount: 0, loan_type: "Personal Loan", days_overdue: 0 };
  const [addForm, setAddForm] = useState<AddBorrowerPayload>(EMPTY_FORM);
  const [addLoading, setAddLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([getBorrowers(), getStats()]);
    setBorrowers(b);
    setStats(s);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    setRiskSummary(null);
    setActiveTab("messages");
    getBorrower(selectedId)
      .then(setDetail)
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  const handleGenerateAnalysis = async () => {
    if (!selectedId) return;
    setRiskLoading(true);
    try {
      const r = await getRiskSummary(selectedId);
      setRiskSummary(r);
    } finally {
      setRiskLoading(false);
    }
  };

  const handleAddBorrower = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);
    try {
      await addBorrower(addForm);
      setAddModalOpen(false);
      setAddForm(EMPTY_FORM);
      await refresh();
    } finally {
      setAddLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      const d = await escalateBorrower(selectedId);
      setDetail(d);
      await refresh();
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await sendMessage(selectedId);
      const d = await getBorrower(selectedId);
      setDetail(d);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulate = async () => {
    if (!selectedId || !replyText.trim()) return;
    setActionLoading(true);
    try {
      await simulateReply(selectedId, replyText.trim());
      setReplyText("");
      const d = await getBorrower(selectedId);
      setDetail(d);
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = borrowers.filter((b) => {
    const matchName = b.name.toLowerCase().includes(search.toLowerCase());
    const matchState = stateFilter === "ALL" || b.state === stateFilter;
    return matchName && matchState;
  });

  // ── layout constants
  const NAVBAR_H = 56;
  const STATS_H = 90;
  const FILTER_H = 56;
  const PANEL_W = 420;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", flexDirection: "column" }}>

      {/* ── Navbar */}
      <nav style={{
        height: NAVBAR_H,
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 14,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{
          width: 32, height: 32, borderRadius: 6, background: "#111827",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 18, flexShrink: 0,
        }}>R</div>
        <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Riverline</span>
        <span style={{ color: "#d1d5db", fontSize: 18, margin: "0 2px" }}>|</span>
        <span style={{ color: "#6b7280", fontSize: 14 }}>Borrower Intelligence</span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            Last refreshed {fmtTime(lastRefresh)}
          </span>
          <button
            onClick={refresh}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 13,
              background: "#fff",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            Refresh
          </button>
        </div>
      </nav>

      {/* ── Stats bar */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "12px 24px",
        display: "flex",
        gap: 12,
      }}>
        <MetricCard label="Total Borrowers" value={stats?.total_borrowers ?? "—"} />
        <MetricCard
          label="Total Overdue"
          value={stats ? `₹${fmt(stats.total_overdue_amount)}` : "—"}
        />
        <MetricCard label="Escalated" value={stats?.escalated ?? "—"} />
        <MetricCard label="Resolved Today" value={stats?.resolved_today ?? "—"} />
      </div>

      {/* ── Filter bar */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "0 24px",
        height: FILTER_H,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 13,
            width: 200,
            outline: "none",
          }}
        />
        <button
          onClick={() => setAddModalOpen(true)}
          style={{
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            background: "#111827",
            color: "#fff",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Add Borrower
        </button>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(["ALL", ...ALL_STATES] as const).map((s) => {
            const active = stateFilter === s;
            const c = s !== "ALL" ? STATE_COLORS[s] : null;
            const count = s === "ALL" ? borrowers.length : borrowers.filter((b) => b.state === s).length;
            return (
              <button
                key={s}
                onClick={() => setStateFilter(s)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  border: active ? "2px solid currentColor" : "1px solid #e5e7eb",
                  cursor: "pointer",
                  background: active && c ? c.bg : active ? "#111827" : "#fff",
                  color: active && c ? c.color : active ? "#fff" : "#6b7280",
                  transition: "all 0.1s",
                }}
              >
                {s === "ALL" ? "All" : STATE_LABELS[s]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body: table + side panel */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>

        {/* Table */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          paddingRight: selectedId ? PANEL_W : 0,
          transition: "padding-right 0.25s",
        }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            background: "#fff",
          }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                {["Borrower", "Amount (₹)", "Days Overdue", "State", "Attempts", "Last Contact", "Next Action"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#6b7280",
                    whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelectedId(b.id === selectedId ? null : b.id)}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    cursor: "pointer",
                    background: b.id === selectedId ? "#f0f9ff" : "#fff",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (b.id !== selectedId) (e.currentTarget as HTMLTableRowElement).style.background = "#f9fafb";
                  }}
                  onMouseLeave={(e) => {
                    if (b.id !== selectedId) (e.currentTarget as HTMLTableRowElement).style.background = "#fff";
                  }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{b.loan_type}</div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#111827", fontWeight: 500 }}>
                    ₹{fmt(b.emi_amount)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      color: b.days_overdue > 60 ? "#991b1b" : b.days_overdue > 30 ? "#92400e" : "#111827",
                      fontWeight: b.days_overdue > 30 ? 600 : 400,
                    }}>
                      {b.days_overdue}d
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StateBadge state={b.state} />
                  </td>
                  <td style={{ padding: "12px 16px", color: "#6b7280" }}>{b.attempt_count}</td>
                  <td style={{ padding: "12px 16px", color: "#6b7280" }}>
                    {fmtDate(b.last_contacted_at)}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#374151", maxWidth: 200 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.next_action ?? "—"}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
                    No borrowers match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Side panel */}
        {selectedId && (
          <div style={{
            position: "fixed",
            top: NAVBAR_H + STATS_H + FILTER_H,
            right: 0,
            bottom: 0,
            width: PANEL_W,
            background: "#fff",
            borderLeft: "1px solid #e5e7eb",
            display: "flex",
            flexDirection: "column",
            zIndex: 50,
            overflowY: "hidden",
          }}>
            {detailLoading || !detail ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
                Loading…
              </div>
            ) : (
              <>
                {/* Panel header */}
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{detail.name}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{detail.loan_type}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StateBadge state={detail.state} />
                      <button
                        onClick={() => setSelectedId(null)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 18, color: "#9ca3af", lineHeight: 1, padding: "0 2px",
                        }}
                      >×</button>
                    </div>
                  </div>

                  {/* Mini metrics */}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    {[
                      { label: "Overdue", value: `₹${fmt(detail.emi_amount)}` },
                      { label: "Days Late", value: `${detail.days_overdue}d` },
                      { label: "Attempts", value: detail.attempt_count },
                    ].map((m) => (
                      <div key={m.label} style={{
                        flex: 1, background: "#f9fafb", borderRadius: 6, padding: "8px 10px",
                        border: "1px solid #e5e7eb",
                      }}>
                        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", padding: "0 20px" }}>
                  {(["messages", "ai"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: "10px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        borderBottom: activeTab === tab ? "2px solid #111827" : "2px solid transparent",
                        color: activeTab === tab ? "#111827" : "#9ca3af",
                        marginBottom: -1,
                      }}
                    >
                      {tab === "messages" ? "Messages" : "AI Analysis"}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
                  {activeTab === "messages" ? (
                    <>
                      {detail.messages.length === 0 && (
                        <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", marginTop: 24 }}>
                          No messages yet.
                        </div>
                      )}
                      {detail.messages.map((m, i) => (
                        <ChatBubble key={i} msg={m} />
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  ) : (
                    <div>
                      {!riskSummary ? (
                        <div style={{ textAlign: "center", marginTop: 32 }}>
                          <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 16 }}>
                            Click to generate an AI risk analysis for this borrower.
                          </div>
                          <button
                            onClick={handleGenerateAnalysis}
                            disabled={riskLoading}
                            style={btnStyle("#111827")}
                          >
                            {riskLoading ? "Generating…" : "Generate Analysis"}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          <RiskRow label="Risk Level" value={
                            <span style={{
                              fontWeight: 700,
                              color: riskSummary.risk_level === "HIGH" ? "#991b1b"
                                : riskSummary.risk_level === "MEDIUM" ? "#92400e"
                                : "#166534",
                            }}>{riskSummary.risk_level}</span>
                          } />
                          <RiskRow label="Payment Intent Score" value={
                            <IntentBar score={riskSummary.payment_intent_score} />
                          } />
                          <RiskRow label="Emotional State" value={riskSummary.emotional_state} />
                          <RiskRow label="Recommended Action" value={riskSummary.recommended_action} />
                          <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Key Insight</div>
                            <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{riskSummary.key_insight}</div>
                          </div>
                          <button
                            onClick={handleGenerateAnalysis}
                            disabled={riskLoading}
                            style={{ ...btnStyle("#6b7280"), fontSize: 12, padding: "6px 12px" }}
                          >
                            {riskLoading ? "Refreshing…" : "Refresh Analysis"}
                          </button>
                          {riskSummary.risk_level === "high" && (
                            <button
                              onClick={handleEscalate}
                              disabled={actionLoading}
                              style={{
                                ...btnStyle("#991b1b", actionLoading),
                                marginTop: 4,
                              }}
                            >
                              {actionLoading ? "Escalating…" : "Escalate Now"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action bar */}
                <div style={{
                  borderTop: "1px solid #e5e7eb",
                  padding: "12px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}>
                  {detail.state !== BorrowerState.ESCALATED && detail.state !== BorrowerState.RESOLVED && detail.attempt_count >= 3 && (
                    <button
                      onClick={handleEscalate}
                      disabled={actionLoading}
                      style={btnStyle("#991b1b", actionLoading)}
                    >
                      {actionLoading ? "Escalating…" : "Escalate to Human Agent"}
                    </button>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={actionLoading}
                    style={btnStyle("#111827")}
                  >
                    {actionLoading ? "Sending…" : "Send Next Message"}
                  </button>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      placeholder="Simulate borrower reply…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSimulate()}
                      style={{
                        flex: 1,
                        border: "1px solid #e5e7eb",
                        borderRadius: 6,
                        padding: "7px 10px",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={handleSimulate}
                      disabled={actionLoading || !replyText.trim()}
                      style={btnStyle("#374151", !replyText.trim())}
                    >
                      Simulate
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add Borrower Modal */}
      {addModalOpen && (
        <div
          onClick={() => setAddModalOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, padding: "28px 32px",
              width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              display: "flex", flexDirection: "column", gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Add Borrower</span>
              <button
                onClick={() => setAddModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1 }}
              >×</button>
            </div>

            <form onSubmit={handleAddBorrower} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Name", key: "name", type: "text", placeholder: "Ravi Kumar" },
                { label: "Phone", key: "phone", type: "text", placeholder: "+91xxxxxxxxxx" },
              ].map(({ label, key, type, placeholder }) => (
                <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{label}</span>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={(addForm as Record<string, unknown>)[key] as string}
                    onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                    required
                    style={modalInputStyle}
                  />
                </label>
              ))}

              <div style={{ display: "flex", gap: 12 }}>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>EMI Amount (₹)</span>
                  <input
                    type="number" min={1} placeholder="5000"
                    value={addForm.emi_amount || ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, emi_amount: Number(e.target.value) }))}
                    required
                    style={modalInputStyle}
                  />
                </label>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Days Overdue</span>
                  <input
                    type="number" min={0} placeholder="0"
                    value={addForm.days_overdue || ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, days_overdue: Number(e.target.value) }))}
                    required
                    style={modalInputStyle}
                  />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Loan Type</span>
                <select
                  value={addForm.loan_type}
                  onChange={(e) => setAddForm((f) => ({ ...f, loan_type: e.target.value }))}
                  style={{ ...modalInputStyle, background: "#fff" }}
                >
                  {["Personal Loan", "Home Loan", "Two-Wheeler Loan", "Business Loan", "Gold Loan", "Education Loan", "Microfinance"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                disabled={addLoading}
                style={{ ...btnStyle("#111827", addLoading), marginTop: 4 }}
              >
                {addLoading ? "Adding…" : "Add Borrower"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── tiny helpers ────────────────────────────────────────────────────────────

const modalInputStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function btnStyle(bg: string, disabled?: boolean): React.CSSProperties {
  return {
    background: disabled ? "#e5e7eb" : bg,
    color: disabled ? "#9ca3af" : "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    width: "100%",
  };
}

function RiskRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#111827" }}>{value}</span>
    </div>
  );
}

function IntentBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color = score >= 7 ? "#16a34a" : score >= 4 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 80, height: 6, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{score}/10</span>
    </div>
  );
}
