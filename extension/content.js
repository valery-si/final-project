let actionMenu = null;
let infoBubble = null;
let tldrModalBackdrop = null;
const TLDR_MODE_KEY = "tldr_mode";

function normalizeTldrMode(value) {
  if (value === "openai" || value === "local-neural") {
    return value;
  }
  return "local-neural";
}

function tldrModeLabel(mode) {
  if (mode === "openai") return "ChatGPT";
  return "Local Model";
}

function riskContextLabel(riskLabel) {
  const normalized = String(riskLabel || "").toLowerCase();
  if (normalized.includes("attention")) return "Check";
  if (normalized.includes("mixed")) return "Caution";
  if (normalized.includes("high")) return "Junk";
  if (normalized.includes("mostly credible") || normalized.includes("low")) return "Good";
  return "Fine";
}

function formatAnalysisResult(data) {
  const riskPercent = Math.round((data?.risk_score || 0) * 100);
  const riskLabel = data?.risk_label || "Unknown";
  return `${riskContextLabel(riskLabel)}: ${riskLabel} (${riskPercent}%).`;
}

function getRuntime() {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime || !runtime.id || typeof runtime.sendMessage !== "function") {
    return null;
  }
  return runtime;
}

function removeActionMenu() {
  if (actionMenu) {
    actionMenu.remove();
    actionMenu = null;
  }
}

async function getConfiguredTldrMode() {
  try {
    const data = await chrome.storage.local.get([TLDR_MODE_KEY]);
    return normalizeTldrMode(data?.[TLDR_MODE_KEY]);
  } catch {
    return "local-neural";
  }
}

function showBubble(text) {
  if (infoBubble) {
    infoBubble.remove();
  }
  infoBubble = document.createElement("div");
  infoBubble.textContent = text;
  Object.assign(infoBubble.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    zIndex: "2147483647",
    background: "#0a344f",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    fontFamily: "Segoe UI, sans-serif",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
  });
  document.body.appendChild(infoBubble);
  setTimeout(() => infoBubble?.remove(), 4000);
}

function parseSummaryBullets(summary) {
  const lines = String(summary || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletPattern = /^([-*•]\s+|\d+[.)]\s+)/;
  const explicitBullets = lines
    .filter((line) => bulletPattern.test(line))
    .map((line) => line.replace(bulletPattern, "").trim())
    .filter(Boolean);

  if (explicitBullets.length >= 2) {
    return explicitBullets.slice(0, 6);
  }

  const sentences = String(summary || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [String(summary || "").trim()].filter(Boolean);
  }
  return sentences.slice(0, 5);
}

function ensureTldrModal() {
  if (tldrModalBackdrop && document.body.contains(tldrModalBackdrop)) {
    return;
  }

  tldrModalBackdrop = document.createElement("div");
  Object.assign(tldrModalBackdrop.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "rgba(8, 22, 34, 0.52)",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  });

  const modal = document.createElement("div");
  Object.assign(modal.style, {
    width: "min(620px, 96vw)",
    maxHeight: "82vh",
    overflow: "auto",
    borderRadius: "12px",
    border: "1px solid #b7cfe1",
    background: "#ffffff",
    color: "#173042",
    boxShadow: "0 20px 44px rgba(7, 22, 34, 0.34)",
    padding: "14px",
    fontFamily: "Segoe UI, sans-serif",
    display: "grid",
    gap: "10px",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  });

  const title = document.createElement("h3");
  title.id = "safebrowse-tldr-title";
  title.textContent = "TL;DR";
  Object.assign(title.style, {
    margin: "0",
    fontSize: "20px",
  });

  const modeChip = document.createElement("span");
  modeChip.id = "safebrowse-tldr-mode";
  Object.assign(modeChip.style, {
    borderRadius: "999px",
    background: "#eaf3fa",
    color: "#184e70",
    border: "1px solid #c9dceb",
    padding: "4px 10px",
    fontSize: "12px",
    fontWeight: "700",
  });

  header.appendChild(title);
  header.appendChild(modeChip);

  const meta = document.createElement("p");
  meta.id = "safebrowse-tldr-meta";
  Object.assign(meta.style, {
    margin: "0",
    color: "#5a7080",
    fontSize: "12px",
  });

  const bulletsWrap = document.createElement("div");
  Object.assign(bulletsWrap.style, {
    border: "1px solid #d5e3ee",
    borderRadius: "10px",
    background: "#f7fbff",
    padding: "10px 12px",
  });

  const bulletsTitle = document.createElement("p");
  bulletsTitle.textContent = "Summary";
  Object.assign(bulletsTitle.style, {
    margin: "0 0 8px",
    color: "#26475f",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.3px",
    textTransform: "uppercase",
  });

  const list = document.createElement("ul");
  list.id = "safebrowse-tldr-list";
  Object.assign(list.style, {
    margin: "0",
    paddingLeft: "18px",
    display: "grid",
    gap: "6px",
    color: "#173042",
    lineHeight: "1.4",
    fontSize: "14px",
  });

  bulletsWrap.appendChild(bulletsTitle);
  bulletsWrap.appendChild(list);

  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    justifyContent: "flex-end",
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  Object.assign(closeBtn.style, {
    background: "#f3f8fd",
    color: "#1f4c69",
    border: "1px solid #c1d6e6",
    borderRadius: "8px",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: "13px",
  });

  closeBtn.addEventListener("click", () => {
    tldrModalBackdrop.style.display = "none";
  });

  actions.appendChild(closeBtn);

  modal.appendChild(header);
  modal.appendChild(meta);
  modal.appendChild(bulletsWrap);
  modal.appendChild(actions);
  tldrModalBackdrop.appendChild(modal);
  document.body.appendChild(tldrModalBackdrop);

  tldrModalBackdrop.addEventListener("click", (event) => {
    if (event.target === tldrModalBackdrop) {
      tldrModalBackdrop.style.display = "none";
    }
  });
}

function showTldrModal(summary, mode, sourceUrl) {
  ensureTldrModal();
  const title = document.getElementById("safebrowse-tldr-title");
  const modeChip = document.getElementById("safebrowse-tldr-mode");
  const meta = document.getElementById("safebrowse-tldr-meta");
  const list = document.getElementById("safebrowse-tldr-list");

  title.textContent = "TL;DR";
  modeChip.textContent = tldrModeLabel(mode);
  const host = sourceUrl || "Unknown source";
  meta.textContent = `Source: ${host}`;

  list.innerHTML = "";
  const bullets = parseSummaryBullets(summary);
  if (!bullets.length) {
    const item = document.createElement("li");
    item.textContent = "No TL;DR output generated.";
    list.appendChild(item);
  } else {
    bullets.forEach((bullet) => {
      const item = document.createElement("li");
      item.textContent = bullet;
      list.appendChild(item);
    });
  }

  tldrModalBackdrop.style.display = "flex";
}

function showTldrErrorModal(message, mode, sourceUrl) {
  ensureTldrModal();
  const title = document.getElementById("safebrowse-tldr-title");
  const modeChip = document.getElementById("safebrowse-tldr-mode");
  const meta = document.getElementById("safebrowse-tldr-meta");
  const list = document.getElementById("safebrowse-tldr-list");

  title.textContent = "TL;DR failed";
  modeChip.textContent = tldrModeLabel(mode);
  meta.textContent = `Source: ${sourceUrl || "Unknown source"}`;
  list.innerHTML = "";

  const item = document.createElement("li");
  item.textContent = message || "Unable to generate TL;DR.";
  item.style.color = "#9b1c1c";
  list.appendChild(item);

  tldrModalBackdrop.style.display = "flex";
}

function createActionMenu(x, y, selectedText) {
  removeActionMenu();
  actionMenu = document.createElement("div");
  Object.assign(actionMenu.style, {
    position: "absolute",
    top: `${window.scrollY + y + 8}px`,
    left: `${window.scrollX + x}px`,
    zIndex: "2147483647",
    display: "flex",
    gap: "8px",
    background: "#f3f8fc",
    border: "1px solid #b9d0e1",
    borderRadius: "8px",
    padding: "6px",
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.2)",
  });
  document.body.appendChild(actionMenu);

  const evaluateButton = document.createElement("button");
  evaluateButton.textContent = "Analyze Text";
  Object.assign(evaluateButton.style, {
    background: "#e9f2f9",
    color: "#184967",
    border: "1px solid #b5cade",
    borderRadius: "6px",
    padding: "7px 10px",
    fontSize: "12px",
    fontFamily: "Segoe UI, sans-serif",
    cursor: "pointer",
  });
  actionMenu.appendChild(evaluateButton);

  const tldrButton = document.createElement("button");
  tldrButton.textContent = "TL;DR";
  Object.assign(tldrButton.style, {
    background: "#e9f2f9",
    color: "#184967",
    border: "1px solid #b5cade",
    borderRadius: "6px",
    padding: "7px 10px",
    fontSize: "12px",
    fontFamily: "Segoe UI, sans-serif",
    cursor: "pointer",
  });
  actionMenu.appendChild(tldrButton);

  evaluateButton.addEventListener("click", () => {
    const runtime = getRuntime();
    if (!runtime) {
      showBubble("TrustLens extension context unavailable. Refresh this tab and try again.");
      removeActionMenu();
      return;
    }

    evaluateButton.disabled = true;
    tldrButton.disabled = true;
    evaluateButton.textContent = "Evaluating...";
    try {
      runtime.sendMessage?.(
        {
          type: "analyze-selection",
          text: selectedText,
          url: location.href,
        },
        (response) => {
          const latestRuntime = getRuntime();
          if (latestRuntime?.lastError) {
            removeActionMenu();
            showBubble(`TrustLens error: ${latestRuntime.lastError.message}`);
            return;
          }

          removeActionMenu();
          if (!response?.ok) {
            showBubble(`TrustLens error: ${response?.error || "Unknown error"}`);
            return;
          }
          showBubble(formatAnalysisResult(response.data));
        },
      );
    } catch (error) {
      removeActionMenu();
      showBubble(`TrustLens error: ${error?.message || "Failed to send extension message"}`);
    }
  });

  tldrButton.addEventListener("click", async () => {
    const runtime = getRuntime();
    if (!runtime) {
      showBubble("TrustLens extension context unavailable. Refresh this tab and try again.");
      removeActionMenu();
      return;
    }

    const mode = await getConfiguredTldrMode();
    evaluateButton.disabled = true;
    tldrButton.disabled = true;
    tldrButton.textContent = `TL;DR ${tldrModeLabel(mode)}...`;

    try {
      runtime.sendMessage?.(
        {
          type: "summarize-selection",
          text: selectedText,
          url: location.href,
          mode,
        },
        (response) => {
          const latestRuntime = getRuntime();
          if (latestRuntime?.lastError) {
            removeActionMenu();
            showBubble(`TrustLens error: ${latestRuntime.lastError.message}`);
            return;
          }

          removeActionMenu();
          if (!response?.ok) {
            showTldrErrorModal(response?.error || "Unknown error", mode, location.href);
            return;
          }

          const summary = String(response?.data?.summary || "").trim();
          showTldrModal(summary, mode, response?.data?.source_url || location.href);
        },
      );
    } catch (error) {
      removeActionMenu();
      showTldrErrorModal(error?.message || "Failed to send extension message", mode, location.href);
    }
  });
}

document.addEventListener("mouseup", (event) => {
  if (actionMenu && (event.target === actionMenu || actionMenu.contains(event.target))) {
    return;
  }

  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : "";

  if (selectedText.length < 20) {
    removeActionMenu();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  createActionMenu(rect.left, rect.bottom, selectedText.slice(0, 5000));
});

document.addEventListener("mousedown", (event) => {
  if (actionMenu && !actionMenu.contains(event.target)) {
    removeActionMenu();
  }
});
