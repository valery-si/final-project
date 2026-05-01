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

const TLDR_MODE_KEY = "tldr_mode";

function normalizeTldrMode(value) {
  if (value === "openai" || value === "local-neural") {
    return value;
  }
  return "local-neural";
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] || null;
}

async function loadTldrMode() {
  const data = await chrome.storage.local.get([TLDR_MODE_KEY]);
  const mode = normalizeTldrMode(data?.[TLDR_MODE_KEY]);
  const input = document.querySelector(`input[name="tldrMode"][value="${mode}"]`);
  if (input) {
    input.checked = true;
  }
  await chrome.storage.local.set({ [TLDR_MODE_KEY]: mode });
}

function bindTldrModeSettings() {
  const radios = document.querySelectorAll('input[name="tldrMode"]');
  radios.forEach((radio) => {
    radio.addEventListener("change", async (event) => {
      const value = normalizeTldrMode(event?.target?.value);
      await chrome.storage.local.set({ [TLDR_MODE_KEY]: value });
    });
  });
}

function formatContextSummary(item) {
  const riskLabel = String(item?.risk_label || "").toLowerCase();
  const riskPercent = Math.round((item?.risk_score || 0) * 100);
  const hasAiAudit = typeof item?.ai_confidence === "number";
  const aiDetected = Boolean(item?.ai_detected);
  const aiLabel = hasAiAudit ? (aiDetected ? "Detected" : "Clear") : "Not checked";

  let context = "Fine";
  if (hasAiAudit && aiDetected) {
    context = "AI";
  } else if (riskLabel.includes("attention")) {
    context = "Check";
  } else if (riskLabel.includes("mixed")) {
    context = "Caution";
  } else if (riskLabel.includes("high")) {
    context = "Junk";
  } else if (riskLabel.includes("mostly credible") || riskLabel.includes("low")) {
    context = "Good";
  }

  return {
    context,
    details: `Risk: ${item.risk_label} (${riskPercent}%) | AI: ${aiLabel}`,
  };
}

function renderHistory(container, host, items) {
  if (!items.length) {
    container.innerHTML = `<div class="muted">No saved analyses for <strong>${host || "this page"}</strong> yet.</div>`;
    return;
  }

  const cards = items
    .map((item) => {
      const summary = formatContextSummary(item);
      return `
        <a class="history-item history-item-link" href="${item.reportUrl}" target="_blank" rel="noreferrer">
          <strong>${summary.context}</strong>
          <div class="muted">${summary.details}</div>
        </a>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="muted">Last ${items.length} analyses for <strong>${host}</strong>:</div>
    ${cards}
  `;
}

function loadSiteHistory(resultEl, url) {
  chrome.runtime.sendMessage({ type: "get-site-history", url }, (response) => {
    if (chrome.runtime.lastError) {
      resultEl.textContent = `TrustLens error: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!response?.ok) {
      resultEl.textContent = `TrustLens error: ${response?.error || "Unknown error"}`;
      return;
    }
    renderHistory(resultEl, response.data.host || hostFromUrl(url), response.data.items || []);
  });
}

async function init() {
  const resultEl = document.getElementById("result");
  const openDashboardBtn = document.getElementById("openDashboard");
  const activeTab = await getActiveTab();
  const activeUrl = activeTab?.url || "";

  openDashboardBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "http://localhost:5173/" });
  });

  await loadTldrMode();
  bindTldrModeSettings();
  loadSiteHistory(resultEl, activeUrl);
}

init();
