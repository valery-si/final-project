import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiFetch } from "../api";
import type { AddToast, OpenAiKeyStatus, SettingsResponse } from "../types";
import { getErrorMessage } from "../utils";

export function SettingsPage({
  addToast,
  onApiKeyStatusChange,
}: {
  addToast: AddToast;
  onApiKeyStatusChange: (status: OpenAiKeyStatus) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyPreview, setApiKeyPreview] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadSettings(): Promise<void> {
    setLoading(true);
    try {
      const data = await apiFetch<SettingsResponse>("/settings");
      setHasApiKey(Boolean(data.has_api_key));
      setApiKeyPreview(data.api_key_preview || "");
      onApiKeyStatusChange({
        status: data.has_api_key ? "configured" : "missing",
        preview: data.api_key_preview || null,
        error: null,
      });
    } catch (err) {
      const message = getErrorMessage(err);
      setStatus(`Failed to load settings: ${message}`);
      onApiKeyStatusChange({ status: "failed", preview: null, error: message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function saveKey(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("");
    try {
      const cleaned = apiKey.trim();
      if (!cleaned) {
        setStatus("Enter a valid API key.");
        return;
      }
      const data = await apiFetch<SettingsResponse>("/settings/api-key", {
        method: "PUT",
        body: JSON.stringify({ api_key: cleaned }),
      });
      setApiKey("");
      setHasApiKey(Boolean(data.has_api_key));
      setApiKeyPreview(data.api_key_preview || "");
      onApiKeyStatusChange({
        status: data.has_api_key ? "configured" : "missing",
        preview: data.api_key_preview || null,
        error: null,
      });
      setStatus("API key saved.");
      addToast("Settings saved.", "success");
    } catch (err) {
      setStatus(`Failed to save API key: ${getErrorMessage(err)}`);
    }
  }

  async function deleteKey(): Promise<void> {
    setStatus("");
    try {
      const data = await apiFetch<SettingsResponse>("/settings/api-key", { method: "DELETE" });
      setHasApiKey(Boolean(data.has_api_key));
      setApiKeyPreview(data.api_key_preview || "");
      onApiKeyStatusChange({
        status: data.has_api_key ? "configured" : "missing",
        preview: data.api_key_preview || null,
        error: null,
      });
      setStatus("API key deleted.");
      addToast("API key deleted.", "info");
    } catch (err) {
      setStatus(`Failed to delete API key: ${getErrorMessage(err)}`);
    }
  }

  return (
    <section className="dashboard-page">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p>Configure app behavior by category.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="settings-panel-head">
            <h3>AI Provider</h3>
            <p>OpenAI credentials for AI synthesis audits.</p>
          </div>

          <div className="settings-status-row">
            <p className="settings-status-text">
              <strong>Current key status:</strong>
            </p>
            <span className={`status-pill ${hasApiKey ? "status-pill-ok" : "status-pill-muted"}`}>
              {loading ? "Checking..." : hasApiKey ? "Configured" : "Not configured"}
            </span>
          </div>
          {hasApiKey && (
            <p className="settings-preview">
              Preview: <code>{apiKeyPreview || "sk-...****"}</code>
            </p>
          )}

          <form className="settings-form" onSubmit={saveKey}>
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
              minLength={20}
              required
            />
            <button className="btn">Save API Key</button>
          </form>

          {hasApiKey && (
            <button className="btn ghost settings-delete-key" onClick={deleteKey}>
              Delete API Key
            </button>
          )}

          {status && <p className="settings-status-note">{status}</p>}
        </section>

      </div>
    </section>
  );
}
