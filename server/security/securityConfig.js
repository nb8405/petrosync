const parseOrigins = (value) =>
  String(value || "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const positiveNumber = (value, fallback, minimum = 1) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : fallback;
};

module.exports = {
  allowedOrigins: parseOrigins(process.env.CORS_ORIGINS),
  contentSecurityPolicy:
    process.env.CONTENT_SECURITY_POLICY ||
    "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  jsonLimit: process.env.JSON_BODY_LIMIT || "25mb",
  rateLimit: {
    mode: String(process.env.RATE_LIMIT_MODE || "memory").toLowerCase(),
    windowMs: positiveNumber(
      process.env.RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
      1000
    ),
    maxRequests: positiveNumber(process.env.RATE_LIMIT_MAX, 300),
  },
};
