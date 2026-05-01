export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function getSourceGroup(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      const filename = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "local file");
      return `local file: ${filename}`;
    }
    return parsed.hostname.replace(/^www\./, "").toLowerCase() || "unknown";
  } catch {
    return url || "unknown";
  }
}

export function riskTone(label = ""): "high" | "medium" | "low" {
  const value = label.toLowerCase();
  if (value.includes("high")) return "high";
  if (value.includes("low")) return "low";
  return "medium";
}

export function aiAuditLabel(aiDetected: boolean, aiConfidence?: number | null): string {
  if (typeof aiConfidence !== "number") return "Not checked";
  return aiDetected ? "Detected" : "Clear";
}

export function aiAuditSummary(aiDetected: boolean, aiConfidence?: number | null): string {
  const label = aiAuditLabel(aiDetected, aiConfidence);
  if (typeof aiConfidence !== "number") return label;
  return `${label} (${Math.round(aiConfidence * 100)}%)`;
}

type SignalTone = "low" | "medium" | "high" | "neutral";

type InterpretedSignal = {
  title: string;
  percent: number;
  badge: string;
  tone: SignalTone;
  meaning: string;
};

function clampPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(value, 1)) * 100);
}

function riskBand(value: number): "low" | "medium" | "high" {
  if (value < 0.3) return "low";
  if (value <= 0.6) return "medium";
  return "high";
}

function confidenceBand(value: number): "uncertain" | "moderate" | "strong" {
  if (value < 0.5) return "uncertain";
  if (value <= 0.75) return "moderate";
  return "strong";
}

export function shouldShowSignal(signal: { name: string; value: number }): boolean {
  const normalizedName = signal.name.toLowerCase();
  const isZeroRiskSignal =
    signal.value <= 0 &&
    (normalizedName === "emotional intensity" ||
      normalizedName === "source weakness" ||
      normalizedName === "generic ai-like style");

  return !isZeroRiskSignal;
}

export function interpretSignal(signal: { name: string; value: number; note: string }): InterpretedSignal {
  const percent = clampPercent(signal.value);
  const normalizedName = signal.name.toLowerCase();

  if (normalizedName === "emotional intensity") {
    const band = riskBand(signal.value);
    const copy = {
      low: {
        badge: "Low concern",
        meaning: "Little emotional or sensational wording detected.",
      },
      medium: {
        badge: "Medium concern",
        meaning: "Some emotional or sensational wording detected.",
      },
      high: {
        badge: "High concern",
        meaning: "Heavy emotional or sensational wording detected.",
      },
    }[band];

    return { title: signal.name, percent, tone: band, ...copy };
  }

  if (normalizedName === "source weakness") {
    const band = riskBand(signal.value);
    const copy = {
      low: {
        badge: "Low concern",
        meaning: "Clear source or evidence cues found.",
      },
      medium: {
        badge: "Medium concern",
        meaning: "Some source or evidence cues are missing or unclear.",
      },
      high: {
        badge: "High concern",
        meaning: "Few clear source or evidence cues found.",
      },
    }[band];

    return { title: signal.name, percent, tone: band, ...copy };
  }

  if (normalizedName === "generic ai-like style") {
    const band = riskBand(signal.value);
    const copy = {
      low: {
        badge: "Low concern",
        meaning: "No strong generic or AI-like phrasing pattern detected.",
      },
      medium: {
        badge: "Medium concern",
        meaning: "Some generic or formulaic phrasing pattern detected.",
      },
      high: {
        badge: "High concern",
        meaning: "Strong generic, repetitive, or AI-like phrasing pattern detected.",
      },
    }[band];

    return { title: "Generic AI-like Style", percent, tone: band, ...copy };
  }

  if (normalizedName === "label confidence") {
    const band = confidenceBand(signal.value);
    const copy = {
      uncertain: {
        badge: "Uncertain model confidence",
        tone: "neutral" as SignalTone,
        meaning: "The signal checks were not very consistent.",
      },
      moderate: {
        badge: "Moderate model confidence",
        tone: "neutral" as SignalTone,
        meaning: "The signal checks were partly consistent.",
      },
      strong: {
        badge: "Strong model confidence",
        tone: "neutral" as SignalTone,
        meaning: "The signal checks were mostly consistent.",
      },
    }[band];

    return { title: signal.name, percent, ...copy };
  }

  return {
    title: signal.name,
    percent,
    badge: "Signal score",
    tone: "neutral",
    meaning: signal.note,
  };
}
