/// <reference types="vite/client" />
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const API_BASE = `${API_ORIGIN}/api`;
export const TOKEN_KEY = "slt_token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_ORIGIN}${path}`;
}

export function buildQuery(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            const field = "loc" in item && Array.isArray(item.loc) ? item.loc.slice(1).join(".") : "";
            return field ? `${field}: ${(item as { msg: string }).msg}` : (item as { msg: string }).msg;
          }
          return String(item);
        })
        .join("; ");
    }
  }
  return fallback;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  formData?: FormData;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${API_BASE}${path}${buildQuery(options.params)}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event("slt:unauthorized"));
  }
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new ApiError(errorMessage(payload, `Request failed with status ${response.status}.`), response.status);
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return (await response.text()) as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions["params"]) => request<T>(path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<T>(path, { method: "POST", formData });
  },
};

export async function fetchBlob(path: string, params?: RequestOptions["params"]): Promise<Blob> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}${buildQuery(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("slt:unauthorized"));
    let message = "Unable to download file.";
    try {
      const payload = await response.json();
      message = errorMessage(payload, message);
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }
  return response.blob();
}

export async function downloadFile(path: string, filename: string, params?: RequestOptions["params"]) {
  const blob = await fetchBlob(path, params);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function fetchQrObjectUrl(path: string) {
  const blob = await fetchBlob(path);
  return URL.createObjectURL(blob);
}
