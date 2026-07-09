const crypto = require("crypto");
const os = require("os");
const { AsyncLocalStorage } = require("async_hooks");
const logger = require("../services/loggerService");
const metricsService = require("../services/metricsService");

const requestIdHeader = "x-request-id";
const correlationIdHeader = "x-correlation-id";
const requestStore = new AsyncLocalStorage();

const safeHeaderId = (value) => {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(text) ? text : null;
};

const createId = () => crypto.randomUUID();

const requestContext = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId = safeHeaderId(req.get(requestIdHeader)) || createId();
  const correlationId =
    safeHeaderId(req.get(correlationIdHeader)) || requestId;

  req.context = {
    requestId,
    correlationId,
    ipAddress:
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      null,
    machineName: os.hostname(),
    method: req.method,
    endpoint: req.originalUrl || req.url,
    startedAt: new Date().toISOString(),
  };

  metricsService.recordRequestStart();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("X-Correlation-ID", correlationId);

  res.on("finish", () => {
    const responseTimeMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.access({
      requestContext: {
        ...req.context,
        userId: req.user?.id || null,
        username: req.user?.username || null,
        role: req.user?.role || null,
      },
      statusCode: res.statusCode,
      responseTimeMs: Number(responseTimeMs.toFixed(3)),
      contentLength: Number(res.getHeader("content-length") || 0),
      userAgent: req.get("user-agent") || null,
      referrer: req.get("referer") || null,
    });
    metricsService.recordRequestEnd({
      method: req.method,
      endpoint: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTimeMs: Number(responseTimeMs.toFixed(3)),
    });
  });

  requestStore.run(req.context, next);
};

const requestMetadata = (req) => ({
  requestId: req.context?.requestId || null,
  correlationId: req.context?.correlationId || null,
  ipAddress:
    req.context?.ipAddress ||
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    null,
  machineName: req.context?.machineName || os.hostname(),
  method: req.method,
  endpoint: req.originalUrl || req.url,
});

const currentRequestContext = () => requestStore.getStore() || null;

const attachUserToContext = (req, user) => {
  if (!req.context || !user) {
    return;
  }

  req.context.userId = user.id || null;
  req.context.username = user.username || null;
  req.context.role = user.role || null;
};

module.exports = {
  requestContext,
  requestMetadata,
  currentRequestContext,
  attachUserToContext,
};
