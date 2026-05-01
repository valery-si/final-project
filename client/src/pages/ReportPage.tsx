import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";
import type { CheckAIResponse, Report, Signal } from "../types";
import { aiAuditLabel, getErrorMessage, interpretSignal, riskTone, shouldShowSignal } from "../utils";

function isLabelConfidence(signal: Signal): boolean {
  return signal.name.toLowerCase() === "label confidence";
}

export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [aiError, setAiError] = useState("");
  const [checkingAi, setCheckingAi] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Missing report id.");
      return;
    }
    apiFetch<Report>(`/report/${id}`)
      .then(setReport)
      .catch((err) => setError(getErrorMessage(err)));
  }, [id]);

  if (error) {
    return (
      <div className="panel">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="panel">
        <p className="muted">Loading report...</p>
      </div>
    );
  }

  const tone = riskTone(report.risk_label);
  const aiConfidence = report.ai_confidence;
  const hasAiAudit = typeof aiConfidence === "number";
  const visibleSignals = report.signals.filter(shouldShowSignal);
  const evaluationSignals = visibleSignals.filter((signal) => !isLabelConfidence(signal));
  const confidenceSignals = visibleSignals.filter(isLabelConfidence);

  async function checkAiGenerated(): Promise<void> {
    if (!report) return;

    setAiError("");
    setCheckingAi(true);
    try {
      const result = await apiFetch<CheckAIResponse>("/check-ai", {
        method: "POST",
        body: JSON.stringify({ analysis_id: report.id }),
      });
      setReport({
        ...report,
        ai_detected: result.ai_detected,
        ai_confidence: result.ai_confidence,
        ai_reasoning: result.ai_reasoning,
      });
    } catch (err) {
      setAiError(getErrorMessage(err));
    } finally {
      setCheckingAi(false);
    }
  }

  return (
    <section className="dashboard-page">
      <div className="page-head">
        <div>
          <h2>Report #{report.id}</h2>
          <p>Detailed confidence and signal breakdown.</p>
        </div>
      </div>

      <div className="report-grid">
        <article className="panel report-summary">
          <p className="section-label">Risk Overview</p>
          <p className={`risk-badge pill-${tone}`}>
            {report.risk_label} ({Math.round(report.risk_score * 100)}%)
          </p>
          <p className="small-line">
            <strong>URL:</strong> <a href={report.source_url}>{report.source_url}</a>
          </p>
          <p className="small-line audit-line">
            <span>
              <strong>AI Audit:</strong> {aiAuditLabel(report.ai_detected, report.ai_confidence)}
            </span>
            {!hasAiAudit && (
              <button type="button" className="btn compact" onClick={checkAiGenerated} disabled={checkingAi}>
                {checkingAi ? "Checking..." : "Check AI Generated"}
              </button>
            )}
          </p>
          {aiError && <p className="error">{aiError}</p>}
          {hasAiAudit && (
            <p className="small-line">
              <strong>AI Confidence:</strong> {Math.round(aiConfidence * 100)}%
            </p>
          )}
          {report.ai_reasoning && (
            <p className="small-line">
              <strong>AI Reasoning:</strong> {report.ai_reasoning}
            </p>
          )}
        </article>

        <article className="panel">
          <div className="signals-head">
            <p className="section-label">Evaluation Signals</p>
            {confidenceSignals.map((signal) => {
              const interpreted = interpretSignal(signal);
              return (
                <span key={signal.name} className="signal-title">
                  - Confidence {interpreted.percent}%
                </span>
              );
            })}
          </div>
          <ul className="signal-list">
            {evaluationSignals.map((signal) => {
              const interpreted = interpretSignal(signal);
              return (
                <li key={signal.name} className={`signal-card signal-card-${interpreted.tone}`}>
                  <div className="signal-card-head">
                    <span className="signal-title">{interpreted.title}</span>
                    <strong>{interpreted.percent}%</strong>
                  </div>
                  <span className={`signal-badge signal-badge-${interpreted.tone}`}>{interpreted.badge}</span>
                  <p>{interpreted.meaning}</p>
                </li>
              );
            })}
          </ul>
        </article>
      </div>

      <article className="panel">
        <p className="section-label">Source Text</p>
        <pre>{report.source_text}</pre>
      </article>
    </section>
  );
}
