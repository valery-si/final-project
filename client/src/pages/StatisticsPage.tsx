import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { DomainHistoryPanel } from "../components/DomainHistoryPanel";
import type { DomainHistoryLimit } from "../components/DomainHistoryPanel";
import type { DomainReportHistoryResponse, HistoryItem } from "../types";
import { getErrorMessage, getSourceGroup, riskTone } from "../utils";

type DomainSummary = {
  domain: string;
  reports: number;
  avgRisk: number;
  highestRisk: number;
  highRisk: number;
  aiDetected: number;
};

function buildDomainSummaries(items: HistoryItem[]): DomainSummary[] {
  const byDomain = new Map<string, { totalRisk: number; reports: number; highestRisk: number; highRisk: number; aiDetected: number }>();

  items.forEach((item) => {
    const domain = getSourceGroup(item.source_url);
    const current = byDomain.get(domain) || {
      totalRisk: 0,
      reports: 0,
      highestRisk: 0,
      highRisk: 0,
      aiDetected: 0,
    };

    current.totalRisk += item.risk_score;
    current.reports += 1;
    current.highestRisk = Math.max(current.highestRisk, item.risk_score);
    current.highRisk += riskTone(item.risk_label) === "high" ? 1 : 0;
    current.aiDetected += item.ai_detected ? 1 : 0;
    byDomain.set(domain, current);
  });

  return Array.from(byDomain.entries())
    .map(([domain, stat]) => ({
      domain,
      reports: stat.reports,
      avgRisk: Math.round((stat.totalRisk / stat.reports) * 100),
      highestRisk: Math.round(stat.highestRisk * 100),
      highRisk: stat.highRisk,
      aiDetected: stat.aiDetected,
    }))
    .sort((a, b) => b.reports - a.reports || b.avgRisk - a.avgRisk);
}

export function StatisticsPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [domainHistoryLimit, setDomainHistoryLimit] = useState<DomainHistoryLimit>(30);
  const [domainHistory, setDomainHistory] = useState<DomainReportHistoryResponse | null>(null);
  const [domainHistoryError, setDomainHistoryError] = useState("");
  const [loadingDomainHistory, setLoadingDomainHistory] = useState(false);

  useEffect(() => {
    setLoadingHistory(true);
    setHistoryError("");
    apiFetch<HistoryItem[]>("/history")
      .then(setItems)
      .catch((err) => setHistoryError(getErrorMessage(err)))
      .finally(() => setLoadingHistory(false));
  }, []);

  const domainSummaries = useMemo(() => buildDomainSummaries(items), [items]);
  const selectedDomainSummary = useMemo(
    () => domainSummaries.find((summary) => summary.domain === selectedDomain) || null,
    [domainSummaries, selectedDomain],
  );

  useEffect(() => {
    if (!selectedDomain && domainSummaries.length) {
      setSelectedDomain(domainSummaries[0].domain);
    }
  }, [selectedDomain, domainSummaries]);

  useEffect(() => {
    if (!selectedDomain) return;

    const params = new URLSearchParams({ domain: selectedDomain, limit: String(domainHistoryLimit) });
    setLoadingDomainHistory(true);
    setDomainHistoryError("");
    apiFetch<DomainReportHistoryResponse>(`/domain-history?${params.toString()}`)
      .then(setDomainHistory)
      .catch((err) => setDomainHistoryError(getErrorMessage(err)))
      .finally(() => setLoadingDomainHistory(false));
  }, [selectedDomain, domainHistoryLimit]);

  return (
    <section className="dashboard-page">
      <div className="page-head">
        <div>
          <h2>Statistics</h2>
          <p>Compare signal history across reports from the same domain.</p>
        </div>
      </div>

      {historyError && <p className="error">{historyError}</p>}
      {loadingHistory && <p className="muted">Loading domains...</p>}

      {!loadingHistory && !domainSummaries.length && (
        <div className="panel">
          <p className="muted">No reports yet. Analyze pages first to build domain statistics.</p>
        </div>
      )}

      {!!domainSummaries.length && (
        <div className="statistics-layout">
          <aside className="panel domain-list-panel">
            <p className="section-label">Domains</p>
            <div className="domain-list">
              {domainSummaries.map((summary) => (
                <button
                  key={summary.domain}
                  type="button"
                  className={`domain-list-item ${selectedDomain === summary.domain ? "domain-list-item-active" : ""}`}
                  onClick={() => setSelectedDomain(summary.domain)}
                >
                  <span>
                    <strong>{summary.domain}</strong>
                    <small>{summary.reports} reports</small>
                  </span>
                  <span>{summary.avgRisk}% avg</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="statistics-detail">
            <DomainHistoryPanel
              domain={selectedDomain}
              history={domainHistory}
              summary={selectedDomainSummary}
              loading={loadingDomainHistory}
              error={domainHistoryError}
              limit={domainHistoryLimit}
              onLimitChange={setDomainHistoryLimit}
            />
          </div>
        </div>
      )}
    </section>
  );
}
