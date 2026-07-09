require("../config/loadEnv");

const db = require("../db");

const preserveTables = new Set([
  "app_users",
  "pump_workspaces",
  "user_sessions",
  "schema_migrations",
]);

const resetTables = [
  "dsr_product_rows",
  "dsr_collections",
  "dsr_expenses",
  "dsr_records",
  "export_history",
  "report_history",
  "print_history",
  "backup_history",
  "restore_history",
  "restore_approvals",
  "audit_logs",
  "activity_logs",
  "automation_sync_logs",
  "automation_tank_mappings",
  "automation_nozzle_mappings",
  "automation_connections",
  "device_sync_history",
  "device_mappings",
  "device_nozzles",
  "device_tanks",
  "forecourt_nozzles",
  "forecourt_pumps",
  "forecourt_islands",
  "forecourt_tanks",
  "tank_readings",
  "tank_alerts",
  "device_statuses",
  "shift_records",
  "shift_configs",
  "day_end_records",
  "alarms",
  "dry_stock_movements",
  "dry_stock_items",
  "attendant_sales",
  "attendants",
  "station_settings",
  "numbering_sequences",
];

const quoteIdent = (identifier) =>
  `"${String(identifier).replace(/"/g, '""')}"`;

const tableExists = async (tableName) => {
  const result = await db.query(
    "SELECT to_regclass($1) AS table_name",
    [`public.${tableName}`]
  );

  return Boolean(result.rows[0]?.table_name);
};

const countRows = async (tableName) => {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM ${quoteIdent(tableName)}`
  );

  return result.rows[0]?.count || 0;
};

const main = async () => {
  const existingTables = [];

  for (const table of resetTables) {
    if (preserveTables.has(table)) {
      throw new Error(`Refusing to reset preserved table: ${table}`);
    }

    if (await tableExists(table)) {
      existingTables.push(table);
    }
  }

  const before = {};
  for (const table of existingTables) {
    before[table] = await countRows(table);
  }

  if (process.argv.includes("--dry-run")) {
    console.log("Dry run. Tables that would be cleared:");
    for (const table of existingTables) {
      console.log(`${table}: ${before[table]}`);
    }
    return;
  }

  if (!process.argv.includes("--confirm")) {
    throw new Error("Pass --confirm to clear operational data.");
  }

  await db.query("BEGIN");
  try {
    const tableList = existingTables.map(quoteIdent).join(", ");
    if (tableList) {
      await db.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  const preservedCounts = {};
  for (const table of preserveTables) {
    if (await tableExists(table)) {
      preservedCounts[table] = await countRows(table);
    }
  }

  console.log("Cleared operational data.");
  console.log("Cleared tables:");
  for (const table of existingTables) {
    console.log(`${table}: ${before[table]} -> 0`);
  }
  console.log("Preserved tables:");
  for (const [table, count] of Object.entries(preservedCounts)) {
    console.log(`${table}: ${count}`);
  }
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
