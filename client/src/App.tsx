import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import { StatusIcon, ApiKeyIcon } from "./components/StatusIcons";
import { ToastStack } from "./components/ToastStack";
import { HistoryPage } from "./pages/HistoryPage";
import { ReportPage } from "./pages/ReportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import type { OpenAiKeyStatus, SettingsResponse, TldrStatus, ToastItem, ToastType } from "./types";
import { getErrorMessage } from "./utils";

export default function App() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [tldrStatus, setTldrStatus] = useState<TldrStatus>({
    mode: "local-neural",
    status: "loading",
    model: "sshleifer/distilbart-cnn-12-6",
    device: null,
    error: null,
  });
  const [openAiKeyStatus, setOpenAiKeyStatus] = useState<OpenAiKeyStatus>({
    status: "checking",
    preview: null,
    error: null,
  });

  function addToast(message: string, type: ToastType = "info"): void {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3500);
  }

  useEffect(() => {
    apiFetch<SettingsResponse>("/settings")
      .then((data) => {
        setOpenAiKeyStatus({
          status: data.has_api_key ? "configured" : "missing",
          preview: data.api_key_preview || null,
          error: null,
        });
      })
      .catch((err) => {
        setOpenAiKeyStatus({
          status: "failed",
          preview: null,
          error: getErrorMessage(err),
        });
      });
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const data = await apiFetch<TldrStatus>("/tldr-status");
        if (!mounted) return;
        setTldrStatus(data);
        if (data.status === "ready") {
          window.clearInterval(interval);
        }
      } catch {
        if (mounted) {
          setTldrStatus({
            mode: "local-neural",
            status: "failed",
            model: "sshleifer/distilbart-cnn-12-6",
            device: null,
            error: "Status probe failed",
          });
        }
      }
    };

    const interval = window.setInterval(fetchStatus, 10000);
    fetchStatus();
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar">

        <h1 onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
          TrustLens
        </h1>

        <p className="muted p-0">Credibility signals for online content</p>

        <nav className="nav-links">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/statistics">Statistics</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>

        <div className="sidebar-model-status external-link">
          <div className="sidebar-status-head">
            <strong>ChatGPT key</strong>
            <ApiKeyIcon status={openAiKeyStatus.status} />
          </div>
          <small>{openAiKeyStatus.preview ? `Key: ${openAiKeyStatus.preview}` : "OpenAI key: n/a"}</small>
          {openAiKeyStatus.error && <small className="status-error">{openAiKeyStatus.error}</small>}
        </div>

        <div className="sidebar-model-status">
          <div className="sidebar-status-head">
            <strong>TL;DR Local model</strong>
            <span className={`status-pill status-pill-${tldrStatus.status}`}>
              <StatusIcon status={tldrStatus.status} />
              {tldrStatus.status}
            </span>
          </div>
          <small>Model: {tldrStatus.model}</small>
          <small>{tldrStatus.device ? `Device: ${tldrStatus.device.toUpperCase()}` : "Device: n/a"}</small>

          {tldrStatus.error && <small className="status-error">{tldrStatus.error}</small>}
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<HistoryPage addToast={addToast} />} />
          <Route path="/report/:id" element={<ReportPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route
            path="/settings"
            element={<SettingsPage addToast={addToast} onApiKeyStatusChange={setOpenAiKeyStatus} />}
          />
        </Routes>
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
