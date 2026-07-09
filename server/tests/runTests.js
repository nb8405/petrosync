const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const jwt = require("jsonwebtoken");
const validationService = require("../services/validationService");
const { normalizeProductKey } = require("../utils/reportConfig");
const { validateReportRequest } = require("../utils/reportValidation");
const { hasPermission } = require("../security/roles");
const { requirePermission } = require("../middleware/permissionHook");
const { redact } = require("../utils/redaction");
const { encryptCredential, decryptCredential } = require("../utils/credentialCrypto");
const { createProvider, providers } = require("../integrations/providers");
const fuelPriceService = require("../services/fuelPriceService");
const { escapeCsvCell } = require("../services/exportService");
const reportingService = require("../services/reportingService");
const dsrService = require("../services/dsrService");
const dsrRepository = require("../repositories/dsrRepository");
const auditService = require("../services/auditService");
const activityLogService = require("../services/activityLogService");
const { requireOwner } = require("../middleware/ownerOnly");
const backupService = require("../services/backupService");
const restoreService = require("../services/restoreService");
const operationsRepository = require("../repositories/operationsRepository");
const authRepository = require("../repositories/authRepository");
const db = require("../db");
const authService = require("../services/authService");
const forecourtService = require("../services/forecourtService");
const forecourtRepository = require("../repositories/forecourtRepository");
const logger = require("../services/loggerService");
const healthService = require("../services/healthService");
const onboardingService = require("../services/onboardingService");
const onboardingRepository = require("../repositories/onboardingRepository");
const userAccountService = require("../services/userAccountService");
const appConfig = require("../config/appConfig");
const { csrfProtection, requireMetricsAccess } = require("../security/securityMiddleware");

const tests = [];

const test = (name, fn) => {
  tests.push({ name, fn });
};

test("normalizes supported product keys", () => {
  assert.strictEqual(normalizeProductKey("MS"), "ms");
  assert.strictEqual(normalizeProductKey("overall"), "overall");
  assert.strictEqual(normalizeProductKey("bad"), null);
});

test("rejects invalid report date range", () => {
  const result = validateReportRequest({
    fromDate: "2026-06-10",
    toDate: "2026-06-01",
    productKey: "overall",
  });

  assert.strictEqual(result.ok, false);
});

test("rejects loosely parsed report dates", () => {
  const result = validateReportRequest({
    fromDate: "2026-02-31",
    toDate: "2026-03-01",
    productKey: "overall",
  });

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /valid date|YYYY-MM-DD/);
});

test("validates DSR readings", () => {
  const result = validationService.validateDsrPayload({
    dsrDate: "2026-06-05",
    products: [
      {
        productCode: "ms",
        productLabel: "MS",
        openingReading: 100,
        closingReading: 90,
        testingQty: 0,
      },
    ],
    collections: [],
    expenses: [],
  });

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /closing reading/);
});

test("accepts valid DSR payload", () => {
  const result = validationService.validateDsrPayload({
    dsrDate: "2026-06-05",
    products: [
      {
        productCode: "ms",
        productLabel: "MS",
        openingReading: 100,
        closingReading: 150,
        testingQty: 2,
        tankDip: 500,
        receiptQty: 0,
      },
    ],
    collections: [{ collectionType: "cash", amount: 1000 }],
    expenses: [{ expenseType: "staff", amount: 100 }],
  });

  assert.strictEqual(result.ok, true);
});

test("rejects unsupported DSR product and payment fields", () => {
  const result = validationService.validateDsrPayload({
    dsrDate: "2026-06-05",
    products: [
      {
        productCode: "unexpected",
        productLabel: "Unexpected",
        openingReading: 100,
        closingReading: 150,
        testingQty: 0,
      },
    ],
    collections: [{ collectionType: "wire", amount: 1000 }],
    expenses: [{ expenseType: "other", amount: 100 }],
  });

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /not supported/);
});

test("enforces role permissions for protected operations", () => {
  assert.strictEqual(hasPermission("Owner", "restore:run"), true);
  assert.strictEqual(hasPermission("Manager", "backup:read"), true);
  assert.strictEqual(hasPermission("Manager", "forecourt:manage"), true);
  assert.strictEqual(hasPermission("Manager", "tank:manage"), true);
  assert.strictEqual(hasPermission("Manager", "export:create"), true);
  assert.strictEqual(hasPermission("Manager", "dsr:delete"), false);
  assert.strictEqual(hasPermission("Manager", "backup:create"), false);
  assert.strictEqual(hasPermission("Supervisor", "export:create"), false);
  assert.strictEqual(hasPermission("Operator", "reports:read"), false);
  assert.strictEqual(hasPermission("Operator", "backup:read"), true);
  assert.strictEqual(hasPermission("Operator", "forecourt:manage"), false);
  assert.strictEqual(hasPermission("Operator", "shift:manage"), true);
  assert.strictEqual(hasPermission("ReadOnly", "dsr:create"), false);
  assert.strictEqual(hasPermission("ReadOnly", "tank:read"), true);
});

test("permission middleware fails closed without authenticated user", () => {
  const middleware = requirePermission("backup:create");
  let statusCode = null;
  let payload = null;

  middleware(
    { user: null },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
      },
    },
    () => {
      throw new Error("next should not be called");
    }
  );

  assert.strictEqual(statusCode, 401);
  assert.strictEqual(payload.ok, false);
});

test("permission middleware allows authorized owner", () => {
  const middleware = requirePermission("backup:create");
  let nextCalled = false;

  middleware(
    { user: { role: "Owner" } },
    {
      status() {
        throw new Error("status should not be called");
      },
    },
    () => {
      nextCalled = true;
    }
  );

  assert.strictEqual(nextCalled, true);
});

test("owner-only middleware allows only Owner role and logs denials", async () => {
  const originalAuditLog = auditService.logAudit;
  const originalActivityLog = activityLogService.logActivity;
  const logged = [];

  auditService.logAudit = async (entry) => {
    logged.push(["audit", entry]);
  };
  activityLogService.logActivity = async (entry) => {
    logged.push(["activity", entry]);
  };

  try {
    const middleware = requireOwner({ moduleName: "dsr", action: "delete_dsr" });
    let ownerNextCalled = false;

    await middleware(
      { user: { id: 1, username: "owner", role: "Owner" } },
      {
        status() {
          throw new Error("status should not be called for owner");
        },
      },
      () => {
        ownerNextCalled = true;
      }
    );

    assert.strictEqual(ownerNextCalled, true);

    let statusCode = null;
    let payload = null;
    await middleware(
      {
        user: { id: 2, username: "manager", role: "Manager" },
        originalUrl: "/api/dsr/2026-06-01",
        method: "DELETE",
      },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          payload = body;
        },
      },
      () => {
        throw new Error("next should not be called for non-owner");
      }
    );

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(payload.ok, false);
    assert.strictEqual(logged.length, 2);
    assert(logged.every((entry) => entry[1].moduleName === "dsr"));
  } finally {
    auditService.logAudit = originalAuditLog;
    activityLogService.logActivity = originalActivityLog;
  }
});

test("redacts sensitive log fields recursively", () => {
  const result = redact({
    username: "manager",
    password: "secret",
    nested: {
      jwtToken: "token-value",
      safe: "visible",
    },
  });

  assert.strictEqual(result.username, "manager");
  assert.strictEqual(result.password, "[Redacted]");
  assert.strictEqual(result.nested.jwtToken, "[Redacted]");
  assert.strictEqual(result.nested.safe, "visible");
});

test("structured logger writes redacted JSON channel logs", () => {
  const appConfig = require("../config/appConfig");
  const originalLogDir = appConfig.logging.directory;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ppm-logs-test-"));

  try {
    appConfig.logging.directory = tempDir;
    logger.info("Logger test.", {
      module: "test",
      requestContext: {
        requestId: "req-12345678",
        correlationId: "corr-12345678",
        userId: 7,
        ipAddress: "127.0.0.1",
        method: "GET",
        endpoint: "/api/test",
      },
      password: "secret",
    });

    const line = fs
      .readFileSync(path.join(tempDir, "application.log"), "utf8")
      .trim();
    const entry = JSON.parse(line);

    assert.strictEqual(entry.severity, "info");
    assert.strictEqual(entry.module, "test");
    assert.strictEqual(entry.requestId, "req-12345678");
    assert.strictEqual(entry.correlationId, "corr-12345678");
    assert.strictEqual(entry.userId, 7);
    assert.strictEqual(entry.details.password, "[Redacted]");
  } finally {
    appConfig.logging.directory = originalLogDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("audit service enriches immutable audit records", async () => {
  const originalInsertAuditLog = operationsRepository.insertAuditLog;
  const captured = [];

  operationsRepository.insertAuditLog = async (record) => {
    captured.push(record);
    return { rows: [{ id: 1, ...record }] };
  };

  try {
    await auditService.logAudit({
      actionType: "user:create",
      moduleName: "authentication",
      entityType: "app_user",
      entityId: "42",
      user: { id: 1, username: "owner", role: "Owner" },
      oldValue: { password: "old" },
      newValue: { username: "manager", password: "new" },
      ipAddress: "127.0.0.1",
      machineName: "test-machine",
      requestId: "req-12345678",
      correlationId: "corr-12345678",
    });

    assert.strictEqual(captured.length, 1);
    assert.match(captured[0].auditId, /^AUD-/);
    assert.strictEqual(captured[0].userId, 1);
    assert.strictEqual(captured[0].username, "owner");
    assert.strictEqual(captured[0].userRole, "Owner");
    assert.strictEqual(captured[0].ipAddress, "127.0.0.1");
    assert.strictEqual(captured[0].machineName, "test-machine");
    assert.strictEqual(captured[0].requestId, "req-12345678");
    assert.strictEqual(captured[0].correlationId, "corr-12345678");
    assert.strictEqual(captured[0].oldValue.password, "[Redacted]");
    assert.strictEqual(captured[0].newValue.password, "[Redacted]");
  } finally {
    operationsRepository.insertAuditLog = originalInsertAuditLog;
  }
});

test("encrypts integration credentials before storage", () => {
  const plaintext = "ATOS-secret-password";
  const encrypted = encryptCredential(plaintext);

  assert.notStrictEqual(encrypted, plaintext);
  assert.match(encrypted, /^v1:/);
  assert.strictEqual(decryptCredential(encrypted), plaintext);
});

test("backup upload rejects unsafe file names", () => {
  const result = backupService.storeUploadedBackup({
    fileName: "../backup.zip",
    base64: Buffer.from("not a backup").toString("base64"),
  });

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /backup_YYYYMMDD_HHMMSS/);
});

test("backup package creation and verification use zip checksum validation", async () => {
  const appConfig = require("../config/appConfig");
  const numberingService = require("../services/numberingService");
  const originalBackupDir = appConfig.backup.directory;
  const originalQuery = db.query;
  const originalNextBackupNumber = numberingService.nextBackupNumber;
  const originalCreateBackupHistory = operationsRepository.createBackupHistory;
  const originalListBackupHistory = operationsRepository.listBackupHistory;
  const originalFindBackupHistoryById = operationsRepository.findBackupHistoryById;
  const originalMarkBackupVerified = operationsRepository.markBackupVerified;
  const originalGetBackupSchedule = operationsRepository.getBackupSchedule;
  const originalAuditLog = auditService.logAudit;
  const originalActivityLog = activityLogService.logActivity;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ppm-backup-test-"));
  let historyRow = null;

  appConfig.backup.directory = tempDir;
  numberingService.nextBackupNumber = async () => "BKP-TEST-001";
  operationsRepository.createBackupHistory = async (backup) => {
    historyRow = {
      id: 1,
      backup_number: backup.backupNumber,
      backup_type: backup.backupType,
      status: backup.status,
      file_path: backup.filePath,
      file_name: backup.fileName,
      backup_size_bytes: backup.backupSizeBytes,
      checksum: backup.checksum,
      created_by: backup.createdBy,
      metadata_encrypted: backup.metadataEncrypted,
      record_counts: backup.recordCounts,
      message: backup.message,
      started_at: new Date(),
      completed_at: backup.completedAt,
    };
    return { rows: [historyRow] };
  };
  operationsRepository.listBackupHistory = async () => ({ rows: [historyRow].filter(Boolean) });
  operationsRepository.findBackupHistoryById = async () => historyRow;
  operationsRepository.markBackupVerified = async () => ({ rows: [{ ...historyRow, status: "verified" }] });
  operationsRepository.getBackupSchedule = async () => ({
    enabled: false,
    frequency: "daily",
    run_time: "02:00",
    retention_count: 7,
  });
  auditService.logAudit = async () => {};
  activityLogService.logActivity = async () => {};
  db.query = async (sql, params) => {
    if (String(sql).includes("information_schema.columns")) {
      return { rows: [{ column_name: "id" }] };
    }

    if (String(sql).startsWith("SELECT * FROM")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query in backup test: ${sql}`);
  };

  try {
    const created = await backupService.createBackup({
      user: { id: 1, username: "owner", role: "Owner" },
      ipAddress: "127.0.0.1",
    });

    assert.strictEqual(created.ok, true);
    assert.match(created.fileName, /^backup_\d{8}_\d{6}\.zip$/);
    assert(fs.existsSync(path.join(tempDir, created.fileName)));

    const verified = await backupService.verifyBackup({
      id: 1,
      user: { id: 1, username: "owner", role: "Owner" },
      ipAddress: "127.0.0.1",
    });

    assert.strictEqual(verified.ok, true);
    assert.strictEqual(verified.backup.checksum, created.checksum);
  } finally {
    appConfig.backup.directory = originalBackupDir;
    db.query = originalQuery;
    numberingService.nextBackupNumber = originalNextBackupNumber;
    operationsRepository.createBackupHistory = originalCreateBackupHistory;
    operationsRepository.listBackupHistory = originalListBackupHistory;
    operationsRepository.findBackupHistoryById = originalFindBackupHistoryById;
    operationsRepository.markBackupVerified = originalMarkBackupVerified;
    operationsRepository.getBackupSchedule = originalGetBackupSchedule;
    auditService.logAudit = originalAuditLog;
    activityLogService.logActivity = originalActivityLog;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("restore validation reports record count mismatches", () => {
  const mismatches = restoreService.verifyRecordCounts(
    { dsr_records: 2, dsr_product_rows: 4 },
    { dsr_records: 1, dsr_product_rows: 4 }
  );

  assert.strictEqual(mismatches.length, 1);
  assert.match(mismatches[0], /dsr_records/);
});

test("escapes spreadsheet formula prefixes in CSV exports", () => {
  assert.strictEqual(escapeCsvCell("=1+1"), "\"'=1+1\"");
  assert.strictEqual(escapeCsvCell("+SUM(A1:A2)"), "\"'+SUM(A1:A2)\"");
  assert.strictEqual(escapeCsvCell("plain"), "\"plain\"");
});

test("dashboard monthly range is timezone stable", () => {
  assert.deepStrictEqual(reportingService.monthRange(2026, 2), {
    fromDate: "2026-02-01",
    toDate: "2026-02-28",
  });
  assert.deepStrictEqual(reportingService.monthRange(2024, 2), {
    fromDate: "2024-02-01",
    toDate: "2024-02-29",
  });
});

test("dashboard sales breakdown groups product codes by fuel", () => {
  const rows = [
    {
      period_start: "2026-06-01",
      product_code: "hsdTank1",
      sales_liters: "10",
      amount: "950",
    },
    {
      period_start: "2026-06-01",
      product_code: "hsdTank2",
      sales_liters: "5",
      amount: "475",
    },
    {
      period_start: "2026-06-01",
      product_code: "ms",
      sales_liters: "4",
      amount: "420",
    },
  ];

  const [day] = reportingService.salesBreakdownFromRows(rows, {
    periodLabel: () => "01 Jun",
  });
  const hsd = day.products.find((product) => product.productKey === "hsd");

  assert.strictEqual(day.totalSales, 1845);
  assert.strictEqual(day.totalLiters, 19);
  assert.strictEqual(hsd.salesLiters, 15);
  assert.strictEqual(hsd.amount, 1425);
});

test("DSR history groups saved records by configured products", async () => {
  const originalGetHistoryRecords = dsrRepository.getHistoryRecords;

  dsrRepository.getHistoryRecords = async () => [
    {
      dsr_date: "2026-06-01",
      dsr_number: "DSR-000001",
      created_at: "2026-06-01T08:15:00.000Z",
      updated_at: "2026-06-01T08:20:00.000Z",
      created_by: "owner",
      product_count: 2,
      total_liters: "15",
      total_amount: "1425",
      products: {
        hsdTank1: {
          product_label: "HSD Tank 1",
          sales_liters: "10",
          amount: "950",
        },
        hsdTank2: {
          product_label: "HSD Tank 2",
          sales_liters: "5",
          amount: "475",
        },
      },
    },
  ];

  try {
    const result = await dsrService.listDsrHistory({
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
      productKey: "hsd",
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.records.length, 1);
    assert.strictEqual(result.records[0].totalLiters, 15);
    assert.strictEqual(result.records[0].totalAmount, 1425);
    assert.strictEqual(result.records[0].createdBy, "owner");
    assert.strictEqual(result.records[0].createdAt, "2026-06-01T08:15:00.000Z");
    assert.strictEqual(
      result.records[0].products.find((product) => product.productKey === "hsd").salesLiters,
      15
    );
    assert.deepStrictEqual(
      result.records[0].products.find((product) => product.productKey === "hsd").tankNames,
      ["HSD Tank 1", "HSD Tank 2"]
    );
  } finally {
    dsrRepository.getHistoryRecords = originalGetHistoryRecords;
  }
});

test("automation providers are prepared without live communication", async () => {
  for (const vendor of providers) {
    const provider = createProvider(vendor);
    const result = await provider.testConnection();

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.message, "Provider not configured");
  }
});

test("fuel price settings expose configured product rates", async () => {
  const result = await fuelPriceService.getFuelPrices();

  assert.strictEqual(result.ok, true);
  ["ms", "hsd", "xp95", "xg"].forEach((key) => {
    assert.strictEqual(typeof result.prices[key], "number");
  });
});

test("production config rejects missing secure settings", () => {
  const originalEnv = { ...process.env };
  const modules = [
    "../config/appConfig",
    "../config/productionConfig",
  ].map((modulePath) => require.resolve(modulePath));

  try {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      JWT_SECRET: "",
      BACKUP_SIGNING_SECRET: "",
      BACKUP_ENCRYPTION_ENABLED: "true",
      BACKUP_ENCRYPTION_SECRET: "",
      CORS_ORIGINS: "*",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/pump",
      PGHOST: "",
      PGDATABASE: "",
      PGUSER: "",
      PGPASSWORD: "",
      AUTH_COOKIE_ENABLED: "true",
      AUTH_COOKIE_SECURE: "false",
      CSRF_ENABLED: "false",
      RATE_LIMIT_MODE: "redis",
      REDIS_URL: "",
    };
    modules.forEach((modulePath) => delete require.cache[modulePath]);

    const { validateProductionConfig } = require("../config/productionConfig");
    const result = validateProductionConfig();

    assert.strictEqual(result.ok, false);
    assert(result.errors.some((message) => message.includes("JWT_SECRET")));
    assert(result.errors.some((message) => message.includes("BACKUP_SIGNING_SECRET")));
    assert(result.errors.some((message) => message.includes("BACKUP_ENCRYPTION_SECRET")));
    assert(result.errors.some((message) => message.includes("CORS_ORIGINS cannot include wildcard")));
    assert(result.errors.some((message) => message.includes("DATABASE_URL must not use default")));
    assert(result.errors.some((message) => message.includes("CSRF_ENABLED")));
    assert(result.errors.some((message) => message.includes("REDIS_URL")));
  } finally {
    process.env = originalEnv;
    modules.forEach((modulePath) => delete require.cache[modulePath]);
  }
});

test("production config accepts explicit hardened settings", () => {
  const originalEnv = { ...process.env };
  const modules = [
    "../config/appConfig",
    "../config/productionConfig",
  ].map((modulePath) => require.resolve(modulePath));

  try {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      JWT_SECRET: "a-secure-jwt-secret-value-with-32-chars",
      JWT_ISSUER: "petrosync",
      JWT_AUDIENCE: "petrosync-api",
      BACKUP_SIGNING_SECRET: "a-secure-backup-secret-value-with-32-chars",
      BACKUP_ENCRYPTION_ENABLED: "true",
      BACKUP_ENCRYPTION_SECRET: "a-secure-backup-encryption-secret-value",
      CORS_ORIGINS: "https://pump.example.com",
      DATABASE_URL: "postgres://user:strong-password@db.example.com:5432/pump",
      AUTH_COOKIE_ENABLED: "true",
      AUTH_COOKIE_SECURE: "true",
      CSRF_ENABLED: "true",
      RATE_LIMIT_MODE: "gateway",
      TRUST_GATEWAY_RATE_LIMIT: "true",
      RATE_LIMIT_WINDOW_MS: "60000",
      RATE_LIMIT_MAX: "120",
    };
    modules.forEach((modulePath) => delete require.cache[modulePath]);

    const { validateProductionConfig } = require("../config/productionConfig");
    const result = validateProductionConfig();

    assert.deepStrictEqual(result, {
      ok: true,
      errors: [],
    });
  } finally {
    process.env = originalEnv;
    modules.forEach((modulePath) => delete require.cache[modulePath]);
  }
});

test("verifies PostgreSQL connectivity when TEST_DATABASE_URL is configured", async () => {
  if (!process.env.TEST_DATABASE_URL) {
    console.log("SKIP PostgreSQL integration smoke test (TEST_DATABASE_URL not set).");
    return;
  }

  const originalEnv = { ...process.env };
  const dbModulePath = require.resolve("../db");

  try {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      DATABASE_URL: originalEnv.TEST_DATABASE_URL,
    };
    delete require.cache[dbModulePath];

    const db = require("../db");
    const result = await db.query("SELECT 1::int AS ok;");

    assert.strictEqual(result.rows[0].ok, 1);
    await db.pool.end();
  } finally {
    process.env = originalEnv;
    delete require.cache[dbModulePath];
  }
});

test("liveness response follows production probe shape", () => {
  const result = healthService.liveness();

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, "alive");
  assert.strictEqual(typeof result.timestamp, "string");
  assert.strictEqual(typeof result.uptimeSeconds, "number");
});

test("CSRF protection fails closed for mutating cookie-authenticated requests", () => {
  const originalCsrfEnabled = appConfig.auth.csrfEnabled;
  let statusCode = null;
  let payload = null;

  appConfig.auth.csrfEnabled = true;

  try {
    csrfProtection(
      {
        method: "POST",
        get(name) {
          return name.toLowerCase() === "cookie" ? "ppm_access=token" : "";
        },
        context: { requestId: "csrf-test-12345678" },
      },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          payload = body;
        },
      },
      () => {
        throw new Error("next should not be called when CSRF token is missing");
      }
    );

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(payload.ok, false);
    assert.match(payload.message, /CSRF/);
  } finally {
    appConfig.auth.csrfEnabled = originalCsrfEnabled;
  }
});

test("metrics endpoint requires internal token or authenticated health permission", async () => {
  const originalMetricsToken = process.env.METRICS_TOKEN;
  let statusCode = null;
  let payload = null;
  let nextCalled = false;

  delete process.env.METRICS_TOKEN;

  await requireMetricsAccess(
    {
      get() {
        return "";
      },
    },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
      },
    },
    () => {
      nextCalled = true;
    }
  );

  assert.strictEqual(statusCode, 401);
  assert.strictEqual(payload.ok, false);
  assert.strictEqual(nextCalled, false);

  process.env.METRICS_TOKEN = "metrics-secret";
  statusCode = null;
  payload = null;
  nextCalled = false;

  await requireMetricsAccess(
    {
      get(name) {
        return name.toLowerCase() === "x-metrics-token" ? "metrics-secret" : "";
      },
    },
    {
      status() {
        throw new Error("status should not be called with valid metrics token");
      },
    },
    () => {
      nextCalled = true;
    }
  );

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(statusCode, null);
  assert.strictEqual(payload, null);

  if (originalMetricsToken === undefined) {
    delete process.env.METRICS_TOKEN;
  } else {
    process.env.METRICS_TOKEN = originalMetricsToken;
  }
});

test("JWT verification enforces configured audience and active session", async () => {
  const originalJwtSecret = appConfig.auth.jwtSecret;
  const originalAudience = appConfig.auth.jwtAudience;
  const originalIssuer = appConfig.auth.jwtIssuer;
  const originalFindActiveSession = authRepository.findActiveSession;
  const originalFindUserById = authRepository.findUserById;
  const originalTouchSession = authRepository.touchSession;

  appConfig.auth.jwtSecret = "test-jwt-secret-value-with-32-characters";
  appConfig.auth.jwtIssuer = "petrosync-test";
  appConfig.auth.jwtAudience = "petrosync-api";
  authRepository.findActiveSession = async () => ({ id: 1 });
  authRepository.findUserById = async () => ({
    id: 7,
    username: "owner",
    display_name: "Owner",
    role: "Owner",
  });
  authRepository.touchSession = async () => ({ rows: [] });

  try {
    const validToken = jwt.sign(
      {
        sub: "7",
        username: "owner",
        role: "Owner",
        tokenType: "access",
      },
      appConfig.auth.jwtSecret,
      {
        expiresIn: "5m",
        issuer: appConfig.auth.jwtIssuer,
        audience: appConfig.auth.jwtAudience,
      }
    );
    const validUser = await authService.verifyToken(validToken);

    assert.strictEqual(validUser.id, 7);
    assert.strictEqual(validUser.role, "Owner");

    const wrongAudienceToken = jwt.sign(
      {
        sub: "7",
        username: "owner",
        role: "Owner",
        tokenType: "access",
      },
      appConfig.auth.jwtSecret,
      {
        expiresIn: "5m",
        issuer: appConfig.auth.jwtIssuer,
        audience: "wrong-audience",
      }
    );

    await assert.rejects(
      () => authService.verifyToken(wrongAudienceToken),
      /jwt audience invalid/
    );
  } finally {
    appConfig.auth.jwtSecret = originalJwtSecret;
    appConfig.auth.jwtAudience = originalAudience;
    appConfig.auth.jwtIssuer = originalIssuer;
    authRepository.findActiveSession = originalFindActiveSession;
    authRepository.findUserById = originalFindUserById;
    authRepository.touchSession = originalTouchSession;
  }
});

test("refresh token rotation rejects replay when stored refresh hash changed", async () => {
  const originalFindActiveRefreshSession = authRepository.findActiveRefreshSession;
  const originalFindUserById = authRepository.findUserById;
  const originalRotateSessionTokens = authRepository.rotateSessionTokens;

  authRepository.findActiveRefreshSession = async () => ({
    id: 1,
    user_id: 7,
  });
  authRepository.findUserById = async () => ({
    id: 7,
    username: "owner",
    display_name: "Owner",
    role: "Owner",
  });
  authRepository.rotateSessionTokens = async ({ currentRefreshTokenHash }) => {
    assert.strictEqual(currentRefreshTokenHash, authService.tokenHash("old-refresh"));
    return { rows: [] };
  };

  try {
    const result = await authService.refreshSession({
      refreshToken: "old-refresh",
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
  } finally {
    authRepository.findActiveRefreshSession = originalFindActiveRefreshSession;
    authRepository.findUserById = originalFindUserById;
    authRepository.rotateSessionTokens = originalRotateSessionTokens;
  }
});

test("user deletion requires explicit DELETE confirmation", async () => {
  const originalPoolConnect = db.pool.connect;

  db.pool.connect = async () => {
    throw new Error("deleteUser should not connect without confirmation");
  };

  try {
    const result = await authService.deleteUser({ userId: 7, confirmation: "manager" });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
    assert.match(result.message, /DELETE/);
  } finally {
    db.pool.connect = originalPoolConnect;
  }
});

test("user deletion blocks deleting the only active Owner", async () => {
  const originalPoolConnect = db.pool.connect;
  const queries = [];
  const fakeClient = {
    query: async (sql, params = []) => {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });

      if (normalized === "BEGIN" || normalized === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes("FROM app_users") && normalized.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 7,
              username: "owner",
              display_name: "Owner",
              role: "Owner",
              email: "owner@example.invalid",
              active: true,
            },
          ],
        };
      }

      if (normalized.includes("COUNT(*)::int")) {
        return { rows: [{ count: 0 }] };
      }

      throw new Error(`Unexpected user delete query: ${normalized}`);
    },
    release: () => queries.push({ sql: "release", params: [] }),
  };

  db.pool.connect = async () => fakeClient;

  try {
    const result = await authService.deleteUser({ userId: 7, confirmation: "DELETE" });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 409);
    assert(queries.some(({ sql }) => sql === "ROLLBACK"));
    assert(!queries.some(({ sql }) => sql.startsWith("DELETE FROM app_users")));
  } finally {
    db.pool.connect = originalPoolConnect;
  }
});

test("user deletion purges sessions, user identity logs and user row in one transaction", async () => {
  const originalPoolConnect = db.pool.connect;
  const queries = [];
  const targetUser = {
    id: 7,
    username: "manager",
    display_name: "Manager User",
    role: "Manager",
    email: "manager@example.invalid",
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };
  const fakeClient = {
    query: async (sql, params = []) => {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });

      if (normalized === "BEGIN" || normalized === "COMMIT") {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes("FROM app_users") && normalized.includes("FOR UPDATE")) {
        return { rows: [targetUser], rowCount: 1 };
      }

      if (normalized.startsWith("DELETE FROM user_sessions")) {
        return { rows: [], rowCount: 2 };
      }

      if (normalized.startsWith("SET LOCAL app.allow_audit_log_purge")) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith("DELETE FROM audit_logs")) {
        assert.deepStrictEqual(params, [7, "7", "%manager%"]);
        return { rows: [], rowCount: 3 };
      }

      if (normalized.startsWith("DELETE FROM activity_logs")) {
        assert.deepStrictEqual(params, [
          JSON.stringify({ userId: 7 }),
          JSON.stringify({ username: "manager" }),
          "%manager%",
        ]);
        return { rows: [], rowCount: 4 };
      }

      if (normalized.startsWith("UPDATE ")) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith("DELETE FROM app_users")) {
        return { rows: [targetUser], rowCount: 1 };
      }

      throw new Error(`Unexpected user delete query: ${normalized}`);
    },
    release: () => queries.push({ sql: "release", params: [] }),
  };

  db.pool.connect = async () => fakeClient;

  try {
    const result = await authService.deleteUser({ userId: 7, confirmation: "DELETE" });
    const setLocalIndex = queries.findIndex(({ sql }) =>
      sql.startsWith("SET LOCAL app.allow_audit_log_purge")
    );
    const auditDeleteIndex = queries.findIndex(({ sql }) =>
      sql.startsWith("DELETE FROM audit_logs")
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.deletedUser.username, "manager");
    assert.strictEqual(result.affectedRows.userSessions, 2);
    assert.strictEqual(result.affectedRows.auditLogs, 3);
    assert.strictEqual(result.affectedRows.activityLogs, 4);
    assert(setLocalIndex > -1);
    assert(auditDeleteIndex > setLocalIndex);
    assert(queries.some(({ sql }) => sql.startsWith("DELETE FROM app_users")));
    assert(queries.some(({ sql }) => sql === "COMMIT"));
    assert(queries.some(({ sql }) => sql === "release"));
  } finally {
    db.pool.connect = originalPoolConnect;
  }
});

test("settings read permission is granted only to authenticated configured roles", () => {
  assert.strictEqual(hasPermission("Owner", "settings:read"), true);
  assert.strictEqual(hasPermission("Manager", "settings:read"), true);
  assert.strictEqual(hasPermission("Operator", "settings:read"), true);
  assert.strictEqual(hasPermission("Unknown", "settings:read"), false);
});

test("forecourt repository rejects unapproved dynamic SQL identifiers", async () => {
  const originalQuery = db.query;

  db.query = async () => {
    throw new Error("db.query should not be called for invalid identifiers");
  };

  try {
    assert.throws(
      () => forecourtRepository.insert("forecourt_tanks", {
        tank_number: "T-1",
        "current_stock = 0; DROP TABLE app_users; --": 1,
      }),
      /Column is not allowed/
    );

    assert.throws(
      () => forecourtRepository.update("forecourt_tanks", 1, {
        "health_status = 'Online', current_stock": 10,
      }),
      /Column is not allowed/
    );

    assert.throws(
      () => forecourtRepository.list("forecourt_tanks", "tank_number ASC; DROP TABLE app_users"),
      /ORDER BY clause is not allowed/
    );
  } finally {
    db.query = originalQuery;
  }
});

test("setup status reopens onboarding for legacy non-Argon2 development user", async () => {
  const originalListUsers = onboardingRepository.listUsers;
  const originalLatestWorkspace = onboardingRepository.latestWorkspace;

  onboardingRepository.listUsers = async () => [
    {
      id: 1,
      username: "owner",
      role: "Owner",
      password_hash: "legacy-development-hash",
    },
  ];
  onboardingRepository.latestWorkspace = async () => null;

  try {
    const result = await onboardingService.getSetupStatus();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.needsSetup, true);
    assert.strictEqual(result.blockedByLegacyPasswordHash, true);
    assert.strictEqual(result.blockedByIncompleteOnboarding, true);
    assert.strictEqual(result.hasWorkspace, false);
  } finally {
    onboardingRepository.listUsers = originalListUsers;
    onboardingRepository.latestWorkspace = originalLatestWorkspace;
  }
});

test("setup status reopens onboarding when users exist without workspace", async () => {
  const originalListUsers = onboardingRepository.listUsers;
  const originalLatestWorkspace = onboardingRepository.latestWorkspace;

  onboardingRepository.listUsers = async () => [
    {
      id: 1,
      username: "owner",
      role: "Owner",
      password_hash: "$argon2id$v=19$m=65536,t=3,p=4$hash",
    },
  ];
  onboardingRepository.latestWorkspace = async () => null;

  try {
    const result = await onboardingService.getSetupStatus();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.needsSetup, true);
    assert.strictEqual(result.blockedByLegacyPasswordHash, false);
    assert.strictEqual(result.blockedByIncompleteOnboarding, true);
    assert.match(result.message, /incomplete/);
  } finally {
    onboardingRepository.listUsers = originalListUsers;
    onboardingRepository.latestWorkspace = originalLatestWorkspace;
  }
});

test("development onboarding reset recreates owner through Argon2-only account service", async () => {
  const originalListUsers = onboardingRepository.listUsers;
  const originalLatestWorkspace = onboardingRepository.latestWorkspace;
  const originalReset = onboardingRepository.resetDevelopmentOnboardingData;
  const originalClearSeededForecourt = onboardingRepository.clearSeededForecourt;
  const originalCreateTank = onboardingRepository.createTank;
  const originalCreateDispenser = onboardingRepository.createDispenser;
  const originalCreateNozzle = onboardingRepository.createNozzle;
  const originalCreateShift = onboardingRepository.createShift;
  const originalCreateWorkspace = onboardingRepository.createWorkspace;
  const originalUpsertStationSetting = onboardingRepository.upsertStationSetting;
  const originalCreateUserWithPassword = userAccountService.createUserWithPassword;
  const originalPoolConnect = db.pool.connect;
  const originalActivityLog = activityLogService.logActivity;
  const originalAuditLog = auditService.logAudit;
  const originalLoggerWarn = logger.warn;
  const originalNodeEnv = process.env.NODE_ENV;
  const calls = [];
  const fakeClient = {
    query: async (sql) => {
      calls.push(["query", sql]);
      return { rows: [] };
    },
    release: () => calls.push(["release"]),
  };

  process.env.NODE_ENV = "development";
  db.pool.connect = async () => fakeClient;
  onboardingRepository.listUsers = async () => [
    {
      id: 1,
      username: "owner",
      role: "Owner",
      password_hash: "legacy-development-hash",
    },
  ];
  onboardingRepository.latestWorkspace = async () => null;
  onboardingRepository.resetDevelopmentOnboardingData = async () => calls.push(["reset"]);
  onboardingRepository.clearSeededForecourt = async () => calls.push(["clear"]);
  onboardingRepository.createTank = async () => ({ rows: [{ id: 11 }] });
  onboardingRepository.createDispenser = async () => ({ rows: [{ id: 21 }] });
  onboardingRepository.createNozzle = async () => ({ rows: [{ id: 31 }] });
  onboardingRepository.createShift = async () => ({ rows: [{ id: 41 }] });
  onboardingRepository.createWorkspace = async () => ({
    rows: [
      {
        id: 51,
        pump_name: "Test Pump",
        dealer_name: "Release Audit Dealer",
        company: "IndianOil",
        state: "West Bengal",
        district: "Kolkata",
        address: "Release Audit Road",
        contact_number: "9000000001",
        email: "release-audit@example.invalid",
        theme_key: "indianOil",
      },
    ],
  });
  onboardingRepository.upsertStationSetting = async () => ({ rows: [] });
  userAccountService.createUserWithPassword = async ({ password, role }) => {
    calls.push(["createUserWithPassword", password, role]);
    return {
      rows: [
        {
          id: 7,
          username: "owner",
          display_name: "Owner User",
          role: "Owner",
        },
      ],
    };
  };
  activityLogService.logActivity = async () => {};
  auditService.logAudit = async () => {};
  logger.warn = () => {};

  try {
    const result = await onboardingService.registerPumpWorkspace({
      pump: {
        pumpName: "Test Pump",
        dealerName: "Release Audit Dealer",
        company: "IndianOil",
        state: "West Bengal",
        district: "Kolkata",
        address: "Release Audit Road",
        contactNumber: "9000000001",
        email: "release-audit@example.invalid",
        outletType: "KSK",
      },
      owner: {
        firstName: "Owner",
        lastName: "User",
        email: "owner@example.com",
        username: "owner",
        password: "StrongPass123",
        confirmPassword: "StrongPass123",
        securityQuestion: "Question",
        securityAnswer: "Answer",
        recoveryEmail: "owner@example.com",
        recoveryPhone: "9000000001",
      },
      structure: {
        products: [{ code: "MS", name: "MS" }],
        tanks: [{ tankId: "T-1", capacity: 10000, product: "MS" }],
        dispensers: [{ dispenserId: "D-1", manufacturer: "Wayne" }],
        nozzles: [{ nozzleId: "N-1", dispenserId: "D-1", product: "MS", tankId: "T-1" }],
        shiftStructure: { count: 1 },
        staffRoles: ["Owner"],
      },
      business: {},
      backup: {},
    });

    assert.strictEqual(result.ok, true);
    assert(calls.some(([name]) => name === "reset"));
    assert(calls.some(([name, password, role]) =>
      name === "createUserWithPassword" &&
      password === "StrongPass123" &&
      role === "Owner"
    ));
    assert(calls.some(([name, sql]) => name === "query" && sql === "COMMIT"));
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    db.pool.connect = originalPoolConnect;
    onboardingRepository.listUsers = originalListUsers;
    onboardingRepository.latestWorkspace = originalLatestWorkspace;
    onboardingRepository.resetDevelopmentOnboardingData = originalReset;
    onboardingRepository.clearSeededForecourt = originalClearSeededForecourt;
    onboardingRepository.createTank = originalCreateTank;
    onboardingRepository.createDispenser = originalCreateDispenser;
    onboardingRepository.createNozzle = originalCreateNozzle;
    onboardingRepository.createShift = originalCreateShift;
    onboardingRepository.createWorkspace = originalCreateWorkspace;
    onboardingRepository.upsertStationSetting = originalUpsertStationSetting;
    userAccountService.createUserWithPassword = originalCreateUserWithPassword;
    activityLogService.logActivity = originalActivityLog;
    auditService.logAudit = originalAuditLog;
    logger.warn = originalLoggerWarn;
  }
});

const run = async () => {
  let passed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      console.error(error);
      process.exit(1);
    }
  }

  console.log(`${passed}/${tests.length} tests passed.`);
};

run();
