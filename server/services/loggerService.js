const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const appConfig = require("../config/appConfig");
const { redact } = require("../utils/redaction");

const logFiles = {
  access: "access.log",
  application: "application.log",
  error: "error.log",
  security: "security.log",
};

const severityRank = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const configuredLevel = String(process.env.LOG_LEVEL || "info").toLowerCase();
const minimumSeverity = severityRank[configuredLevel] || severityRank.info;

const ensureLogDir = () => {
  fs.mkdirSync(appConfig.logging.directory, { recursive: true });
};

const logPath = (channel) =>
  path.join(appConfig.logging.directory, logFiles[channel] || logFiles.application);

const gzipFile = (filePath) => {
  if (!appConfig.logging.compressArchives || !fs.existsSync(filePath)) {
    return;
  }

  const compressedPath = `${filePath}.gz`;
  fs.writeFileSync(compressedPath, zlib.gzipSync(fs.readFileSync(filePath)));
  fs.unlinkSync(filePath);
};

const cleanupArchives = (basePath) => {
  const dir = path.dirname(basePath);
  const baseName = path.basename(basePath);
  const maxFiles = Math.max(1, Number(appConfig.logging.maxFiles || 10));
  const archives = fs
    .readdirSync(dir)
    .filter((file) => file.startsWith(`${baseName}.`) && file !== baseName)
    .map((file) => ({
      file,
      fullPath: path.join(dir, file),
      mtimeMs: fs.statSync(path.join(dir, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  archives.slice(maxFiles).forEach((archive) => {
    try {
      fs.unlinkSync(archive.fullPath);
    } catch {
      // Log cleanup must never interrupt the application.
    }
  });
};

const rotateIfNeeded = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const maxBytes = Math.max(1024, Number(appConfig.logging.maxBytes || 10 * 1024 * 1024));
  const stats = fs.statSync(filePath);

  if (stats.size < maxBytes) {
    return;
  }

  const archivePath = `${filePath}.${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}`;

  fs.renameSync(filePath, archivePath);
  gzipFile(archivePath);
  cleanupArchives(filePath);
};

const safeError = (error) => {
  if (!error) {
    return null;
  }

  return redact({
    name: error.name,
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  });
};

const normalizeEntry = ({
  severity,
  message,
  module,
  channel,
  requestContext,
  details,
  error,
}) => ({
  timestamp: new Date().toISOString(),
  severity,
  level: severity,
  channel,
  module: module || details?.module || "application",
  message,
  requestId: requestContext?.requestId || details?.requestId || null,
  correlationId:
    requestContext?.correlationId || details?.correlationId || null,
  userId: requestContext?.userId || details?.userId || null,
  username: requestContext?.username || details?.username || null,
  role: requestContext?.role || details?.role || null,
  ipAddress: requestContext?.ipAddress || details?.ipAddress || null,
  machineName: requestContext?.machineName || details?.machineName || null,
  method: requestContext?.method || details?.method || null,
  endpoint: requestContext?.endpoint || details?.endpoint || null,
  statusCode: details?.statusCode || null,
  responseTimeMs: details?.responseTimeMs || null,
  details: redact(details || {}),
  error: safeError(error),
});

const write = ({
  severity = "info",
  message,
  module,
  channel = "application",
  requestContext,
  details = {},
  error,
}) => {
  const normalizedSeverity = String(severity || "info").toLowerCase();

  if ((severityRank[normalizedSeverity] || severityRank.info) < minimumSeverity) {
    return;
  }

  const targetChannel = logFiles[channel] ? channel : "application";
  const entry = normalizeEntry({
    severity: normalizedSeverity,
    message,
    module,
    channel: targetChannel,
    requestContext,
    details,
    error,
  });

  try {
    ensureLogDir();
    const filePath = logPath(targetChannel);
    rotateIfNeeded(filePath);
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Logging should never crash the application.
  }

  if (targetChannel === "error" || normalizedSeverity === "error" || normalizedSeverity === "fatal") {
    console.error(entry);
  } else if (normalizedSeverity === "warn") {
    console.warn(entry);
  } else if (process.env.NODE_ENV !== "test") {
    console.log(entry);
  }
};

const logAccess = (details) => {
  if (!appConfig.logging.accessEnabled) {
    return;
  }

  write({
    severity: details.statusCode >= 500 ? "error" : details.statusCode >= 400 ? "warn" : "info",
    channel: "access",
    module: "http",
    message: "HTTP request completed.",
    requestContext: details.requestContext,
    details,
  });
};

const flush = () => true;

module.exports = {
  write,
  flush,
  access: logAccess,
  security: (message, details = {}) =>
    write({
      severity: details.severity || "warn",
      channel: "security",
      module: details.module || "security",
      message,
      requestContext: details.requestContext,
      details,
      error: details.error,
    }),
  debug: (message, details = {}) =>
    write({ severity: "debug", message, details, requestContext: details.requestContext }),
  info: (message, details = {}) =>
    write({ severity: "info", message, details, requestContext: details.requestContext }),
  warn: (message, details = {}) =>
    write({ severity: "warn", message, details, requestContext: details.requestContext }),
  error: (message, details = {}) =>
    write({
      severity: "error",
      channel: "error",
      message,
      details,
      requestContext: details.requestContext,
      error: details.error,
    }),
  fatal: (message, details = {}) =>
    write({
      severity: "fatal",
      channel: "error",
      message,
      details,
      requestContext: details.requestContext,
      error: details.error,
    }),
};
