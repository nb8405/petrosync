const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const appConfig = require("../config/appConfig");
const db = require("../db");
const operationsRepository = require("../repositories/operationsRepository");
const numberingService = require("./numberingService");
const activityLogService = require("./activityLogService");
const auditService = require("./auditService");
const { createZipBuffer, readZipEntries } = require("../utils/simpleZip");

const BACKUP_SCHEMA_VERSION = "backup.v2";
const fallbackSecret = "development-backup-signing-secret";
let backupInProgress = false;

const backupTables = [
  "app_users",
  "user_sessions",
  "numbering_sequences",
  "dsr_records",
  "dsr_product_rows",
  "dsr_collections",
  "dsr_expenses",
  "report_history",
  "export_history",
  "print_history",
  "backup_history",
  "restore_history",
  "restore_approvals",
  "device_tanks",
  "device_nozzles",
  "device_mappings",
  "device_sync_history",
  "forecourt_islands",
  "forecourt_pumps",
  "forecourt_nozzles",
  "forecourt_tanks",
  "tank_readings",
  "tank_alerts",
  "device_statuses",
  "shift_configs",
  "shift_records",
  "day_end_records",
  "alarms",
  "dry_stock_items",
  "dry_stock_movements",
  "attendants",
  "attendant_sales",
  "station_settings",
  "automation_connections",
  "automation_tank_mappings",
  "automation_nozzle_mappings",
  "automation_sync_logs",
  "audit_logs",
  "activity_logs",
];

const restoreTables = backupTables.filter(
  (tableName) =>
    ![
      "backup_history",
      "restore_history",
      "numbering_sequences",
      "user_sessions",
      "audit_logs",
      "activity_logs",
    ].includes(tableName)
);

const businessTableLabels = {
  app_users: "Users",
  user_sessions: "Sessions",
  numbering_sequences: "Application Settings",
  dsr_records: "DSR Records",
  dsr_product_rows: "DSR Product Rows",
  dsr_collections: "Collections",
  dsr_expenses: "Expenses",
  report_history: "Reports",
  export_history: "Exports",
  print_history: "Prints",
  backup_history: "Backup History",
  restore_history: "Restore History",
  restore_approvals: "Restore Approvals",
  device_tanks: "Tanks",
  device_nozzles: "Nozzles",
  device_mappings: "Tank/Nozzle Mappings",
  device_sync_history: "ATG Sync History",
  forecourt_islands: "Fuel Islands",
  forecourt_pumps: "Pumps",
  forecourt_nozzles: "Nozzles",
  forecourt_tanks: "ATOS Style Tanks",
  tank_readings: "Tank Readings",
  tank_alerts: "Tank Alerts",
  device_statuses: "Device Status Center",
  shift_configs: "Shift Configurations",
  shift_records: "Shift Records",
  day_end_records: "Day End Records",
  alarms: "Alarm Center",
  dry_stock_items: "Dry Stock Items",
  dry_stock_movements: "Dry Stock Movements",
  attendants: "Attendants",
  attendant_sales: "Attendant Sales",
  station_settings: "Configuration Center",
  automation_connections: "ATOS/Automation Configurations",
  automation_tank_mappings: "Automation Tank Mappings",
  automation_nozzle_mappings: "Automation Nozzle Mappings",
  automation_sync_logs: "Automation Sync Logs",
  audit_logs: "Audit Logs",
  activity_logs: "Activity Logs",
};

const ensureBackupDir = () => {
  fs.mkdirSync(appConfig.backup.directory, { recursive: true });
};

const canonicalJson = (value) => JSON.stringify(value);

const backupSecret = () => appConfig.backup.signingSecret || fallbackSecret;

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

const hmac = (payload) =>
  crypto.createHmac("sha256", backupSecret()).update(payload).digest("hex");

const encryptionKey = () =>
  crypto.createHash("sha256").update(`metadata:${backupSecret()}`).digest();

const payloadEncryptionKey = () =>
  crypto
    .createHash("sha256")
    .update(`payload:${appConfig.backup.encryptionSecret || backupSecret()}`)
    .digest();

const encryptMetadata = (metadata) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(metadata), "utf8"),
    cipher.final(),
  ]);

  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
};

const decryptMetadata = (value) => {
  if (!value) {
    return null;
  }

  const [version, iv, tag, encrypted] = String(value).split(":");

  if (version !== "v1" || !iv || !tag || !encrypted) {
    return null;
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8")
  );
};

const encryptPayload = (payload) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", payloadEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8")),
    cipher.final(),
  ]);

  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
};

const decryptPayload = ({ iv, tag, data }) => {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    payloadEncryptionKey(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]);
};

const normalizeUser = (userOrId) => {
  if (!userOrId) {
    return {};
  }

  if (typeof userOrId === "object") {
    return {
      id: userOrId.id || null,
      username: userOrId.username || null,
      role: userOrId.role || null,
    };
  }

  return { id: userOrId };
};

const timestampForFile = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "_",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");

const safeBackupName = (fileName) =>
  /^backup_\d{8}_\d{6}\.zip$/i.test(String(fileName || ""))
    ? fileName
    : null;

const resolveBackupPath = (fileNameOrPath) => {
  const backupDir = path.resolve(appConfig.backup.directory);
  const requested = String(fileNameOrPath || "");
  const fileName = safeBackupName(path.basename(requested));

  if (!fileName) {
    return null;
  }

  const resolved = path.resolve(backupDir, fileName);
  return resolved.startsWith(`${backupDir}${path.sep}`) ? resolved : null;
};

const storeUploadedBackup = ({ fileName, base64 }) => {
  ensureBackupDir();

  const safeName = safeBackupName(path.basename(fileName || ""));

  if (!safeName) {
    return {
      ok: false,
      message: "Backup upload must be named backup_YYYYMMDD_HHMMSS.zip.",
    };
  }

  const encoded = String(base64 || "");

  if (!encoded || encoded.length > 25 * 1024 * 1024) {
    return {
      ok: false,
      message: "Backup upload is empty or exceeds the configured size limit.",
    };
  }

  const buffer = Buffer.from(encoded, "base64");

  if (buffer.length === 0 || buffer.length > 18 * 1024 * 1024) {
    return {
      ok: false,
      message: "Backup upload is empty or exceeds the configured size limit.",
    };
  }

  const filePath = resolveBackupPath(safeName);
  fs.writeFileSync(filePath, buffer);

  return {
    ok: true,
    fileName: safeName,
    filePath,
    sizeBytes: buffer.length,
  };
};

const timestampColumns = ["updated_at", "created_at", "started_at", "requested_at"];

const incrementalColumnFor = (columns) =>
  timestampColumns.find((column) => columns.includes(column)) || null;

const snapshotTable = async (tableName, { since, columns = [] } = {}) => {
  if (!backupTables.includes(tableName)) {
    throw new Error("Table is not allowed for backup.");
  }

  const incrementalColumn = since ? incrementalColumnFor(columns) : null;

  if (incrementalColumn) {
    const result = await db.query(
      `SELECT * FROM ${tableName} WHERE ${incrementalColumn} >= $1 ORDER BY 1 ASC`,
      [since]
    );
    return result.rows;
  }

  const result = await db.query(`SELECT * FROM ${tableName} ORDER BY 1 ASC`);
  return result.rows;
};

const listTableColumns = async (tableName) => {
  const result = await db.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position;
    `,
    [tableName]
  );

  return result.rows.map((row) => row.column_name);
};

const sqlLiteral = (value) => {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }

  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }

  return `'${String(value).replace(/'/g, "''")}'`;
};

const buildDatabaseSql = ({ tables, columnsByTable }) => {
  const lines = [
    "-- MAYA KSK Petrol Pump Management backup package",
    "-- Generated by application backup service.",
    "BEGIN;",
  ];

  restoreTables
    .slice()
    .reverse()
    .forEach((tableName) => {
      lines.push(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE;`);
    });

  restoreTables.forEach((tableName) => {
    const columns = columnsByTable[tableName] || [];

    (tables[tableName] || []).forEach((row) => {
      const rowColumns = columns.filter((column) =>
        Object.prototype.hasOwnProperty.call(row, column)
      );
      const values = rowColumns.map((column) => sqlLiteral(row[column]));

      lines.push(
        `INSERT INTO ${tableName} (${rowColumns.join(", ")}) VALUES (${values.join(", ")});`
      );
    });
  });

  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
};

const latestCompletedBackupTime = async () => {
  const history = await operationsRepository.listBackupHistory({ limit: 50 });
  const latest = history.rows.find(
    (row) => row.status === "success" || row.status === "verified"
  );

  return latest?.completed_at || latest?.started_at || null;
};

const readJsonFile = (filePath, fallback = {}) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const buildSettingsSnapshot = async ({ schedule }) => ({
  app: appConfig.app,
  reports: appConfig.reports,
  backup: {
    automaticEnabled: appConfig.backup.automaticEnabled,
    directory: path.basename(appConfig.backup.directory),
    schedule,
  },
  fuelPrices: readJsonFile(path.join(__dirname, "..", "config", "fuelPrices.json"), {}),
});

const publicBackupHistoryRow = (row) => {
  if (!row) {
    return null;
  }

  const metadata = decryptMetadata(row.metadata_encrypted);
  const fileName = row.file_name || (row.file_path ? path.basename(row.file_path) : null);

  return {
    id: row.id,
    backupId: row.backup_number,
    backupNumber: row.backup_number,
    backupType: row.backup_type,
    status: row.status,
    fileName,
    backupSizeBytes: Number(row.backup_size_bytes || 0),
    backupSize: formatBytes(row.backup_size_bytes || 0),
    checksum: row.checksum || metadata?.checksum || null,
    createdBy:
      row.created_by_display_name ||
      row.created_by_username ||
      metadata?.createdBy?.username ||
      "-",
    createdByRole: row.created_by_role || metadata?.createdBy?.role || null,
    recordCounts: row.record_counts || metadata?.recordCounts || {},
    message: row.message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    verifiedAt: row.verified_at,
  };
};

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);

  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} KB`;
  }

  return `${value} B`;
};

const auditBackupAction = async ({ action, user, ipAddress, status, details = {} }) => {
  await Promise.all([
    auditService.logAudit({
      actionType: action,
      moduleName: "backup",
      entityType: "backup",
      entityId: details.backupNumber || details.backupId || null,
      user,
      ipAddress,
      newValue: details,
      details: {
        userId: user?.id || null,
        username: user?.username || null,
        role: user?.role || null,
        ipAddress,
        result: status,
        ...details,
      },
    }),
    activityLogService.logActivity({
      activityType: `backup:${action.split(":").pop()}`,
      moduleName: "backup",
      status,
      message: details.message || action,
      details: {
        userId: user?.id || null,
        username: user?.username || null,
        ipAddress,
        ...details,
      },
    }),
  ]);
};

const createBackup = async ({
  requestedBy,
  user,
  ipAddress,
  backupType = "manual",
  backupMode = "full",
} = {}) => {
  if (backupInProgress) {
    return {
      ok: false,
      status: 409,
      message: "A backup is already in progress.",
    };
  }

  backupInProgress = true;
  ensureBackupDir();

  try {
    const normalizedMode = String(backupMode || "full").toLowerCase() === "incremental"
      ? "incremental"
      : "full";
    const createdBy = normalizeUser(user || requestedBy);
    const backupNumber = await numberingService.nextBackupNumber();
    const startedAt = new Date();
    const fileName = `backup_${timestampForFile(startedAt)}.zip`;
    const filePath = path.join(appConfig.backup.directory, fileName);
    const incrementalSince =
      normalizedMode === "incremental" ? await latestCompletedBackupTime() : null;
    const tables = {};
    const columnsByTable = {};
    const recordCounts = {};
    const incrementalColumns = {};

    for (const tableName of backupTables) {
      const columns = await listTableColumns(tableName);
      const rows = await snapshotTable(tableName, {
        since: incrementalSince,
        columns,
      });
      tables[tableName] = rows;
      columnsByTable[tableName] = columns;
      recordCounts[tableName] = rows.length;
      incrementalColumns[tableName] = incrementalColumnFor(columns);
    }

    const schedule = await getSchedule();
    const settings = await buildSettingsSnapshot({ schedule });
    const audit = {
      auditLogs: tables.audit_logs || [],
      activityLogs: tables.activity_logs || [],
    };
    const database = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      backupMode: normalizedMode,
      incrementalSince,
      tables,
      columnsByTable,
    };
    const databasePayload = canonicalJson(database);
    const databaseSql = buildDatabaseSql({ tables, columnsByTable });
    const encryptionEnabled = Boolean(appConfig.backup.encryptionEnabled);
    const encryptedDatabase = encryptionEnabled
      ? encryptPayload(JSON.stringify(database, null, 2))
      : null;
    const encryptedDatabaseSql = encryptionEnabled ? encryptPayload(databaseSql) : null;
    const backupReport = {
      backupNumber,
      backupType,
      backupMode: normalizedMode,
      incrementalSince,
      createdAt: startedAt.toISOString(),
      createdBy,
      encrypted: encryptionEnabled,
      compressed: true,
      recordCounts,
      tables: Object.fromEntries(
        backupTables.map((tableName) => [
          tableName,
          {
            label: businessTableLabels[tableName] || tableName,
            rows: recordCounts[tableName] || 0,
            incrementalColumn: incrementalColumns[tableName],
          },
        ])
      ),
    };
    const unsignedMetadata = {
      version: BACKUP_SCHEMA_VERSION,
      backupNumber,
      backupType,
      backupMode: normalizedMode,
      incrementalSince,
      fileName,
      encrypted: encryptionEnabled,
      encryptionAlgorithm: encryptionEnabled ? "aes-256-gcm" : null,
      compressed: true,
      createdBy,
      createdAt: startedAt.toISOString(),
      recordCounts,
      businessData: backupReport.tables,
      contents: [
        "metadata.json",
        encryptionEnabled ? "database.enc.json" : "database.json",
        encryptionEnabled ? "database.sql.enc.json" : "database.sql",
        "settings.json",
        "audit.json",
        "backup-report.json",
      ],
    };
    const metadata = {
      ...unsignedMetadata,
      packageSignature: hmac(
        canonicalJson({
          metadata: unsignedMetadata,
          database: databasePayload,
          settings,
          audit,
          backupReport,
        })
      ),
    };
    const contentChecksum = sha256(
      canonicalJson({
        metadata,
        database,
        databaseSql,
        settings,
        audit,
        backupReport,
      })
    );
    const packageMetadata = {
      ...metadata,
      checksum: contentChecksum,
      checksumScope: "metadata+database+settings+audit+backupReport",
    };
    const zipEntries = [
      { name: "metadata.json", content: JSON.stringify(packageMetadata, null, 2), date: startedAt },
      encryptionEnabled
        ? { name: "database.enc.json", content: JSON.stringify(encryptedDatabase, null, 2), date: startedAt }
        : { name: "database.json", content: JSON.stringify(database, null, 2), date: startedAt },
      encryptionEnabled
        ? { name: "database.sql.enc.json", content: JSON.stringify(encryptedDatabaseSql, null, 2), date: startedAt }
        : { name: "database.sql", content: databaseSql, date: startedAt },
      { name: "settings.json", content: JSON.stringify(settings, null, 2), date: startedAt },
      { name: "audit.json", content: JSON.stringify(audit, null, 2), date: startedAt },
      { name: "backup-report.json", content: JSON.stringify(backupReport, null, 2), date: startedAt },
    ];
    const zipBuffer = createZipBuffer(zipEntries);
    const finalChecksum = sha256(zipBuffer);
    const completedAt = new Date();
    const persistedMetadata = {
      ...packageMetadata,
      packageChecksum: finalChecksum,
      sizeBytes: zipBuffer.length,
      completedAt: completedAt.toISOString(),
    };

    fs.writeFileSync(filePath, zipBuffer);

    const history = await operationsRepository.createBackupHistory({
      backupNumber,
      backupType: normalizedMode === "incremental" ? `${backupType}:incremental` : backupType,
      status: "success",
      filePath,
      fileName,
      backupSizeBytes: zipBuffer.length,
      checksum: finalChecksum,
      createdBy: createdBy.id || null,
      metadataEncrypted: encryptMetadata(persistedMetadata),
      recordCounts,
      message: `${backupType === "pre_restore" ? "Pre-restore" : "Manual"} ${normalizedMode} backup completed.`,
      completedAt,
    });

    await auditBackupAction({
      action: "backup:create",
      user: createdBy,
      ipAddress,
      status: "success",
      details: {
        backupNumber,
        backupType,
        backupMode: normalizedMode,
        incrementalSince,
        fileName,
        checksum: finalChecksum,
        contentChecksum,
        encrypted: encryptionEnabled,
        compressed: true,
        message: "Backup created.",
      },
    });

    return {
      ok: true,
      backupId: backupNumber,
      backupNumber,
      backupType,
      backupMode: normalizedMode,
      incrementalSince,
      encrypted: encryptionEnabled,
      compressed: true,
      fileName,
      checksum: finalChecksum,
      backupSizeBytes: zipBuffer.length,
      backupSize: formatBytes(zipBuffer.length),
      createdAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      createdBy: createdBy.username || createdBy.id || "-",
      recordCounts,
      report: backupReport,
      history: publicBackupHistoryRow(history.rows[0]),
    };
  } finally {
    backupInProgress = false;
  }
};

const createManualBackup = (options = {}) => createBackup(options);

const listBackupHistory = ({ limit }) =>
  operationsRepository
    .listBackupHistory({
      limit: Number(limit || 50),
    })
    .then((history) => ({
      ...history,
      rows: history.rows.map(publicBackupHistoryRow),
    }));

const getBackupById = async (id) => {
  const row = await operationsRepository.findBackupHistoryById(id);

  return row ? publicBackupHistoryRow(row) : null;
};

const getBackupStatus = async () => {
  const history = await listBackupHistory({ limit: 1 });
  const schedule = await getSchedule();

  return {
    ok: true,
    automaticEnabled: Boolean(schedule.enabled),
    schedule,
    latestBackup: history.rows[0] || null,
    backupDirectory: appConfig.backup.directory,
    schemaVersion: BACKUP_SCHEMA_VERSION,
  };
};

const getSchedule = async () => {
  const schedule = await operationsRepository.getBackupSchedule();

  return {
    enabled: Boolean(schedule?.enabled),
    frequency: schedule?.frequency || "daily",
    backupMode: schedule?.backup_mode || "full",
    runTime: schedule?.run_time || "02:00",
    retentionCount: Number(schedule?.retention_count || 7),
    updatedAt: schedule?.updated_at || null,
  };
};

const normalizeRetention = (value) => {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1 || number > 3650) {
    return 7;
  }

  return number;
};

const updateSchedule = async ({ schedule, user, ipAddress }) => {
  const frequency = String(schedule.frequency || "daily").toLowerCase();
  const backupMode =
    String(schedule.backupMode || schedule.backup_mode || "full").toLowerCase() ===
    "incremental"
      ? "incremental"
      : "full";

  if (!["daily", "weekly", "monthly"].includes(frequency)) {
    return {
      ok: false,
      status: 400,
      message: "Backup frequency must be daily, weekly, or monthly.",
    };
  }

  const runTime = String(schedule.runTime || "02:00");

  if (!/^\d{2}:\d{2}$/.test(runTime)) {
    return {
      ok: false,
      status: 400,
      message: "Backup run time must use HH:mm format.",
    };
  }

  const result = await operationsRepository.upsertBackupSchedule({
    enabled: Boolean(schedule.enabled),
    frequency,
    backupMode,
    runTime,
    retentionCount: normalizeRetention(schedule.retentionCount),
    updatedBy: user?.id || null,
  });

  await auditBackupAction({
    action: "backup:schedule",
    user,
    ipAddress,
    status: "success",
    details: {
      schedule: result.rows[0],
      message: "Backup schedule updated.",
    },
  });

  await enforceRetention();

  return {
    ok: true,
    schedule: await getSchedule(),
  };
};

const validateBackupPackage = (filePath) => {
  const safePath = resolveBackupPath(filePath);

  if (!safePath || !fs.existsSync(safePath)) {
    return {
      ok: false,
      message: "Backup file does not exist.",
    };
  }

  try {
    const buffer = fs.readFileSync(safePath);
    const checksum = sha256(buffer);
    const entries = readZipEntries(safePath);

    if (!entries["metadata.json"]) {
      return {
        ok: false,
        message: "Backup package is missing metadata.json.",
      };
    }

    const metadata = JSON.parse(entries["metadata.json"].toString("utf8"));
    const encrypted = Boolean(metadata.encrypted);
    const required = encrypted
      ? ["database.enc.json", "database.sql.enc.json", "settings.json", "audit.json"]
      : ["database.json", "database.sql", "settings.json", "audit.json"];
    const missing = required.filter((name) => !entries[name]);

    if (missing.length > 0) {
      return {
        ok: false,
        message: `Backup package is missing files: ${missing.join(", ")}.`,
      };
    }

    const database = encrypted
      ? JSON.parse(
          decryptPayload(JSON.parse(entries["database.enc.json"].toString("utf8"))).toString("utf8")
        )
      : JSON.parse(entries["database.json"].toString("utf8"));
    const databaseSql = encrypted
      ? decryptPayload(JSON.parse(entries["database.sql.enc.json"].toString("utf8"))).toString("utf8")
      : entries["database.sql"].toString("utf8");
    const settings = JSON.parse(entries["settings.json"].toString("utf8"));
    const audit = JSON.parse(entries["audit.json"].toString("utf8"));
    const backupReport = entries["backup-report.json"]
      ? JSON.parse(entries["backup-report.json"].toString("utf8"))
      : null;

    if (metadata.version !== BACKUP_SCHEMA_VERSION || database.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      return {
        ok: false,
        message: "Backup schema version is not supported.",
      };
    }

    if (!database.tables || typeof database.tables !== "object") {
      return {
        ok: false,
        message: "Backup database payload is missing table data.",
      };
    }

    const missingTables = restoreTables.filter(
      (tableName) => !Array.isArray(database.tables[tableName])
    );

    if (missingTables.length > 0) {
      return {
        ok: false,
        message: `Backup file is missing tables: ${missingTables.join(", ")}.`,
      };
    }

    const expectedSignature = hmac(
      canonicalJson({
        metadata: Object.fromEntries(
          Object.entries(metadata).filter(
            ([key]) => !["packageSignature", "checksum", "checksumScope", "sizeBytes", "packageChecksum"].includes(key)
          )
        ),
        database: canonicalJson(database),
        settings,
        audit,
        ...(backupReport ? { backupReport } : {}),
      })
    );

    if (!metadata.packageSignature || metadata.packageSignature !== expectedSignature) {
      return {
        ok: false,
        message: "Backup package signature verification failed.",
      };
    }

    const contentChecksum = sha256(
      canonicalJson({
        metadata: Object.fromEntries(
          Object.entries(metadata).filter(
            ([key]) => !["checksum", "checksumScope"].includes(key)
          )
        ),
        database,
        databaseSql,
        settings,
        audit,
        ...(backupReport ? { backupReport } : {}),
      })
    );

    if (metadata.checksum && metadata.checksum !== contentChecksum) {
      return {
        ok: false,
        message: "Backup content checksum does not match package metadata.",
      };
    }

    return {
      ok: true,
      filePath: safePath,
      fileName: path.basename(safePath),
      checksum,
      sizeBytes: buffer.length,
      metadata,
      database,
      settings,
      audit,
      backupReport,
      preview: {
        backupId: metadata.backupNumber,
        backupMode: metadata.backupMode || "full",
        encrypted,
        createdAt: metadata.createdAt,
        createdBy: metadata.createdBy,
        recordCounts: metadata.recordCounts,
        checksum,
        contentChecksum,
        sizeBytes: buffer.length,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "Backup file is corrupted or unreadable.",
    };
  }
};

const verifyBackup = async ({ id, fileName, user, ipAddress }) => {
  const row = id ? await operationsRepository.findBackupHistoryById(id) : null;
  const targetFileName = row?.file_name || fileName;
  const validation = validateBackupPackage(targetFileName);

  await auditBackupAction({
    action: "backup:verify",
    user,
    ipAddress,
    status: validation.ok ? "success" : "failed",
    details: {
      backupId: row?.id || id || null,
      backupNumber: row?.backup_number || validation.preview?.backupId || null,
      fileName: targetFileName,
      checksum: validation.checksum || null,
      message: validation.message || "Backup verified.",
    },
  });

  if (!validation.ok) {
    return validation;
  }

  if (row) {
    await operationsRepository.markBackupVerified(row.id);
  }

  return {
    ok: true,
    message: "Backup verification passed.",
    backup: validation.preview,
  };
};

const prepareDownload = async ({ id, user, ipAddress }) => {
  const row = await operationsRepository.findBackupHistoryById(id);

  if (!row) {
    return {
      ok: false,
      status: 404,
      message: "Backup was not found.",
    };
  }

  const filePath = resolveBackupPath(row.file_name || row.file_path);

  if (!filePath || !fs.existsSync(filePath)) {
    return {
      ok: false,
      status: 404,
      message: "Backup file was not found.",
    };
  }

  await auditBackupAction({
    action: "backup:download",
    user,
    ipAddress,
    status: "success",
    details: {
      backupId: row.id,
      backupNumber: row.backup_number,
      fileName: path.basename(filePath),
      message: "Backup downloaded.",
    },
  });

  return {
    ok: true,
    filePath,
    fileName: path.basename(filePath),
  };
};

const getBackupReport = async ({ id }) => {
  const row = await operationsRepository.findBackupHistoryById(id);

  if (!row) {
    return {
      ok: false,
      status: 404,
      message: "Backup was not found.",
    };
  }

  const validation = validateBackupPackage(row.file_name || row.file_path);

  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    report:
      validation.backupReport || {
        backupNumber: validation.metadata.backupNumber,
        backupMode: validation.metadata.backupMode || "full",
        encrypted: Boolean(validation.metadata.encrypted),
        createdAt: validation.metadata.createdAt,
        createdBy: validation.metadata.createdBy,
        recordCounts: validation.metadata.recordCounts || {},
        checksum: validation.checksum,
      },
  };
};

const deleteBackup = async ({ id, user, ipAddress }) => {
  const row = await operationsRepository.findBackupHistoryById(id);

  if (!row) {
    return {
      ok: false,
      status: 404,
      message: "Backup was not found.",
    };
  }

  const filePath = resolveBackupPath(row.file_name || row.file_path);
  const deleted = await operationsRepository.softDeleteBackupHistory(id);

  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await auditBackupAction({
    action: "backup:delete",
    user,
    ipAddress,
    status: "success",
    details: {
      backupId: row.id,
      backupNumber: row.backup_number,
      fileName: row.file_name || path.basename(row.file_path || ""),
      message: "Backup deleted.",
    },
  });

  return {
    ok: true,
    message: "Backup deleted.",
    backup: publicBackupHistoryRow(deleted.rows[0]),
  };
};

const enforceRetention = async () => {
  const schedule = await getSchedule();
  const history = await listBackupHistory({ limit: 500 });
  const expired = history.rows.slice(schedule.retentionCount);

  for (const backup of expired) {
    await deleteBackup({
      id: backup.id,
      user: { username: "system", role: "System" },
      ipAddress: "system",
    });
  }

  return {
    ok: true,
    deleted: expired.length,
  };
};

module.exports = {
  BACKUP_SCHEMA_VERSION,
  backupTables,
  restoreTables,
  businessTableLabels,
  createBackup,
  createManualBackup,
  listBackupHistory,
  getBackupStatus,
  getBackupById,
  getSchedule,
  updateSchedule,
  validateBackupPackage,
  verifyBackup,
  prepareDownload,
  getBackupReport,
  deleteBackup,
  enforceRetention,
  resolveBackupPath,
  storeUploadedBackup,
  publicBackupHistoryRow,
  formatBytes,
};
