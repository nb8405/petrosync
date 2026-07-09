const appConfig = require("./appConfig");

const weakValues = new Set(["", "postgres", "password", "secret", "changeme"]);
const allowedRateLimitModes = new Set(["memory", "redis", "gateway"]);

const requireValue = (name, value, errors) => {
  if (!value || weakValues.has(String(value).toLowerCase())) {
    errors.push(`${name} must be explicitly configured with a secure value.`);
  }
};

const hasWeakDatabaseUrlCredentials = (value) => {
  try {
    const parsed = new URL(value);
    return (
      weakValues.has(decodeURIComponent(parsed.username || "").toLowerCase()) ||
      weakValues.has(decodeURIComponent(parsed.password || "").toLowerCase())
    );
  } catch {
    return true;
  }
};

const validateProductionConfig = () => {
  if (process.env.NODE_ENV !== "production") {
    return {
      ok: true,
      errors: [],
    };
  }

  const errors = [];

  requireValue("JWT_SECRET", appConfig.auth.jwtSecret, errors);
  requireValue("BACKUP_SIGNING_SECRET", appConfig.backup.signingSecret, errors);
  if (appConfig.backup.encryptionEnabled) {
    requireValue("BACKUP_ENCRYPTION_SECRET", appConfig.backup.encryptionSecret, errors);
  }
  requireValue("CORS_ORIGINS", process.env.CORS_ORIGINS, errors);

  if (String(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).includes("*")) {
    errors.push("CORS_ORIGINS cannot include wildcard * in production.");
  }

  if (process.env.DATABASE_URL) {
    requireValue("DATABASE_URL", process.env.DATABASE_URL, errors);

    if (hasWeakDatabaseUrlCredentials(process.env.DATABASE_URL)) {
      errors.push("DATABASE_URL must not use default or weak database credentials.");
    }
  } else {
    requireValue("PGHOST", process.env.PGHOST, errors);
    requireValue("PGDATABASE", process.env.PGDATABASE, errors);
    requireValue("PGUSER", process.env.PGUSER, errors);
    requireValue("PGPASSWORD", process.env.PGPASSWORD, errors);
  }

  if (appConfig.auth.jwtSecret && appConfig.auth.jwtSecret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters.");
  }

  requireValue("JWT_ISSUER", process.env.JWT_ISSUER, errors);
  requireValue("JWT_AUDIENCE", process.env.JWT_AUDIENCE, errors);

  if (
    !Number.isFinite(appConfig.auth.jwtClockToleranceSeconds) ||
    appConfig.auth.jwtClockToleranceSeconds < 0 ||
    appConfig.auth.jwtClockToleranceSeconds > 300
  ) {
    errors.push("JWT_CLOCK_TOLERANCE_SECONDS must be between 0 and 300 seconds.");
  }

  if (
    !Number.isFinite(appConfig.auth.jwtExpiresInSeconds) ||
    appConfig.auth.jwtExpiresInSeconds < 5 * 60 ||
    appConfig.auth.jwtExpiresInSeconds > 60 * 60
  ) {
    errors.push("JWT_ACCESS_EXPIRES_SECONDS must be between 300 and 3600 seconds.");
  }

  if (
    !Number.isFinite(appConfig.auth.refreshExpiresInSeconds) ||
    appConfig.auth.refreshExpiresInSeconds <= appConfig.auth.jwtExpiresInSeconds ||
    appConfig.auth.refreshExpiresInSeconds > 30 * 24 * 60 * 60
  ) {
    errors.push("JWT_REFRESH_EXPIRES_SECONDS must be greater than access expiry and no more than 30 days.");
  }

  if (appConfig.auth.cookieEnabled && !appConfig.auth.cookieSecure) {
    errors.push("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_ENABLED is true in production.");
  }

  if (appConfig.auth.cookieEnabled && !appConfig.auth.csrfEnabled) {
    errors.push("CSRF_ENABLED must be true when AUTH_COOKIE_ENABLED is true in production.");
  }

  const rateLimitMode = String(process.env.RATE_LIMIT_MODE || "memory").toLowerCase();

  if (!allowedRateLimitModes.has(rateLimitMode)) {
    errors.push("RATE_LIMIT_MODE must be memory, redis, or gateway.");
  }

  if (rateLimitMode === "redis") {
    requireValue("REDIS_URL", process.env.REDIS_URL, errors);
  }

  const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
  const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 300);

  if (!Number.isFinite(rateLimitWindowMs) || rateLimitWindowMs < 1000) {
    errors.push("RATE_LIMIT_WINDOW_MS must be at least 1000.");
  }

  if (!Number.isFinite(rateLimitMax) || rateLimitMax < 1) {
    errors.push("RATE_LIMIT_MAX must be a positive number.");
  }

  if (rateLimitMode === "gateway" && process.env.TRUST_GATEWAY_RATE_LIMIT !== "true") {
    errors.push("TRUST_GATEWAY_RATE_LIMIT must be true when RATE_LIMIT_MODE is gateway.");
  }

  if (
    appConfig.backup.signingSecret &&
    appConfig.backup.signingSecret.length < 32
  ) {
    errors.push("BACKUP_SIGNING_SECRET must be at least 32 characters.");
  }

  if (
    appConfig.backup.encryptionEnabled &&
    appConfig.backup.encryptionSecret &&
    appConfig.backup.encryptionSecret.length < 32
  ) {
    errors.push("BACKUP_ENCRYPTION_SECRET must be at least 32 characters.");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateProductionConfig,
};
