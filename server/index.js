require("./config/loadEnv");

const express = require("express");
const cors = require("cors");
const reportsRouter = require("./routes/reports");
const dashboardRouter = require("./routes/dashboard");
const operationsRouter = require("./routes/operations");
const backupsRouter = require("./routes/backups");
const forecourtRouter = require("./routes/forecourt");
const tanksRouter = require("./routes/tanks");
const tankReadingsRouter = require("./routes/tankReadings");
const tankAlertsRouter = require("./routes/tankAlerts");
const dsrRouter = require("./routes/dsr");
const integrationsRouter = require("./routes/integrations");
const settingsRouter = require("./routes/settings");
const authRouter = require("./routes/auth");
const automationService = require("./services/automationService");
const logger = require("./services/loggerService");
const { requestContext } = require("./middleware/requestContext");
const healthService = require("./services/healthService");
const lifecycleService = require("./services/lifecycleService");
const metricsService = require("./services/metricsService");
const { validateProductionConfig } = require("./config/productionConfig");
const {
  securityHeaders,
  rateLimiter,
  csrfProtection,
  corsOptions,
  requireMetricsAccess,
} = require("./security/securityMiddleware");
const securityConfig = require("./security/securityConfig");

const app = express();
const productionConfig = validateProductionConfig();

const parseTrustProxy = () => {
  if (process.env.TRUST_PROXY === undefined) {
    return process.env.NODE_ENV === "production"
      ? "loopback, linklocal, uniquelocal"
      : false;
  }

  const value = String(process.env.TRUST_PROXY).trim();
  const normalized = value.toLowerCase();

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return value;
};

if (!productionConfig.ok) {
  throw new Error(
    `Production configuration is not secure: ${productionConfig.errors.join("; ")}`
  );
}

app.set("trust proxy", parseTrustProxy());

app.use(requestContext);
app.use(lifecycleService.trackRequest);
app.use(securityHeaders);
app.use(rateLimiter);
app.use(cors(corsOptions));
app.use(express.json({ limit: securityConfig.jsonLimit }));
app.use(csrfProtection);

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Petrol Pump Backend Running",
  });
});

app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    service: "petrosync-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/liveness", (req, res) => {
  res.json(healthService.liveness());
});

app.get("/readiness", async (req, res, next) => {
  try {
    const readiness = await healthService.readiness();
    res.status(readiness.ok ? 200 : 503).json(readiness);
  } catch (error) {
    next(error);
  }
});

app.get("/metrics", requireMetricsAccess, async (req, res, next) => {
  try {
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.send(await metricsService.prometheus());
  } catch (error) {
    next(error);
  }
});

app.use("/api/reports", reportsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/backups", backupsRouter);
app.use("/api/forecourt", forecourtRouter);
app.use("/api/tanks", tanksRouter);
app.use("/api/tank-readings", tankReadingsRouter);
app.use("/api/tank-alerts", tankAlertsRouter);
app.use("/api/dsr", dsrRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/auth", authRouter);

app.use((error, req, res, next) => {
  logger.error("Unhandled request error.", {
    module: "http",
    requestContext: req.context,
    message: error.message,
    error,
    path: req.path,
    method: req.method,
  });

  if (error.message === "Origin is not allowed by CORS.") {
    logger.security("Blocked request origin.", {
      requestContext: req.context,
      origin: req.get("origin") || null,
    });

    return res.status(403).json({
      ok: false,
      message: "Request origin is not allowed.",
    });
  }

  if (error.code) {
    return res.status(503).json({
      ok: false,
      message: "Database operation failed.",
    });
  }

  return res.status(500).json({
    ok: false,
    message: "Unexpected server error.",
  });
});

const port = Number(process.env.PORT || 5000);
const host =
  process.env.HOST ||
  process.env.BIND_HOST ||
  (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

const server = app.listen(port, host, () => {
  logger.info("Server started.", {
    host,
    port,
    processId: process.pid,
    cwd: process.cwd(),
  });
  automationService.startAutomaticBackup();
});

lifecycleService.registerShutdownHandlers(server);
