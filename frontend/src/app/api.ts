import { createApi, fetchBaseQuery, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";

/* helpers */
function getCookie(name: string): string | undefined {
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const c of cookies) {
    const eq = c.indexOf("=");
    if (eq === -1) continue;
    const k = c.slice(0, eq);
    const v = c.slice(eq + 1);
    if (k === name) return decodeURIComponent(v);
  }
  return undefined;
}
function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}
function isCSRFFailure(resp: Response, data?: unknown) {
  if (resp.status !== 403) return false;
  try {
    const detail =
      (data as any)?.detail ?? (typeof data === "string" ? data : undefined);
    return !!(detail && /csrf failed|referer checking failed/i.test(detail));
  } catch {
    return false;
  }
}

/* fetch wrapper with CSRF warmup & retry */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const csrf = getCookie("csrftoken");

  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (!headers.has("X-Requested-With")) headers.set("X-Requested-With", "XMLHttpRequest");
  if (csrf && !headers.has("X-CSRFToken")) headers.set("X-CSRFToken", csrf);

  const body = init.body as unknown;
  if (body && !isFormData(body)) {
    if (typeof body === "object" && !(body instanceof Blob) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
      init = { ...init, body: JSON.stringify(body) };
    }
  }

  const doFetch = () =>
    fetch(input, { ...init, headers, credentials: "include" });

  let resp = await doFetch();

  if (resp.status === 403) {
    let data: unknown;
    try {
      const ct = resp.headers.get("content-type") || "";
      data = ct.includes("application/json") ? await resp.clone().json() : await resp.clone().text();
    } catch {}
    if (isCSRFFailure(resp, data)) {
      try { await fetch("/api/auth/csrf", { credentials: "include" }); } catch {}
      const fresh = getCookie("csrftoken");
      if (fresh) headers.set("X-CSRFToken", fresh);
      resp = await doFetch();
    }
  }

  return resp;
}

/* initial auth warmup */
export async function initAuth() {
  try { await apiFetch("/api/auth/csrf", { method: "GET" }); } catch {}
  try { await apiFetch("/api/auth/me",   { method: "GET" }); } catch {}
}

/* RTK Query base with the same CSRF retry */
const rawBase = fetchBaseQuery({
  baseUrl: "/api",
  credentials: "include",
  prepareHeaders: (headers) => {
    const csrf = getCookie("csrftoken");
    if (csrf) headers.set("X-CSRFToken", csrf);
    headers.set("Accept", "application/json");
    headers.set("X-Requested-With", "XMLHttpRequest");
    return headers;
  },
});

const baseQuery: typeof rawBase = async (args, api, extraOptions) => {
  if (typeof args === "object" && args !== null) {
    const a = args as FetchArgs;
    const h = new Headers(a.headers || {});
    const body = a.body as unknown;
    if (body && !isFormData(body)) {
      if (typeof body === "object" && !(body instanceof Blob) && !h.has("Content-Type")) {
        h.set("Content-Type", "application/json");
        a.headers = h;
        a.body = JSON.stringify(body);
      }
    }
  }

  let result = await rawBase(args as any, api, extraOptions);

  const is403 =
    result.error && (result.error as FetchBaseQueryError).status === 403;

  let csrfFail = false;
  if (is403) {
    const err = result.error as FetchBaseQueryError;
    const data = (err.data as any) ?? {};
    const detail: string | undefined =
      data?.detail ?? (typeof data === "string" ? data : undefined);
    csrfFail = !!(detail && /csrf failed|referer checking failed/i.test(detail));
  }

  if (csrfFail) {
    try { await rawBase({ url: "/auth/csrf", method: "GET" }, api, extraOptions); } catch {}
    result = await rawBase(args as any, api, extraOptions);
  }

  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: ["Me", "Users", "Files"],
  endpoints: () => ({}),
});
