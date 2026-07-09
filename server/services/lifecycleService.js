const db = require("../db");
const logger = require("./loggerService");
const automationService = require("./automationService");
const metricsService = require("./metricsService");

const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS || 30000);
let activeRequests = 0;
let shuttingDown = false;

const trackRequest = (req, res, next) => {
  if (shuttingDown && req.path !== "/liveness") {
    return res.status(503).json({
      ok: false,
      message: "Server is shutting down.",
    });
  }

  activeRequests += 1;
  res.on("finish", () => {
    activeRequests = Math.max(0, activeRequests - 1);
  });
  res.on("close", () => {
    activeRequests = Math.max(0, activeRequests - 1);
  });

  return next();
};

const waitForActiveRequests = () =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (activeRequests === 0 || Date.now() - startedAt >= shutdownTimeoutMs) {
        resolve();
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });

const closeServer = (server) =>
  new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => resolve());
  });

const shutdown = async ({ server, signal = "unknown", exit = true } = {}) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.warn("Graceful shutdown started.", {
    module: "lifecycle",
    signal,
    activeRequests,
    shutdownTimeoutMs,
  });

  const forceTimer = setTimeout(() => {
    logger.fatal("Graceful shutdown timed out.", {
      module: "lifecycle",
      signal,
      activeRequests,
    });

    if (exit) {
      process.exit(1);
    }
  }, shutdownTimeoutMs);
  forceTimer.unref?.();

  try {
    automationService.stopAutomaticBackup();
    await closeServer(server);
    await waitForActiveRequests();
    logger.info("Closing PostgreSQL pool.", { module: "lifecycle" });
    await db.pool.end();
    logger.flush();
    clearTimeout(forceTimer);
    logger.info("Graceful shutdown completed.", {
      module: "lifecycle",
      signal,
    });

    if (exit) {
      process.exit(0);
    }
  } catch (error) {
    clearTimeout(forceTimer);
    logger.fatal("Graceful shutdown failed.", {
      module: "lifecycle",
      signal,
      error,
    });

    if (exit) {
      process.exit(1);
    }
  }
};

const registerShutdownHandlers = (server) => {
  ["SIGINT", "SIGTERM", "SIGHUP"].forEach((signal) => {
    process.on(signal, () => shutdown({ server, signal }));
  });

  process.on("uncaughtException", (error) => {
    metricsService.recordUnhandledException();
    logger.fatal("Uncaught exception.", {
      module: "lifecycle",
      error,
    });
    shutdown({ server, signal: "uncaughtException" });
  });

  process.on("unhandledRejection", (reason) => {
    metricsService.recordUnhandledException();
    logger.fatal("Unhandled promise rejection.", {
      module: "lifecycle",
      error: reason instanceof Error ? reason : new Error(String(reason)),
    });
    shutdown({ server, signal: "unhandledRejection" });
  });
};

module.exports = {
  trackRequest,
  shutdown,
  registerShutdownHandlers,
  getState: () => ({
    shuttingDown,
    activeRequests,
  }),
};
