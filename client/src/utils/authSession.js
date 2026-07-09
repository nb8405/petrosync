let authToken = null;
let refreshToken = null;
let csrfToken = null;
let authUser = null;
let unauthorizedHandler = null;

const readCookie = (name) => {
  if (typeof document === "undefined") {
    return null;
  }

  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) || null
  );
};

export const setAuthSession = ({ token, refreshToken: nextRefreshToken, csrfToken: nextCsrfToken, user }) => {
  authToken = token || null;
  refreshToken = nextRefreshToken || null;
  csrfToken = nextCsrfToken || null;
  authUser = user || null;
};

export const clearAuthSession = () => {
  authToken = null;
  refreshToken = null;
  csrfToken = null;
  authUser = null;
};

export const getAuthToken = () => authToken;

export const getRefreshToken = () => refreshToken;

export const getCsrfToken = () => csrfToken || readCookie("ppm_csrf");

export const getAuthUser = () => authUser;

export const onUnauthorized = (handler) => {
  unauthorizedHandler = handler;
};

export const notifyUnauthorized = () => {
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
};
