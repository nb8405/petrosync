const db = require("../db");

const allowedTables = new Set([
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
  "pump_workspaces",
]);

const tablesWithUpdatedAt = new Set([
  "forecourt_islands",
  "forecourt_pumps",
  "forecourt_nozzles",
  "forecourt_tanks",
  "device_statuses",
  "shift_configs",
  "dry_stock_items",
  "attendants",
  "station_settings",
  "pump_workspaces",
]);

const tableColumns = {
  forecourt_islands: new Set([
    "island_number",
    "island_name",
    "vehicle_type",
    "is_active",
  ]),
  forecourt_pumps: new Set([
    "pump_number",
    "manufacturer",
    "model",
    "automation_id",
    "atg_id",
    "atos_id",
    "status",
    "island_id",
  ]),
  forecourt_nozzles: new Set([
    "pump_id",
    "nozzle_number",
    "product_type",
    "tank_id",
    "automation_id",
    "atg_id",
    "atos_id",
    "current_meter_reading",
    "opening_reading",
    "closing_reading",
    "testing_quantity",
    "total_sales",
  ]),
  forecourt_tanks: new Set([
    "tank_number",
    "product_type",
    "automation_id",
    "atg_id",
    "atos_id",
    "capacity",
    "current_stock",
    "water_level",
    "temperature",
    "safe_capacity_percentage",
    "reorder_level",
    "health_status",
    "last_reading_at",
  ]),
  tank_readings: new Set([
    "tank_id",
    "reading_source",
    "product_type",
    "current_stock",
    "water_level",
    "temperature",
    "created_by",
  ]),
  tank_alerts: new Set([
    "tank_id",
    "alert_type",
    "severity",
    "status",
    "message",
    "acknowledged_at",
    "resolved_at",
  ]),
  device_statuses: new Set([
    "device_type",
    "device_name",
    "status",
    "message",
    "last_seen_at",
  ]),
  shift_configs: new Set([
    "shift_name",
    "start_time",
    "end_time",
    "is_active",
  ]),
  shift_records: new Set([
    "shift_config_id",
    "operator_id",
    "attendant_id",
    "shift_date",
    "status",
    "opening_cash",
    "closing_cash",
    "total_sales",
    "expenses",
    "handover_notes",
    "ended_at",
    "created_by",
  ]),
  day_end_records: new Set([
    "business_date",
    "status",
    "validations",
    "summary",
    "locked",
    "completed_by",
    "completed_at",
  ]),
  alarms: new Set([
    "alarm_type",
    "severity",
    "source_type",
    "source_id",
    "status",
    "message",
    "acknowledged_by",
    "acknowledged_at",
    "resolved_by",
    "resolved_at",
  ]),
  dry_stock_items: new Set([
    "item_name",
    "category",
    "unit",
    "opening_stock",
    "current_stock",
    "low_stock_level",
    "is_active",
  ]),
  dry_stock_movements: new Set([
    "item_id",
    "movement_type",
    "quantity",
    "amount",
    "movement_date",
    "notes",
    "created_by",
  ]),
  attendants: new Set([
    "name",
    "employee_id",
    "shift_config_id",
    "assigned_pump_id",
    "is_active",
  ]),
  attendant_sales: new Set([
    "attendant_id",
    "shift_record_id",
    "product_type",
    "fuel_sold",
    "collection_amount",
    "sale_date",
  ]),
  station_settings: new Set([
    "setting_key",
    "section",
    "value",
    "updated_by",
  ]),
  pump_workspaces: new Set([
    "pump_name",
    "dealer_name",
    "company",
    "outlet_type",
    "state",
    "district",
    "address",
    "contact_number",
    "email",
    "logo_data_url",
    "theme_key",
    "financial_year",
    "gst_configuration",
    "tax_settings",
    "currency",
    "language",
    "date_format",
    "backup_settings",
    "products",
    "staff_roles",
    "integrations",
    "health_check",
    "launched_at",
    "created_by",
  ]),
};

const orderByClauses = new Set([
  "id DESC",
  "island_number ASC",
  "pump_number ASC",
  "nozzle_number ASC",
  "tank_number ASC",
  "created_at DESC",
  "device_type ASC, device_name ASC",
  "start_time ASC",
  "started_at DESC",
  "item_name ASC",
  "name ASC",
  "section ASC",
]);

const ensureTable = (table) => {
  if (!allowedTables.has(table)) {
    throw new Error("Table is not allowed.");
  }
};

const ensureColumn = (table, column) => {
  if (!tableColumns[table]?.has(column)) {
    throw new Error("Column is not allowed.");
  }
};

const ensureOrderBy = (orderBy) => {
  if (!orderByClauses.has(orderBy)) {
    throw new Error("ORDER BY clause is not allowed.");
  }
};

const list = (table, orderBy = "id DESC") => {
  ensureTable(table);
  ensureOrderBy(orderBy);
  return db.query(`SELECT * FROM ${table} ORDER BY ${orderBy};`);
};

const findById = async (table, id) => {
  ensureTable(table);
  const result = await db.query(`SELECT * FROM ${table} WHERE id = $1;`, [id]);
  return result.rows[0] || null;
};

const insert = (table, data) => {
  ensureTable(table);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);

  columns.forEach((column) => ensureColumn(table, column));

  if (columns.length === 0) {
    throw new Error("At least one column is required.");
  }

  return db.query(
    `
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING *;
    `,
    values
  );
};

const update = (table, id, data) => {
  ensureTable(table);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return findById(table, id).then((row) => ({ rows: row ? [row] : [] }));
  }

  entries.forEach(([column]) => ensureColumn(table, column));

  const assignments = entries.map(([key], index) => `${key} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(id);

  const updatedAtAssignment = tablesWithUpdatedAt.has(table)
    ? ", updated_at = NOW()"
    : "";

  return db.query(
    `
      UPDATE ${table}
      SET ${assignments.join(", ")}${updatedAtAssignment}
      WHERE id = $${values.length}
      RETURNING *;
    `,
    values
  );
};

const remove = (table, id) => {
  ensureTable(table);
  return db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *;`, [id]);
};

const getHierarchy = () =>
  db.query(`
    SELECT
      i.*,
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'id', p.id,
            'pump_number', p.pump_number,
            'manufacturer', p.manufacturer,
            'status', p.status,
            'nozzles', COALESCE(nozzle_data.nozzles, '[]'::jsonb)
          )
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'::jsonb
      ) AS pumps
    FROM forecourt_islands i
    LEFT JOIN forecourt_pumps p ON p.island_id = i.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(n.* ORDER BY n.nozzle_number) AS nozzles
      FROM forecourt_nozzles n
      WHERE n.pump_id = p.id
    ) nozzle_data ON true
    GROUP BY i.id
    ORDER BY i.island_number ASC;
  `);

const listPumpsWithIsland = () =>
  db.query(`
    SELECT p.*, i.island_number, i.island_name
    FROM forecourt_pumps p
    LEFT JOIN forecourt_islands i ON i.id = p.island_id
    ORDER BY p.pump_number ASC;
  `);

const listNozzlesWithPump = () =>
  db.query(`
    SELECT n.*, p.pump_number, p.manufacturer, i.island_number, i.island_name
    FROM forecourt_nozzles n
    JOIN forecourt_pumps p ON p.id = n.pump_id
    LEFT JOIN forecourt_islands i ON i.id = p.island_id
    ORDER BY p.pump_number ASC, n.nozzle_number ASC;
  `);

const listTankStatus = () =>
  db.query(`
    SELECT
      t.*,
      CASE
        WHEN t.capacity > 0 THEN ROUND((t.current_stock / t.capacity) * 100, 2)
        ELSE 0
      END AS capacity_percentage,
      CASE
        WHEN t.current_stock <= t.reorder_level THEN true
        ELSE false
      END AS low_stock
    FROM forecourt_tanks t
    ORDER BY t.tank_number ASC;
  `);

const upsertDeviceStatus = (device) =>
  db.query(
    `
      INSERT INTO device_statuses (
        device_type,
        device_name,
        status,
        message,
        last_seen_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (device_type, device_name)
      DO UPDATE SET
        status = EXCLUDED.status,
        message = EXCLUDED.message,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING *;
    `,
    [device.deviceType, device.deviceName, device.status, device.message || null]
  );

const getDashboard = () =>
  db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM forecourt_pumps WHERE status = 'Online') AS active_pumps,
      (SELECT COUNT(*)::int FROM forecourt_pumps WHERE status = 'Offline') AS offline_pumps,
      (SELECT COUNT(*)::int FROM alarms WHERE status = 'Open') AS open_alarms,
      (SELECT COUNT(*)::int FROM forecourt_tanks WHERE current_stock <= reorder_level) AS low_stock_tanks,
      COALESCE((SELECT SUM(current_stock) FROM forecourt_tanks), 0) AS fuel_stock,
      COALESCE((SELECT SUM(total_sales) FROM forecourt_nozzles), 0) AS nozzle_sales;
  `);

const getEnterpriseReport = ({ fromDate, toDate }) =>
  db.query(
    `
      SELECT
        COALESCE((SELECT SUM(amount) FROM dsr_product_rows p JOIN dsr_records r ON r.id = p.dsr_record_id WHERE r.dsr_date BETWEEN $1 AND $2), 0) AS product_sales,
        COALESCE((SELECT SUM(amount) FROM dsr_collections c JOIN dsr_records r ON r.id = c.dsr_record_id WHERE r.dsr_date BETWEEN $1 AND $2), 0) AS collections,
        COALESCE((SELECT SUM(amount) FROM dsr_expenses e JOIN dsr_records r ON r.id = e.dsr_record_id WHERE r.dsr_date BETWEEN $1 AND $2), 0) AS expenses,
        COALESCE((SELECT SUM(total_sales) FROM shift_records WHERE shift_date BETWEEN $1 AND $2), 0) AS shift_sales,
        COALESCE((SELECT SUM(collection_amount) FROM attendant_sales WHERE sale_date BETWEEN $1 AND $2), 0) AS attendant_collections;
    `,
    [fromDate, toDate]
  );

module.exports = {
  list,
  findById,
  insert,
  update,
  remove,
  getHierarchy,
  listPumpsWithIsland,
  listNozzlesWithPump,
  listTankStatus,
  upsertDeviceStatus,
  getDashboard,
  getEnterpriseReport,
};
