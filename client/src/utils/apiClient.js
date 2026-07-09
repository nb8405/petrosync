import {
  getAuthToken,
  getAuthUser,
  getCsrfToken,
  getRefreshToken,
  notifyUnauthorized,
  setAuthSession,
} from "./authSession";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "/api";

const isMutatingMethod = (method) =>
  !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());

const refreshSession = async () => {
  const token = getRefreshToken();

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() } : {}),
    },
    body: JSON.stringify(token ? { refreshToken: token } : {}),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    return false;
  }

  setAuthSession({
    token: payload.token,
    refreshToken: payload.refreshToken,
    csrfToken: payload.csrfToken,
    user: payload.user || getAuthUser(),
  });

  return true;
};

const canRefreshAfterUnauthorized = (path) =>
  ![
    "/auth/login",
    "/auth/refresh",
    "/auth/register-pump",
    "/auth/setup-status",
  ].includes(path);

const createApiError = (message, response, payload) => {
  const error = new Error(message || "Backend request failed.");
  error.status = response?.status;
  error.payload = payload;
  return error;
};

const request = async (path, options = {}, retry = true) => {
  const method = options.method || "GET";
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      ...(isMutatingMethod(method) && getCsrfToken()
        ? { "X-CSRF-Token": getCsrfToken() }
        : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({
    ok: false,
    message: "Backend response was not valid JSON.",
  }));

  if (response.status === 401 && canRefreshAfterUnauthorized(path)) {
    if (retry && canRefreshAfterUnauthorized(path) && (await refreshSession())) {
      return request(path, options, false);
    }

    notifyUnauthorized();
  }

  if (!response.ok || payload.ok === false) {
    throw createApiError(payload.message, response, payload);
  }

  return payload;
};

const requestBlob = async (path, options = {}, retry = true) => {
  const method = options.method || "GET";
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      ...(isMutatingMethod(method) && getCsrfToken()
        ? { "X-CSRF-Token": getCsrfToken() }
        : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 401 && canRefreshAfterUnauthorized(path)) {
    if (retry && canRefreshAfterUnauthorized(path) && (await refreshSession())) {
      return requestBlob(path, options, false);
    }

    notifyUnauthorized();
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw createApiError(payload?.message || "Backend download failed.", response, payload);
  }

  return {
    blob: await response.blob(),
    fileName:
      response
        .headers
        .get("content-disposition")
        ?.match(/filename="?([^"]+)"?/)?.[1] || "backup.zip",
  };
};

export const apiClient = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  put: (path, body) =>
    request(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: (path, body) =>
    request(path, {
      method: "DELETE",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  blob: (path) => requestBlob(path),
};
