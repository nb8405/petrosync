const crypto = require("crypto");
const securityConfig = require("./securityConfig");
const appConfig = require("../config/appConfig");
const logger = require("../services/loggerService");
const { parseCookies } = require("../utils/cookies");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const requestBuckets = new Map();

const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  if (securityConfig.contentSecurityPolicy) {
    res.setHeader("Content-Security-Policy", securityConfig.contentSecurityPolicy);
  }

  if (process.env.NODE_ENV === "production" && req.secure) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
};

const memoryRateLimiter = (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.connection?.remoteAddress || "unknown";
  const bucket = requestBuckets.get(key) || {
    count: 0,
    resetAt: now + securityConfig.rateLimit.windowMs,
  };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + securityConfig.rateLimit.windowMs;
  }

  bucket.count += 1;
  requestBuckets.set(key, bucket);

  if (bucket.count > securityConfig.rateLimit.maxRequests) {
    logger.security("Rate limit exceeded.", {
      requestContext: req.context,
      mode: "memory",
      key,
      count: bucket.count,
      maxRequests: securityConfig.rateLimit.maxRequests,
      windowMs: securityConfig.rateLimit.windowMs,
    });

    return res.status(429).json({
      ok: false,
      message: "Too many requests. Please try again later.",
    });
  }

  return next();
};

const gatewayRateLimiter = (req, res, next) => next();

const redisRateLimiter = (req, res, next) => {
  if (!process.env.REDIS_URL) {
    return res.status(503).json({
      ok: false,
      message: "Redis rate limiting is configured but REDIS_URL is missing.",
    });
  }

  return memoryRateLimiter(req, res, next);
};

const rateLimiter = (req, res, next) => {
  const mode = securityConfig.rateLimit.mode;

  if (mode === "gateway") {
    return gatewayRateLimiter(req, res, next);
  }

  if (mode === "redis") {
    return redisRateLimiter(req, res, next);
  }

  if (mode !== "memory") {
    logger.security("Invalid rate limit configuration.", {
      requestContext: req.context,
      mode,
    });

    return res.status(503).json({
      ok: false,
      message: "Rate limiting is not configured correctly.",
    });
  }

  return memoryRateLimiter(req, res, next);
};

const csrfProtection = (req, res, next) => {
  if (!appConfig.auth.csrfEnabled) {
    return next();
  }

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const cookies = parseCookies(req.get("cookie"));

  if (!cookies.ppm_access && !cookies.ppm_refresh) {
    return next();
  }

  const headerToken = req.get("x-csrf-token");
  const cookieToken = cookies.ppm_csrf;

  if (headerToken && cookieToken) {
    const headerBuffer = Buffer.from(String(headerToken));
    const cookieBuffer = Buffer.from(String(cookieToken));

    if (
      headerBuffer.length === cookieBuffer.length &&
      crypto.timingSafeEqual(headerBuffer, cookieBuffer)
    ) {
      return next();
    }
  }

  logger.security("CSRF validation failed.", {
    requestContext: req.context,
    hasHeaderToken: Boolean(headerToken),
    hasCookieToken: Boolean(cookieToken),
  });

  return res.status(403).json({
    ok: false,
    message: "CSRF validation failed.",
  });
};

const corsOptions = {
  origin(origin, callback) {
    if (!origin || securityConfig.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    logger.security("CORS origin rejected.", {
      origin,
    });
    callback(new Error("Origin is not allowed by CORS."));
  },
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const requireMetricsAccess = (req, res, next) => {
  const configuredToken = process.env.METRICS_TOKEN || "";
  const headerToken = req.get("x-metrics-token") || "";
  const authHeader = req.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (
    configuredToken &&
    (safeEqual(headerToken, configuredToken) || safeEqual(bearerToken, configuredToken))
  ) {
    return next();
  }

  return requireAuth(req, res, (authError) => {
    if (authError) {
      return next(authError);
    }

    return requirePermission("health:read")(req, res, next);
  });
};

module.exports = {
  securityHeaders,
  rateLimiter,
  csrfProtection,
  corsOptions,
  requireMetricsAccess,
};
