const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

function getErrorMessage(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return `Request failed (${status})`;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(getErrorMessage(data, response.status));
  }

  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}
