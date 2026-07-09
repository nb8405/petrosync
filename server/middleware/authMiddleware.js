const authService = require("../services/authService");
const { parseCookies } = require("../utils/cookies");
const { attachUserToContext } = require("./requestContext");

const tokenFromRequest = (req) => {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme === "Bearer" && token) {
    return token;
  }

  return parseCookies(req.get("cookie")).ppm_access || null;
};

const optionalAuth = async (req, res, next) => {
  const token = tokenFromRequest(req);

  if (!token) {
    return next();
  }

  try {
    req.user = await authService.verifyToken(token);
    attachUserToContext(req, req.user);
  } catch {
    req.user = null;
  }

  return next();
};

const requireAuth = async (req, res, next) => {
  const token = tokenFromRequest(req);

  if (!token) {
    return res.status(401).json({
      ok: false,
      message: "Authentication required.",
    });
  }

  try {
    req.authToken = token;
    req.user = await authService.verifyToken(token);
    attachUserToContext(req, req.user);
    return next();
  } catch (error) {
    return res.status(error.status || 401).json({
      ok: false,
      message: "Invalid or expired session.",
    });
  }
};

module.exports = {
  optionalAuth,
  requireAuth,
};
