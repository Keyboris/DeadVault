import { DMS_TOKEN_STORAGE_KEY, getApiBaseUrl } from "./config";
import type { ApiErrorPayload } from "./types";

export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

function sanitizeErrorMessage(raw: string | null | undefined): string {
  if (!raw) {
    return "Request failed";
  }

  const sanitized = raw
    .replace(/https?:\/\/\S+/gi, "request")
    .replace(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\/\S+/gi, "request")
    .replace(/\/api\/\S*/gi, "request")
    .trim();

  return sanitized || "Request failed";
}

function readToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
}

function clearTokenAndRedirectIfUnauthorized(status: number): void {
  if ((status !== 401 && status !== 403) || typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(DMS_TOKEN_STORAGE_KEY);
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = readToken();
  const baseUrl = getApiBaseUrl();
  const target = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(target, {
    ...options,
    headers,
  });

  if (!response.ok) {
    clearTokenAndRedirectIfUnauthorized(response.status);

    let message = sanitizeErrorMessage(response.statusText || "Request failed");
    try {
      const body = (await response.json()) as ApiErrorPayload;
      if (body?.error) {
        message = sanitizeErrorMessage(body.error);
      }
    } catch {
      // Ignore non-JSON error bodies.
    }

    throw new ApiClientError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
