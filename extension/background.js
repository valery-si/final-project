const API_BASE = "http://localhost:8000/api";
const DASHBOARD_BASE = "http://localhost:5173";
const REQUEST_TIMEOUT_MS = 600000;

async function setStorage(value) {
  return chrome.storage.local.set(value);
}

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

function hostFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      const filename = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "local file");
      return `local file: ${filename}`;
    }
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function withReportUrl(item) {
  return {
    ...item,
    reportUrl: `${DASHBOARD_BASE}/report/${item.id}`
  };
}

async function handleAnalyzeSelection(message, sendResponse) {
  try {
    const result = await apiFetch(
      "/analyze",
      {
        method: "POST",
        body: JSON.stringify({
          text: message.text,
          source_url: message.url
        })
      }
    );

    const reportUrl = `${DASHBOARD_BASE}/report/${result.id}`;
    await setStorage({ lastResult: { ...result, reportUrl, sourceUrl: message.url } });
    sendResponse({ ok: true, data: { ...result, reportUrl } });
  } catch (error) {
    const errorText =
      error?.name === "AbortError"
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check backend logs.`
        : String(error.message || error);
    sendResponse({ ok: false, error: errorText });
  }
}

async function handleSummarizeSelection(message, sendResponse) {
  try {
    const mode = message.mode === "openai" ? "openai" : "local-neural";
    const result = await apiFetch(
      "/tldr",
      {
        method: "POST",
        body: JSON.stringify({
          text: message.text,
          source_url: message.url,
          mode
        })
      }
    );
    sendResponse({ ok: true, data: result });
  } catch (error) {
    const errorText =
      error?.name === "AbortError"
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check backend logs.`
        : String(error.message || error);
    sendResponse({ ok: false, error: errorText });
  }
}

async function handleGetSiteHistory(message, sendResponse) {
  try {
    const host = hostFromUrl(message.url || "");
    const history = await apiFetch("/history", {});

    const items = history
      .filter((item) => hostFromUrl(item.source_url) === host)
      .slice(0, 5)
      .map(withReportUrl);

    sendResponse({
      ok: true,
      data: {
        host,
        items,
        dashboardUrl: `${DASHBOARD_BASE}/`
      }
    });
  } catch (error) {
    sendResponse({ ok: false, error: String(error.message || error) });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "analyze-selection") {
    handleAnalyzeSelection(message, sendResponse);
    return true;
  }

  if (message.type === "summarize-selection") {
    handleSummarizeSelection(message, sendResponse);
    return true;
  }

  if (message.type === "get-site-history") {
    handleGetSiteHistory(message, sendResponse);
    return true;
  }

  return false;
});
