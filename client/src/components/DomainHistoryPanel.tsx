import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatCard } from "./StatCard";
import type { DomainReportHistoryResponse } from "../types";

export type DomainHistoryLimit = 30 | 45 | 60;
type DomainSummary = {
  domain: string;
  reports: number;
  avgRisk: number;
  highestRisk: number;
  highRisk: number;
  aiDetected: number;
};

const chartSignalNames = ["Emotional Intensity", "Source Weakness", "Generic AI-like Style"] as const;
const chartSignalColors: Record<(typeof chartSignalNames)[number], string> = {
  "Emotional Intensity": "#0f5d8a",
  "Source Weakness": "#1d7c56",
  "Generic AI-like Style": "#ad6a24",
};

function chartSignalValue(
  signals: DomainReportHistoryResponse["items"][number]["signals"],
  signalName: (typeof chartSignalNames)[number],
): number | null {
  const signal = signals.find((item) => item.name === signalName);
  return typeof signal?.value === "number" ? Math.round(signal.value * 100) : null;
}

function signalPercent(signals: DomainReportHistoryResponse["items"][number]["signals"], signalName: string): string {
  const signal = signals.find((item) => item.name === signalName);
  return typeof signal?.value === "number" ? `${Math.round(signal.value * 100)}%` : "-";
}

export function DomainHistoryPanel({
  domain,
  history,
  summary,
  loading,
  error,
  limit,
  onLimitChange,
}: {
  domain: string;
  history: DomainReportHistoryResponse | null;
  summary: DomainSummary | null;
  loading: boolean;
  error: string;
  limit: DomainHistoryLimit;
  onLimitChange: (limit: DomainHistoryLimit) => void;
}) {
  const items = history?.items || [];
  const chronologicalItems = [...items].reverse();
  const signalNames = Array.from(new Set(chronologicalItems.flatMap((item) => item.signals.map((signal) => signal.name))));
  const chartRows = chronologicalItems.map((item) => {
    const row: Record<string, string | number | null> = {
      report: `#${item.id}`,
    };
    chartSignalNames.forEach((signalName) => {
      row[signalName] = chartSignalValue(item.signals, signalName);
    });
    return row;
  });

  return (
    <article className="panel domain-history-panel">
      <div className="domain-history-head">
        <div>
          <p className="section-label">Domain History</p>
          <h3>{domain}</h3>
        </div>
        <label>
          Last
          <select value={limit} onChange={(event) => onLimitChange(Number(event.target.value) as DomainHistoryLimit)}>
            <option value={30}>30 reports</option>
            <option value={45}>45 reports</option>
            <option value={60}>60 reports</option>
          </select>
        </label>
      </div>

      {loading && <p className="muted">Loading domain statistics...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && !items.length && <p className="muted">No saved reports found for this domain.</p>}

      {!loading && !error && items.length > 0 && (
        <>
          {summary && (
            <div className="stats-grid domain-stats-grid">
              <StatCard title="Reports" value={summary.reports} />
              <StatCard title="Average Risk" value={`${summary.avgRisk}%`} />
              <StatCard title="Highest Risk" value={`${summary.highestRisk}%`} />
              <StatCard title="High Risk" value={summary.highRisk} />
              <StatCard title="AI Detected" value={summary.aiDetected} />
            </div>
          )}

          <div className="domain-chart">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartRows} margin={{ top: 8, right: 18, left: -18, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="report" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value, name) => [`${value}%`, String(name)]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
                {chartSignalNames.map((signalName) => (
                  <Line
                    key={signalName}
                    type="monotone"
                    dataKey={signalName}
                    stroke={chartSignalColors[signalName]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="domain-history-table-wrap">
            <table className="domain-history-table">
              <thead>
                <tr>
                  <th>Signal</th>
                  {chronologicalItems.map((item) => (
                    <th key={item.id}>#{item.id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Risk Score</td>
                  {chronologicalItems.map((item) => (
                    <td key={item.id}>{Math.round(item.risk_score * 100)}%</td>
                  ))}
                </tr>
                {signalNames.map((signalName) => (
                  <tr key={signalName}>
                    <td>{signalName}</td>
                    {chronologicalItems.map((item) => (
                      <td key={item.id}>{signalPercent(item.signals, signalName)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </article>
  );
}
