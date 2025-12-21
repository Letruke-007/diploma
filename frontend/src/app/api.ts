import {
  BaseQueryFn,
  FetchArgs,
  fetchBaseQuery,
  FetchBaseQueryError,
  createApi,
} from "@reduxjs/toolkit/query/react";

import { clearUser } from "../features/auth/authSlice";

/* ===================== CSRF helpers ===================== */

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()!.split(";").shift() ?? null;
  }
  return null;
}

function isUnsafeMethod(method?: string) {
  const m = (method ?? "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

/* ===================== baseQuery ===================== */

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api/",
  credentials: "include",
  prepareHeaders: (headers) => {
    const csrf = getCookie("csrftoken");
    if (csrf) {
      headers.set("X-CSRFToken", csrf);
    }
    return headers;
  },
});

async function ensureCsrfCookie(api: any, extraOptions: any) {
  await rawBaseQuery({ url: "auth/csrf/", method: "GET" }, api, extraOptions);
}

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const method =
    typeof args === "string" ? "GET" : (args.method ?? "GET").toString();

  if (isUnsafeMethod(method) && !getCookie("csrftoken")) {
    await ensureCsrfCookie(api, extraOptions);
  }

  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 403 && isUnsafeMethod(method)) {
    await ensureCsrfCookie(api, extraOptions);
    result = await rawBaseQuery(args, api, extraOptions);
  }

  if (result.error && result.error.status === 401) {
    api.dispatch(clearUser());
  }

  return result;
};

/* ===================== API ===================== */

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Me", "Files", "Folders", "Trash", "PublicLinks", "Usage"],
  endpoints: () => ({}),
});
