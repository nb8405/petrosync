const backupService = require("./backupService");
const activityLogService = require("./activityLogService");
const automationRepository = require("../repositories/automationRepository");
const automationSyncService = require("./automationSyncService");
const auditService = require("./auditService");
const { encryptCredential } = require("../utils/credentialCrypto");

let backupTimer = null;
let lastScheduledBackupKey = null;
const allowedVendors = new Set(["atos", "doms", "veederroot", "generic"]);

const dueKeyForSchedule = (date, schedule) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  if (schedule.frequency === "weekly") {
    return `${yyyy}-W${Math.ceil(date.getDate() / 7)}`;
  }

  if (schedule.frequency === "monthly") {
    return `${yyyy}-${mm}`;
  }

  return `${yyyy}-${mm}-${dd}`;
};

const isScheduleDue = (date, schedule) => {
  if (!schedule.enabled) {
    return false;
  }

  const [hour, minute] = String(schedule.runTime || "02:00")
    .split(":")
    .map((value) => Number(value));

  if (date.getHours() !== hour || date.getMinutes() !== minute) {
    return false;
  }

  if (schedule.frequency === "weekly" && date.getDay() !== 1) {
    return false;
  }

  if (schedule.frequency === "monthly" && date.getDate() !== 1) {
    return false;
  }

  const key = `${schedule.frequency}:${dueKeyForSchedule(date, schedule)}:${schedule.runTime}`;

  if (lastScheduledBackupKey === key) {
    return false;
  }

  lastScheduledBackupKey = key;
  return true;
};

const startAutomaticBackup = () => {
  if (backupTimer) {
    return {
      ok: true,
      enabled: true,
      message: "Automatic backup scheduler is already running.",
    };
  }

  backupTimer = setInterval(async () => {
    try {
      const schedule = await backupService.getSchedule();

      if (isScheduleDue(new Date(), schedule)) {
        await backupService.createBackup({
          backupType: "scheduled",
          backupMode: schedule.backupMode || "full",
          user: { username: "system", role: "System" },
          ipAddress: "system",
        });
        await backupService.enforceRetention();
      }
    } catch (error) {
      await activityLogService.logActivity({
        activityType: "backup",
        moduleName: "automation",
        status: "failed",
        message: error.message,
      });
    }
  }, 60 * 1000);

  return {
    ok: true,
    enabled: true,
    message: "Automatic backup scheduler started.",
  };
};

const stopAutomaticBackup = () => {
  if (!backupTimer) {
    return {
      ok: true,
      running: false,
      message: "Automatic backup scheduler was not running.",
    };
  }

  clearInterval(backupTimer);
  backupTimer = null;

  return {
    ok: true,
    running: false,
    message: "Automatic backup scheduler stopped.",
  };
};

const getAutomationStatus = () => ({
  ok: true,
  backup: {
    enabled: true,
    running: Boolean(backupTimer),
  },
});

const publicConnection = (row) => ({
  id: row.id,
  vendor: row.vendor,
  connectionType: row.connection_type,
  ipAddress: row.ip_address,
  port: row.port,
  username: row.username || "",
  hasPassword: Boolean(row.password_encrypted),
  syncIntervalMinutes: row.sync_interval_minutes,
  isActive: row.is_active,
  lastSyncAt: row.last_sync_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeBoolean = (value, fallback = true) =>
  value === undefined ? fallback : Boolean(value);

const normalizeConnectionInput = (input = {}, existing = null) => {
  const vendor = String(input.vendor || existing?.vendor || "atos").toLowerCase();
  const port = Number(input.port ?? existing?.port);
  const syncIntervalMinutes = Number(
    input.syncIntervalMinutes ??
      input.sync_interval_minutes ??
      existing?.sync_interval_minutes ??
      15
  );

  const normalized = {
    vendor,
    connectionType: String(
      input.connectionType || input.connection_type || existing?.connection_type || "tcp"
    ).toLowerCase(),
    ipAddress: String(input.ipAddress || input.ip_address || existing?.ip_address || "").trim(),
    port,
    username:
      input.username !== undefined
        ? String(input.username || "").trim()
        : existing?.username,
    syncIntervalMinutes,
    isActive: normalizeBoolean(input.isActive ?? input.is_active, existing?.is_active ?? true),
  };

  if (input.password !== undefined && input.password !== "") {
    normalized.passwordEncrypted = encryptCredential(input.password);
  } else if (existing) {
    normalized.passwordEncrypted = existing.password_encrypted;
  } else {
    normalized.passwordEncrypted = null;
  }

  return normalized;
};

const validateConnection = (connection) => {
  const errors = [];

  if (!allowedVendors.has(connection.vendor)) {
    errors.push("vendor must be one of atos, doms, veederroot, generic");
  }

  if (!connection.ipAddress) {
    errors.push("ipAddress is required");
  }

  if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535) {
    errors.push("port must be between 1 and 65535");
  }

  if (
    !Number.isInteger(connection.syncIntervalMinutes) ||
    connection.syncIntervalMinutes < 1
  ) {
    errors.push("syncIntervalMinutes must be at least 1");
  }

  return {
    ok: errors.length === 0,
    message: errors.join("; "),
  };
};

const listConnections = async () => {
  const result = await automationRepository.listConnections();

  return {
    ok: true,
    connections: result.rows.map(publicConnection),
  };
};

const createConnection = async (input) => {
  const connection = normalizeConnectionInput(input);
  const validation = validateConnection(connection);

  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message,
    };
  }

  const result = await automationRepository.createConnection(connection);
  const publicRow = publicConnection(result.rows[0]);

  await auditService.logAudit({
    actionType: "automation:create",
    moduleName: "automation",
    entityType: "connection",
    entityId: String(result.rows[0].id),
    newValue: publicRow,
    details: publicRow,
  });

  return {
    ok: true,
    connection: publicRow,
  };
};

const updateConnection = async (id, input) => {
  const existing = await automationRepository.findConnectionById(id);

  if (!existing) {
    return {
      ok: false,
      status: 404,
      message: "Automation connection was not found.",
    };
  }

  const connection = normalizeConnectionInput(input, existing);
  const validation = validateConnection(connection);

  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message,
    };
  }

  const result = await automationRepository.updateConnection(id, connection);
  const publicRow = publicConnection(result.rows[0]);

  await auditService.logAudit({
    actionType: "automation:update",
    moduleName: "automation",
    entityType: "connection",
    entityId: String(id),
    oldValue: publicConnection(existing),
    newValue: publicRow,
    details: publicRow,
  });

  return {
    ok: true,
    connection: publicRow,
  };
};

const deleteConnection = async (id) => {
  const result = await automationRepository.deleteConnection(id);

  if (result.rows.length === 0) {
    return {
      ok: false,
      status: 404,
      message: "Automation connection was not found.",
    };
  }

  const publicRow = publicConnection(result.rows[0]);

  await auditService.logAudit({
    actionType: "automation:delete",
    moduleName: "automation",
    entityType: "connection",
    entityId: String(id),
    oldValue: publicRow,
    details: publicRow,
  });

  return {
    ok: true,
    connection: publicRow,
  };
};

const findConnectionResult = async (id) => {
  const connection = await automationRepository.findConnectionById(id);

  if (!connection) {
    return {
      ok: false,
      status: 404,
      message: "Automation connection was not found.",
    };
  }

  return {
    ok: true,
    connection,
  };
};

const testConnection = async (id) => {
  const found = await findConnectionResult(id);

  if (!found.ok) {
    return found;
  }

  return automationSyncService.testConnection(found.connection);
};

const syncConnection = async (id) => {
  const found = await findConnectionResult(id);

  if (!found.ok) {
    return found;
  }

  return automationSyncService.sync(found.connection);
};

module.exports = {
  startAutomaticBackup,
  stopAutomaticBackup,
  getAutomationStatus,
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  syncConnection,
  publicConnection,
};
