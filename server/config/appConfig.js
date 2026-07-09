const path = require("path");

const rootDir = path.resolve(__dirname, "..");

const appConfig = {
  app: {
    name: process.env.APP_NAME || "Petrol Pump Management",
    pumpName: process.env.PUMP_NAME || "MAYA FILLING CENTRE [KSK]",
    timezone: process.env.APP_TIMEZONE || "Asia/Kolkata",
  },
  reports: {
    defaultProduct: "overall",
    maxRangeDays: Number(process.env.REPORT_MAX_RANGE_DAYS || 366),
  },
  print: {
    referencePrefix: process.env.PRINT_REFERENCE_PREFIX || "PRN",
  },
  export: {
    referencePrefix: process.env.EXPORT_REFERENCE_PREFIX || "EXP",
    directory:
      process.env.EXPORT_DIR || path.join(rootDir, "exports"),
  },
  backup: {
    directory:
      process.env.BACKUP_DIR || path.join(rootDir, "backups"),
    signingSecret: process.env.BACKUP_SIGNING_SECRET || "",
    encryptionSecret:
      process.env.BACKUP_ENCRYPTION_SECRET ||
      process.env.BACKUP_SIGNING_SECRET ||
      "",
    encryptionEnabled:
      String(process.env.BACKUP_ENCRYPTION_ENABLED || "true").toLowerCase() !==
      "false",
    automaticEnabled:
      String(process.env.AUTO_BACKUP_ENABLED || "false").toLowerCase() ===
      "true",
  },
  health: {
    internetCheckHost: process.env.HEALTH_INTERNET_HOST || "1.1.1.1",
    internetCheckPort: Number(process.env.HEALTH_INTERNET_PORT || 53),
    internetTimeoutMs: Number(process.env.HEALTH_INTERNET_TIMEOUT_MS || 1500),
    nginxHealthUrl: process.env.NGINX_HEALTH_URL || "",
    atosHealthUrl: process.env.ATOS_HEALTH_URL || "",
    printerHealthMode: process.env.PRINTER_HEALTH_MODE || "placeholder",
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || "",
    developmentJwtSecret:
      "development-jwt-secret-change-me-only-local-32",
    jwtIssuer: process.env.JWT_ISSUER || "petrol-pump-management",
    jwtAudience: process.env.JWT_AUDIENCE || "petrosync-api",
    jwtClockToleranceSeconds: Number(process.env.JWT_CLOCK_TOLERANCE_SECONDS || 30),
    jwtExpiresInSeconds: Number(
      process.env.JWT_ACCESS_EXPIRES_SECONDS ||
        process.env.JWT_EXPIRES_SECONDS ||
        15 * 60
    ),
    refreshExpiresInSeconds: Number(
      process.env.JWT_REFRESH_EXPIRES_SECONDS || 8 * 60 * 60
    ),
    cookieEnabled:
      String(process.env.AUTH_COOKIE_ENABLED || "false").toLowerCase() ===
      "true",
    cookieSecure:
      String(
        process.env.AUTH_COOKIE_SECURE ||
          (process.env.NODE_ENV === "production" ? "true" : "false")
      ).toLowerCase() === "true",
    csrfEnabled:
      String(process.env.CSRF_ENABLED || "true").toLowerCase() === "true",
  },
  logging: {
    directory: process.env.LOG_DIR || path.join(rootDir, "logs"),
    maxBytes: Number(process.env.LOG_MAX_BYTES || 10 * 1024 * 1024),
    maxFiles: Number(process.env.LOG_MAX_FILES || 10),
    compressArchives:
      String(process.env.LOG_COMPRESS_ARCHIVES || "true").toLowerCase() !==
      "false",
    accessEnabled:
      String(process.env.LOG_ACCESS_ENABLED || "true").toLowerCase() !== "false",
  },
  numbering: {
    dsrPrefix: process.env.DSR_NUMBER_PREFIX || "DSR",
    reportPrefix: process.env.REPORT_NUMBER_PREFIX || "RPT",
    printPrefix: process.env.PRINT_NUMBER_PREFIX || "PRN",
    exportPrefix: process.env.EXPORT_NUMBER_PREFIX || "EXP",
  },
};

module.exports = appConfig;
