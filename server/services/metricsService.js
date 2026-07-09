const os = require("os");
const { monitorEventLoopDelay } = require("perf_hooks");
const db = require("../db");

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

const state = {
  startedAt: Date.now(),
  totalRequests: 0,
  failedRequests: 0,
  slowRequests: 0,
  activeRequests: 0,
  totalLatencyMs: 0,
  maxLatencyMs: 0,
  requestsByMinute: new Map(),
  endpoints: new Map(),
  unhandledExceptions: 0,
};

const slowRequestThresholdMs = Number(process.env.SLOW_REQUEST_THRESHOLD_MS || 1000);

const minuteKey = (date = new Date()) => date.toISOString().slice(0, 16);

const pruneOldMinutes = () => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const key of state.requestsByMinute.keys()) {
    if (new Date(`${key}:00.000Z`).getTime() < cutoff) {
      state.requestsByMinute.delete(key);
    }
  }
};

const recordRequestStart = () => {
  state.activeRequests += 1;
};

const recordRequestEnd = ({ method, endpoint, statusCode, responseTimeMs }) => {
  state.activeRequests = Math.max(0, state.activeRequests - 1);
  state.totalRequests += 1;
  state.totalLatencyMs += responseTimeMs;
  state.maxLatencyMs = Math.max(state.maxLatencyMs, responseTimeMs);

  if (statusCode >= 400) {
    state.failedRequests += 1;
  }

  if (responseTimeMs >= slowRequestThresholdMs) {
    state.slowRequests += 1;
  }

  const key = `${method || "UNKNOWN"} ${String(endpoint || "").split("?")[0]}`;
  const current = state.endpoints.get(key) || {
    count: 0,
    failed: 0,
    latencyMs: 0,
    maxLatencyMs: 0,
  };
  current.count += 1;
  current.failed += statusCode >= 400 ? 1 : 0;
  current.latencyMs += responseTimeMs;
  current.maxLatencyMs = Math.max(current.maxLatencyMs, responseTimeMs);
  state.endpoints.set(key, current);

  const currentMinute = minuteKey();
  state.requestsByMinute.set(
    currentMinute,
    (state.requestsByMinute.get(currentMinute) || 0) + 1
  );
  pruneOldMinutes();
};

const recordUnhandledException = () => {
  state.unhandledExceptions += 1;
};

const databaseLatency = async () => {
  const started = process.hrtime.bigint();
  await db.query("SELECT 1");
  return Number((Number(process.hrtime.bigint() - started) / 1_000_000).toFixed(3));
};

const snapshot = async ({ includeDatabase = true } = {}) => {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const totalRequests = state.totalRequests || 0;
  const avgLatencyMs = totalRequests
    ? Number((state.totalLatencyMs / totalRequests).toFixed(3))
    : 0;
  let dbLatencyMs = null;

  if (includeDatabase) {
    try {
      dbLatencyMs = await databaseLatency();
    } catch {
      dbLatencyMs = null;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    cpu: {
      processUserMicros: cpu.user,
      processSystemMicros: cpu.system,
      loadAverage: os.loadavg(),
    },
    memory,
    disk: {
      note: "Disk capacity is reported by /health because portable free-space metrics need native OS support.",
    },
    api: {
      activeRequests: state.activeRequests,
      totalRequests,
      failedRequests: state.failedRequests,
      slowRequests: state.slowRequests,
      requestsPerMinute: state.requestsByMinute.get(minuteKey()) || 0,
      avgLatencyMs,
      maxLatencyMs: Number(state.maxLatencyMs.toFixed(3)),
    },
    database: {
      latencyMs: dbLatencyMs,
    },
    activeUsers: {
      current: null,
      note: "Active user counting requires session activity aggregation from PostgreSQL.",
    },
    node: {
      eventLoopDelayMeanMs: Number((histogram.mean / 1_000_000 || 0).toFixed(3)),
      eventLoopDelayMaxMs: Number((histogram.max / 1_000_000 || 0).toFixed(3)),
      unhandledExceptions: state.unhandledExceptions,
    },
    endpoints: Object.fromEntries(
      Array.from(state.endpoints.entries()).map(([key, value]) => [
        key,
        {
          ...value,
          avgLatencyMs: value.count
            ? Number((value.latencyMs / value.count).toFixed(3))
            : 0,
          maxLatencyMs: Number(value.maxLatencyMs.toFixed(3)),
        },
      ])
    ),
  };
};

const prometheus = async () => {
  const metrics = await snapshot({ includeDatabase: true });
  const lines = [
    "# HELP petrosync_requests_total Total HTTP requests.",
    "# TYPE petrosync_requests_total counter",
    `petrosync_requests_total ${metrics.api.totalRequests}`,
    "# HELP petrosync_failed_requests_total Total failed HTTP requests.",
    "# TYPE petrosync_failed_requests_total counter",
    `petrosync_failed_requests_total ${metrics.api.failedRequests}`,
    "# HELP petrosync_slow_requests_total Total slow HTTP requests.",
    "# TYPE petrosync_slow_requests_total counter",
    `petrosync_slow_requests_total ${metrics.api.slowRequests}`,
    "# HELP petrosync_active_requests Current active HTTP requests.",
    "# TYPE petrosync_active_requests gauge",
    `petrosync_active_requests ${metrics.api.activeRequests}`,
    "# HELP petrosync_api_latency_avg_ms Average API latency in milliseconds.",
    "# TYPE petrosync_api_latency_avg_ms gauge",
    `petrosync_api_latency_avg_ms ${metrics.api.avgLatencyMs}`,
    "# HELP petrosync_database_latency_ms PostgreSQL latency in milliseconds.",
    "# TYPE petrosync_database_latency_ms gauge",
    `petrosync_database_latency_ms ${metrics.database.latencyMs ?? -1}`,
    "# HELP petrosync_event_loop_delay_max_ms Max Node.js event loop delay in milliseconds.",
    "# TYPE petrosync_event_loop_delay_max_ms gauge",
    `petrosync_event_loop_delay_max_ms ${metrics.node.eventLoopDelayMaxMs}`,
    "# HELP petrosync_process_rss_bytes Process RSS memory in bytes.",
    "# TYPE petrosync_process_rss_bytes gauge",
    `petrosync_process_rss_bytes ${metrics.memory.rss}`,
    "# HELP petrosync_unhandled_exceptions_total Total unhandled exceptions/rejections.",
    "# TYPE petrosync_unhandled_exceptions_total counter",
    `petrosync_unhandled_exceptions_total ${metrics.node.unhandledExceptions}`,
  ];

  return `${lines.join("\n")}\n`;
};

module.exports = {
  recordRequestStart,
  recordRequestEnd,
  recordUnhandledException,
  snapshot,
  prometheus,
};
