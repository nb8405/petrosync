const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const https = require("https");
const db = require("../db");
const appConfig = require("../config/appConfig");
const backupService = require("./backupService");
const packageJson = require("../package.json");

const status = (ok) => (ok ? "healthy" : "unhealthy");

const timed = async (fn) => {
  const start = process.hrtime.bigint();
  const result = await fn();
  const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
  return {
    ...result,
    latencyMs: Number(durationMs.toFixed(3)),
  };
};

const checkDatabase = async () =>
  timed(async () => {
    try {
      await db.query("SELECT 1");
      return {
        ok: true,
        status: "healthy",
        message: "PostgreSQL is reachable.",
      };
    } catch {
      return {
        ok: false,
        status: "unhealthy",
        message: "PostgreSQL health check failed.",
      };
    }
  });

const checkBackup = async () => {
  try {
    fs.mkdirSync(appConfig.backup.directory, { recursive: true });
    const backupStatus = await backupService.getBackupStatus();
    return {
      ok: true,
      status: "healthy",
      ...backupStatus,
    };
  } catch {
    return {
      ok: false,
      status: "unhealthy",
      message: "Backup health check failed.",
    };
  }
};

const diskUsage = (targetPath = appConfig.backup.directory) => {
  try {
    fs.mkdirSync(targetPath, { recursive: true });
    const resolved = path.resolve(targetPath);
    return {
      ok: true,
      status: "healthy",
      path: resolved,
      note:
        "Node.js runtime does not expose portable free disk space without native dependencies.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "unhealthy",
      path: targetPath,
      message: error.message,
    };
  }
};

const memoryUsage = () => {
  const processMemory = process.memoryUsage();
  const free = os.freemem();
  const total = os.totalmem();

  return {
    ok: true,
    status: "healthy",
    process: processMemory,
    system: {
      freeBytes: free,
      totalBytes: total,
      usedBytes: total - free,
      usedPercent: total ? Number((((total - free) / total) * 100).toFixed(2)) : null,
    },
  };
};

const cpuUsage = () => {
  const cpus = os.cpus() || [];
  const load = os.loadavg();

  return {
    ok: true,
    status: "healthy",
    cores: cpus.length,
    model: cpus[0]?.model || null,
    loadAverage: {
      oneMinute: load[0],
      fiveMinutes: load[1],
      fifteenMinutes: load[2],
    },
  };
};

const requestUrl = (url, timeoutMs = 1500) =>
  new Promise((resolve) => {
    if (!url) {
      resolve({
        ok: true,
        status: "not_configured",
        message: "Check is not configured.",
      });
      return;
    }

    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(
      parsed,
      {
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 500,
          status: res.statusCode >= 200 && res.statusCode < 500 ? "healthy" : "unhealthy",
          statusCode: res.statusCode,
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({
        ok: false,
        status: "unhealthy",
        message: "Health request timed out.",
      });
    });
    req.on("error", (error) => {
      resolve({
        ok: false,
        status: "unhealthy",
        message: error.message,
      });
    });
    req.end();
  });

const checkNginx = () =>
  requestUrl(appConfig.health.nginxHealthUrl, appConfig.health.internetTimeoutMs);

const checkAtos = () =>
  appConfig.health.atosHealthUrl
    ? requestUrl(appConfig.health.atosHealthUrl, appConfig.health.internetTimeoutMs)
    : Promise.resolve({
        ok: true,
        status: "placeholder",
        message: "ATOS connectivity check is not configured yet.",
      });

const checkPrinter = async () => ({
  ok: true,
  status: "placeholder",
  mode: appConfig.health.printerHealthMode,
  message: "Printer status provider is not configured yet.",
});

const checkInternet = () =>
  new Promise((resolve) => {
    const socket = net.createConnection({
      host: appConfig.health.internetCheckHost,
      port: appConfig.health.internetCheckPort,
      timeout: appConfig.health.internetTimeoutMs,
    });

    socket.on("connect", () => {
      socket.destroy();
      resolve({
        ok: true,
        status: "healthy",
        host: appConfig.health.internetCheckHost,
        port: appConfig.health.internetCheckPort,
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        ok: false,
        status: "offline",
        message: "Internet check timed out.",
      });
    });
    socket.on("error", () => {
      resolve({
        ok: false,
        status: "offline",
        message: "Internet is unavailable or blocked.",
      });
    });
  });

const applicationStatus = () => ({
  ok: true,
  status: "healthy",
  name: appConfig.app.name,
  version: packageJson.version,
  environment: process.env.NODE_ENV || "development",
  uptimeSeconds: Math.round(process.uptime()),
  processId: process.pid,
  nodeVersion: process.version,
  hostname: os.hostname(),
});

const readiness = async () => {
  const database = await checkDatabase();

  return {
    ok: database.ok,
    status: database.ok ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    checks: {
      database,
    },
  };
};

const liveness = () => ({
  ok: true,
  status: "alive",
  timestamp: new Date().toISOString(),
  uptimeSeconds: Math.round(process.uptime()),
});

const getSystemHealth = async () => {
  const [
    database,
    backup,
    nginx,
    atos,
    printer,
    internet,
  ] = await Promise.all([
    checkDatabase(),
    checkBackup(),
    checkNginx(),
    checkAtos(),
    checkPrinter(),
    checkInternet(),
  ]);
  const app = applicationStatus();
  const disk = diskUsage();
  const memory = memoryUsage();
  const cpu = cpuUsage();
  const requiredOk = app.ok && database.ok && backup.ok && disk.ok;

  return {
    ok: requiredOk,
    status: status(requiredOk),
    generatedAt: new Date().toISOString(),
    application: app,
    system: {
      uptimeSeconds: Math.round(os.uptime()),
      memory,
      cpu,
      disk,
    },
    services: {
      database,
      postgresql: database,
      nginx,
      atos,
      printer,
      internet,
      backup,
    },
  };
};

module.exports = {
  getSystemHealth,
  checkDatabase,
  checkBackup,
  checkNginx,
  checkAtos,
  checkPrinter,
  checkInternet,
  readiness,
  liveness,
};
