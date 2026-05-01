import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { StatCard } from "../components/StatCard";
import type { AddToast, HistoryItem } from "../types";
import { aiAuditSummary, getErrorMessage, getSourceGroup, riskTone } from "../utils";

export function HistoryPage({ addToast }: { addToast: AddToast }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const navigate = useNavigate();

  async function fetchHistory(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const rows = await apiFetch<HistoryItem[]>("/history");
      setItems(rows);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHistory();
  }, []);

  async function clearHistory(): Promise<void> {
    setError("");
    setClearingAll(true);
    try {
      await apiFetch<{ deleted: number }>("/history", { method: "DELETE" });
      setItems([]);
      addToast("History cleared.", "success");
      setShowClearModal(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setClearingAll(false);
    }
  }

  async function deleteReport(reportId: number): Promise<void> {
    const confirmed = window.confirm(`Delete report #${reportId}?`);
    if (!confirmed) return;

    setError("");
    setDeletingId(reportId);
    try {
      await apiFetch<{ deleted: number }>(`/report/${reportId}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== reportId));
      addToast(`Report #${reportId} deleted.`, "success");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  const stats = useMemo(() => {
    const total = items.length;
    const highRisk = items.filter((item) => riskTone(item.risk_label) === "high").length;
    const aiDetected = items.filter((item) => item.ai_detected).length;
    const avgRisk =
      total > 0
        ? `${Math.round(items.reduce((sum, item) => sum + item.risk_score, 0) * (100 / total))}%`
        : "-";

    return { total, highRisk, aiDetected, avgRisk };
  }, [items]);

  return (
    <section className="dashboard-page">
      <div className="page-head">
        <div>
          <h2>Threat Intelligence Dashboard</h2>
          <p>Monitor recent analyses and jump into any report.</p>
        </div>
        <div className="action-row">
          <button className="btn ghost" onClick={fetchHistory}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn danger" onClick={() => setShowClearModal(true)}>
            Delete all
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard title="Total Reports" value={stats.total} hint="All saved analyses" />
        <StatCard title="Average Risk" value={stats.avgRisk} hint="Across report history" />
        <StatCard title="High Risk" value={stats.highRisk} hint="Needs immediate review" />
        <StatCard title="AI Detected" value={stats.aiDetected} hint="With AI synthesis flags" />
      </div>

      <div className="panel history-panel">
        {error && <p className="error">{error}</p>}
        {!loading && !items.length && (
          <p className="muted">No reports yet. Use the extension to generate a new report.</p>
        )}
        {loading && <p className="muted">Loading history...</p>}

        <div className="history-list">
          {items.map((item) => {
            const tone = riskTone(item.risk_label);
            return (
              <div
                key={item.id}
                className={`history-item tone-${tone}`}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/report/${item.id}`)}
                onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/report/${item.id}`);
                  }
                }}
              >
                <div className="history-top">
                  <strong>Report #{item.id}</strong>
                  <div className="history-actions">
                    <span className={`pill pill-${tone}`}>{item.risk_label}</span>
                    <button
                      type="button"
                      className="history-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteReport(item.id);
                      }}
                      onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => event.stopPropagation()}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
                <small>{getSourceGroup(item.source_url)}</small>
                <blockquote>{item.source_excerpt || "No captured text preview."}</blockquote>
                <span className="meta-row">
                  Risk {Math.round(item.risk_score * 100)}% | AI -{" "}
                  {aiAuditSummary(item.ai_detected, item.ai_confidence)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {showClearModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-history-title"
          onClick={() => {
            if (!clearingAll) setShowClearModal(false);
          }}
        >
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3 id="clear-history-title">Clear all reports?</h3>
            <p>This will permanently delete all reports from your dashboard history.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShowClearModal(false)}
                disabled={clearingAll}
              >
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={clearHistory} disabled={clearingAll}>
                {clearingAll ? "Clearing..." : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
