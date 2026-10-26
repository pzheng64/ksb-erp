export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : String(item)))
      .join(" ");
  }
  return "Request failed";
}

function parseJsonBody(text: string, status: number) {
  if (!text) return null;
  try {
    return JSON.parse(text) as { detail?: unknown; url?: string; filename?: string };
  } catch {
    const looksHtml = /^\s*</.test(text);
    const hint =
      looksHtml || status >= 500
        ? " Start the backend on port 8001 (or run start-offline.bat), then reload."
        : "";
    throw new ApiError(status, `The API returned an unexpected response.${hint}`);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = typeof window !== "undefined" ? localStorage.getItem("ksb_token") : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, "The API is not reachable. Start the backend on port 8001.");
  }
  const body = parseJsonBody(await response.text(), response.status);
  if (response.status === 401 && !path.startsWith("/auth/")) {
    localStorage.removeItem("ksb_token");
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, detailMessage(body?.detail) || response.statusText);
  }
  return body as T;
}

export async function uploadImage(file: File): Promise<{ url: string; filename: string }> {
  const headers = new Headers();
  const token = typeof window !== "undefined" ? localStorage.getItem("ksb_token") : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const form = new FormData();
  form.append("file", file);
  let response: Response;
  try {
    response = await fetch("/api/uploads/images", { method: "POST", headers, body: form, cache: "no-store" });
  } catch {
    throw new ApiError(0, "The API is not reachable. Start the backend on port 8001.");
  }
  const body = parseJsonBody(await response.text(), response.status);
  if (!response.ok) {
    throw new ApiError(response.status, detailMessage(body?.detail) || response.statusText);
  }
  if (!body?.url) throw new ApiError(response.status, "Upload failed");
  return { url: body.url, filename: body.filename || "" };
}
