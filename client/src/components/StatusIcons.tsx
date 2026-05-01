import { Icon } from "./Icon";
import type { OpenAiKeyStatus, TldrStatus } from "../types";

export function ApiKeyIcon({ status }: { status: OpenAiKeyStatus["status"] }) {
  const configured = status === "configured";
  const title = configured ? "OpenAI key configured" : "OpenAI key not configured";

  return (
    <span className={`api-key-icon ${configured ? "api-key-icon-ok" : "api-key-icon-missing"}`} title={title}>
      <Icon name={configured ? "check" : "x"} />
    </span>
  );
}

export function StatusIcon({ status }: { status: TldrStatus["status"] }) {
  const isReady = status === "ready";
  const isFailed = status === "failed";

  return <Icon className="status-icon" name={isReady ? "check" : isFailed ? "x" : "clock"} />;
}
