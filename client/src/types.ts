export type ToastType = "info" | "success" | "error";

export type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

export type Signal = {
  name: string;
  value: number;
  note: string;
};

export type HistoryItem = {
  id: number;
  source_url: string;
  source_excerpt: string;
  risk_score: number;
  risk_label: string;
  ai_detected: boolean;
  ai_confidence: number | null;
  created_at: string;
};

export type Report = {
  id: number;
  source_url: string;
  source_text: string;
  risk_score: number;
  risk_label: string;
  ai_detected: boolean;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  signals: Signal[];
  created_at: string;
};

export type DomainReportHistoryItem = {
  id: number;
  source_url: string;
  risk_score: number;
  risk_label: string;
  ai_detected: boolean;
  signals: Signal[];
  created_at: string;
};

export type DomainReportHistoryResponse = {
  domain: string;
  limit: number;
  items: DomainReportHistoryItem[];
};

export type SettingsResponse = {
  has_api_key: boolean;
  api_key_preview: string;
};

export type CheckAIResponse = {
  analysis_id: number;
  ai_detected: boolean;
  ai_confidence: number;
  ai_reasoning: string;
};

export type TldrStatus = {
  mode: "local-neural";
  status: "idle" | "loading" | "ready" | "failed";
  model: string;
  device: "cpu" | "cuda" | null;
  error: string | null;
};

export type OpenAiKeyStatus = {
  status: "checking" | "configured" | "missing" | "failed";
  preview: string | null;
  error: string | null;
};

export type AddToast = (message: string, type?: ToastType) => void;
