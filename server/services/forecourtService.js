const os = require("os");
const db = require("../db");
const forecourtRepository = require("../repositories/forecourtRepository");
const auditService = require("./auditService");
const activityLogService = require("./activityLogService");
const reportingService = require("./reportingService");

const numeric = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const text = (value) => String(value || "").trim();

const userDetails = (user) => ({
  userId: user?.id || null,
  username: user?.username || null,
  role: user?.role || null,
});

const logMutation = async ({
  action,
  moduleName,
  entityType,
  entityId,
  user,
  oldValue = null,
  newValue = null,
  details = {},
}) => {
  await Promise.all([
    auditService.logAudit({
      actionType: action,
      moduleName,
      entityType,
      entityId: entityId ? String(entityId) : null,
      user,
      oldValue,
      newValue,
      details: {
        ...userDetails(user),
        ...details,
      },
    }),
    activityLogService.logActivity({
      activityType: `${moduleName}:${action}`,
      moduleName,
      status: "success",
      message: `${moduleName} ${action}`,
      details: {
        ...userDetails(user),
        ...details,
      },
    }),
  ]);
};

const ok = (payload = {}) => ({ ok: true, ...payload });

const createCrud = ({ table, moduleName, entityType, normalize, orderBy = "id DESC" }) => ({
  list: async () => ok({ rows: (await forecourtRepository.list(table, orderBy)).rows }),
  create: async ({ payload, user }) => {
    const result = await forecourtRepository.insert(table, normalize(payload));
    await logMutation({
      action: "create",
      moduleName,
      entityType,
      entityId: result.rows[0]?.id,
      user,
      newValue: result.rows[0],
      details: result.rows[0],
    });
    return ok({ row: result.rows[0] });
  },
  update: async ({ id, payload, user }) => {
    const existing = await forecourtRepository.findById(table, id);
    const result = await forecourtRepository.update(table, id, normalize(payload, true));
    await logMutation({
      action: "update",
      moduleName,
      entityType,
      entityId: id,
      user,
      oldValue: existing,
      newValue: result.rows[0] || null,
      details: result.rows[0],
    });
    return ok({ row: result.rows[0] || null });
  },
  remove: async ({ id, user }) => {
    const result = await forecourtRepository.remove(table, id);
    await logMutation({
      action: "delete",
      moduleName,
      entityType,
      entityId: id,
      user,
      oldValue: result.rows[0] || null,
      details: result.rows[0] || {},
    });
    return ok({ row: result.rows[0] || null });
  },
});

const islands = createCrud({
  table: "forecourt_islands",
  moduleName: "forecourt",
  entityType: "island",
  orderBy: "island_number ASC",
  normalize: (payload, partial = false) => ({
    island_number: partial && payload.islandNumber === undefined ? undefined : text(payload.islandNumber),
    island_name: partial && payload.islandName === undefined ? undefined : text(payload.islandName),
    vehicle_type: partial && payload.vehicleType === undefined ? undefined : payload.vehicleType || "Mixed",
    is_active: payload.isActive,
  }),
});

const pumps = {
  ...createCrud({
    table: "forecourt_pumps",
    moduleName: "forecourt",
    entityType: "pump",
    orderBy: "pump_number ASC",
    normalize: (payload, partial = false) => ({
      pump_number: partial && payload.pumpNumber === undefined ? undefined : text(payload.pumpNumber),
      manufacturer: partial && payload.manufacturer === undefined ? undefined : payload.manufacturer || "Other",
      model: partial && payload.model === undefined ? undefined : text(payload.model),
      automation_id: partial && payload.automationId === undefined ? undefined : text(payload.automationId),
      atg_id: partial && payload.atgId === undefined ? undefined : text(payload.atgId),
      atos_id: partial && payload.atosId === undefined ? undefined : text(payload.atosId),
      status: partial && payload.status === undefined ? undefined : payload.status || "Offline",
      island_id: payload.islandId === "" ? null : payload.islandId,
    }),
  }),
  list: async () => ok({ rows: (await forecourtRepository.listPumpsWithIsland()).rows }),
};

const nozzles = {
  ...createCrud({
    table: "forecourt_nozzles",
    moduleName: "forecourt",
    entityType: "nozzle",
    orderBy: "nozzle_number ASC",
    normalize: (payload, partial = false) => {
      const opening = numeric(payload.openingReading);
      const closing = numeric(payload.closingReading);
      const testing = numeric(payload.testingQuantity);
      const totalSales = Math.max(closing - opening - testing, 0);

      return {
        pump_id: partial && payload.pumpId === undefined ? undefined : payload.pumpId,
        nozzle_number: partial && payload.nozzleNumber === undefined ? undefined : text(payload.nozzleNumber),
        product_type: partial && payload.productType === undefined ? undefined : payload.productType || "MS",
        tank_id: payload.tankId === "" ? null : payload.tankId,
        automation_id: partial && payload.automationId === undefined ? undefined : text(payload.automationId),
        atg_id: partial && payload.atgId === undefined ? undefined : text(payload.atgId),
        atos_id: partial && payload.atosId === undefined ? undefined : text(payload.atosId),
        current_meter_reading: payload.currentMeterReading === undefined ? undefined : numeric(payload.currentMeterReading),
        opening_reading: payload.openingReading === undefined ? undefined : opening,
        closing_reading: payload.closingReading === undefined ? undefined : closing,
        testing_quantity: payload.testingQuantity === undefined ? undefined : testing,
        total_sales: payload.totalSales === undefined ? totalSales : numeric(payload.totalSales),
      };
    },
  }),
  list: async () => ok({ rows: (await forecourtRepository.listNozzlesWithPump()).rows }),
};

const tanks = {
  ...createCrud({
    table: "forecourt_tanks",
    moduleName: "tank",
    entityType: "tank",
    orderBy: "tank_number ASC",
    normalize: (payload, partial = false) => ({
      tank_number: partial && payload.tankNumber === undefined ? undefined : text(payload.tankNumber),
      product_type: partial && payload.productType === undefined ? undefined : payload.productType || "MS",
      automation_id: partial && payload.automationId === undefined ? undefined : text(payload.automationId),
      atg_id: partial && payload.atgId === undefined ? undefined : text(payload.atgId),
      atos_id: partial && payload.atosId === undefined ? undefined : text(payload.atosId),
      capacity: payload.capacity === undefined ? undefined : numeric(payload.capacity),
      current_stock: payload.currentStock === undefined ? undefined : numeric(payload.currentStock),
      water_level: payload.waterLevel === undefined ? undefined : numeric(payload.waterLevel),
      temperature: payload.temperature === undefined ? undefined : numeric(payload.temperature, null),
      safe_capacity_percentage: payload.safeCapacityPercentage === undefined ? undefined : numeric(payload.safeCapacityPercentage, 90),
      reorder_level: payload.reorderLevel === undefined ? undefined : numeric(payload.reorderLevel),
      health_status: payload.healthStatus || undefined,
    }),
  }),
  list: async () => ok({ rows: (await forecourtRepository.listTankStatus()).rows }),
};

const createTankReading = async ({ payload, user }) => {
  const tank = await forecourtRepository.findById("forecourt_tanks", payload.tankId);

  if (!tank) {
    return { ok: false, status: 404, message: "Tank not found." };
  }

  const reading = await forecourtRepository.insert("tank_readings", {
    tank_id: payload.tankId,
    reading_source: payload.readingSource || "manual",
    product_type: payload.productType || tank.product_type,
    current_stock: numeric(payload.currentStock),
    water_level: numeric(payload.waterLevel),
    temperature: payload.temperature === undefined ? null : numeric(payload.temperature),
    created_by: user?.id || null,
  });

  await forecourtRepository.update("forecourt_tanks", payload.tankId, {
    current_stock: numeric(payload.currentStock),
    water_level: numeric(payload.waterLevel),
    temperature: payload.temperature === undefined ? tank.temperature : numeric(payload.temperature),
    last_reading_at: new Date(),
    health_status:
      numeric(payload.currentStock) <= numeric(tank.reorder_level)
        ? "Warning"
        : "Online",
  });

  if (numeric(payload.currentStock) <= numeric(tank.reorder_level)) {
    await createAlarm({
      payload: {
        alarmType: "Low Tank Stock",
        severity: "High",
        sourceType: "tank",
        sourceId: String(payload.tankId),
        message: `${tank.tank_number} stock is below reorder level.`,
      },
      user,
    });
  }

  await logMutation({
    action: "create",
    moduleName: "tank",
    entityType: "reading",
    entityId: reading.rows[0]?.id,
    user,
    oldValue: tank,
    newValue: reading.rows[0],
  });

  return ok({ row: reading.rows[0] });
};

const listTankAlerts = async () => ok({ rows: (await forecourtRepository.list("tank_alerts", "created_at DESC")).rows });

const createDeviceStatus = async ({ payload, user }) => {
  const result = await forecourtRepository.upsertDeviceStatus({
    deviceType: payload.deviceType,
    deviceName: payload.deviceName,
    status: payload.status || "Offline",
    message: payload.message,
  });

  if (payload.status === "Offline" && ["Pump", "Network", "Database"].includes(payload.deviceType)) {
    await createAlarm({
      payload: {
        alarmType:
          payload.deviceType === "Pump"
            ? "Pump Offline"
            : payload.deviceType === "Network"
            ? "Network Error"
            : "Database Error",
        severity: "High",
        sourceType: payload.deviceType,
        sourceId: payload.deviceName,
        message: `${payload.deviceName} is offline.`,
      },
      user,
    });
  }

  return ok({ row: result.rows[0] });
};

const listDeviceStatus = async () => {
  const [devices, dbCheck] = await Promise.all([
    forecourtRepository.list("device_statuses", "device_type ASC, device_name ASC"),
    db.query("SELECT 1 AS ok").then(() => true).catch(() => false),
  ]);
  const serverStatus = {
    id: "server",
    device_type: "Server",
    device_name: os.hostname(),
    status: "Online",
    message: `Uptime ${Math.round(process.uptime())}s`,
    updated_at: new Date(),
  };
  const databaseStatus = {
    id: "database",
    device_type: "Database",
    device_name: "PostgreSQL",
    status: dbCheck ? "Online" : "Offline",
    message: dbCheck ? "Connected" : "Connection failed",
    updated_at: new Date(),
  };

  return ok({ rows: [serverStatus, databaseStatus, ...devices.rows] });
};

const shifts = {
  configs: createCrud({
    table: "shift_configs",
    moduleName: "shift",
    entityType: "config",
    orderBy: "start_time ASC",
    normalize: (payload, partial = false) => ({
      shift_name: partial && payload.shiftName === undefined ? undefined : text(payload.shiftName),
      start_time: partial && payload.startTime === undefined ? undefined : payload.startTime || "06:00",
      end_time: partial && payload.endTime === undefined ? undefined : payload.endTime || "14:00",
      is_active: payload.isActive,
    }),
  }),
  records: createCrud({
    table: "shift_records",
    moduleName: "shift",
    entityType: "record",
    orderBy: "started_at DESC",
    normalize: (payload) => ({
      shift_config_id: payload.shiftConfigId || null,
      operator_id: payload.operatorId || null,
      attendant_id: payload.attendantId || null,
      shift_date: payload.shiftDate || new Date().toISOString().slice(0, 10),
      status: payload.status || "Open",
      opening_cash: numeric(payload.openingCash),
      closing_cash: numeric(payload.closingCash),
      total_sales: numeric(payload.totalSales),
      expenses: numeric(payload.expenses),
      handover_notes: payload.handoverNotes || null,
      ended_at: payload.status === "Closed" ? new Date() : null,
      created_by: payload.createdBy || null,
    }),
  }),
};

const validateDayEnd = async (date) => {
  const dsr = await db.query("SELECT * FROM dsr_records WHERE dsr_date = $1", [date]);
  const tanksEntered = await db.query("SELECT COUNT(*)::int AS count FROM tank_readings WHERE recorded_at::date = $1", [date]);
  const collections = await db.query(
    "SELECT COUNT(*)::int AS count FROM dsr_collections c JOIN dsr_records r ON r.id = c.dsr_record_id WHERE r.dsr_date = $1 AND c.amount > 0",
    [date]
  );
  const expenses = await db.query(
    "SELECT COUNT(*)::int AS count FROM dsr_expenses e JOIN dsr_records r ON r.id = e.dsr_record_id WHERE r.dsr_date = $1",
    [date]
  );

  return {
    dsrCompleted: dsr.rows.length > 0,
    tankStockEntered: tanksEntered.rows[0]?.count > 0,
    collectionsEntered: collections.rows[0]?.count > 0,
    expensesEntered: expenses.rows[0]?.count > 0,
  };
};

const completeDayEnd = async ({ payload, user }) => {
  const businessDate = payload.businessDate || new Date().toISOString().slice(0, 10);
  const validations = await validateDayEnd(businessDate);
  const valid = Object.values(validations).every(Boolean);

  if (!valid) {
    return {
      ok: false,
      status: 400,
      message: "Day end validation failed.",
      validations,
    };
  }

  const report = await reportingService.buildDailyReport(businessDate, "overall", {
    recordHistory: false,
  });
  const result = await forecourtRepository.insert("day_end_records", {
    business_date: businessDate,
    status: "Completed",
    validations,
    summary: report.ok ? report.totals : {},
    locked: true,
    completed_by: user?.id || null,
    completed_at: new Date(),
  });

  await logMutation({
    action: "complete",
    moduleName: "day_end",
    entityType: "day_end",
    entityId: result.rows[0]?.id,
    user,
    details: { businessDate },
  });

  return ok({ row: result.rows[0], report });
};

const createAlarm = async ({ payload, user }) => {
  const result = await forecourtRepository.insert("alarms", {
    alarm_type: payload.alarmType,
    severity: payload.severity || "Medium",
    source_type: payload.sourceType || null,
    source_id: payload.sourceId || null,
    status: payload.status || "Open",
    message: payload.message,
  });

  await logMutation({
    action: "create",
    moduleName: "alarm",
    entityType: "alarm",
    entityId: result.rows[0]?.id,
    user,
  });

  return ok({ row: result.rows[0] });
};

const updateAlarmStatus = async ({ id, status, user }) => {
  const fields =
    status === "Acknowledged"
      ? { status, acknowledged_by: user?.id || null, acknowledged_at: new Date() }
      : status === "Resolved"
      ? { status, resolved_by: user?.id || null, resolved_at: new Date() }
      : { status };
  const result = await forecourtRepository.update("alarms", id, fields);
  await logMutation({
    action: status.toLowerCase(),
    moduleName: "alarm",
    entityType: "alarm",
    entityId: id,
    user,
  });
  return ok({ row: result.rows[0] });
};

const inventoryItems = createCrud({
  table: "dry_stock_items",
  moduleName: "inventory",
  entityType: "item",
  orderBy: "item_name ASC",
  normalize: (payload, partial = false) => ({
    item_name: partial && payload.itemName === undefined ? undefined : text(payload.itemName),
    category: partial && payload.category === undefined ? undefined : payload.category || "Consumables",
    unit: payload.unit || undefined,
    opening_stock: payload.openingStock === undefined ? undefined : numeric(payload.openingStock),
    current_stock: payload.currentStock === undefined ? undefined : numeric(payload.currentStock),
    low_stock_level: payload.lowStockLevel === undefined ? undefined : numeric(payload.lowStockLevel),
    is_active: payload.isActive,
  }),
});

const createInventoryMovement = async ({ payload, user }) => {
  const item = await forecourtRepository.findById("dry_stock_items", payload.itemId);

  if (!item) {
    return { ok: false, status: 404, message: "Inventory item not found." };
  }

  const quantity = numeric(payload.quantity);
  const direction = payload.movementType === "Sale" ? -1 : 1;
  const result = await forecourtRepository.insert("dry_stock_movements", {
    item_id: payload.itemId,
    movement_type: payload.movementType || "Purchase",
    quantity,
    amount: numeric(payload.amount),
    movement_date: payload.movementDate || new Date().toISOString().slice(0, 10),
    notes: payload.notes || null,
    created_by: user?.id || null,
  });
  const nextStock = numeric(item.current_stock) + quantity * direction;
  await forecourtRepository.update("dry_stock_items", payload.itemId, {
    current_stock: nextStock,
  });

  if (nextStock <= numeric(item.low_stock_level)) {
    await createAlarm({
      payload: {
        alarmType: "Low Tank Stock",
        severity: "Medium",
        sourceType: "inventory",
        sourceId: String(payload.itemId),
        message: `${item.item_name} stock is below reorder level.`,
      },
      user,
    });
  }

  return ok({ row: result.rows[0], currentStock: nextStock });
};

const attendants = createCrud({
  table: "attendants",
  moduleName: "attendant",
  entityType: "attendant",
  orderBy: "name ASC",
  normalize: (payload, partial = false) => ({
    name: partial && payload.name === undefined ? undefined : text(payload.name),
    employee_id: partial && payload.employeeId === undefined ? undefined : text(payload.employeeId),
    shift_config_id: payload.shiftConfigId || null,
    assigned_pump_id: payload.assignedPumpId || null,
    is_active: payload.isActive,
  }),
});

const listSettings = async () => ok({ rows: (await forecourtRepository.list("station_settings", "section ASC")).rows });

const upsertSetting = async ({ key, section, value, user }) => {
  const existing = await db.query("SELECT * FROM station_settings WHERE setting_key = $1", [key]);

  if (existing.rows.length > 0) {
    const previous = existing.rows[0];
    const result = await forecourtRepository.update("station_settings", existing.rows[0].id, {
      section,
      value,
      updated_by: user?.id || null,
    });
    await logMutation({
      action: "update",
      moduleName: "configuration",
      entityType: "station_setting",
      entityId: existing.rows[0].id,
      user,
      oldValue: previous,
      newValue: result.rows[0],
      details: { key, section },
    });
    return ok({ row: result.rows[0] });
  }

  const result = await forecourtRepository.insert("station_settings", {
    setting_key: key,
    section,
    value,
    updated_by: user?.id || null,
  });
  await logMutation({
    action: "create",
    moduleName: "configuration",
    entityType: "station_setting",
    entityId: result.rows[0]?.id,
    user,
    newValue: result.rows[0],
    details: { key, section },
  });
  return ok({ row: result.rows[0] });
};

const getEnterpriseReports = async ({ fromDate, toDate }) => {
  const result = await forecourtRepository.getEnterpriseReport({ fromDate, toDate });
  return ok({ report: result.rows[0] });
};

const getDashboard = async () => {
  const [summary, tanksResult, alarmsResult, devicesResult] = await Promise.all([
    forecourtRepository.getDashboard(),
    tanks.list(),
    forecourtRepository.list("alarms", "created_at DESC"),
    listDeviceStatus(),
  ]);

  return ok({
    summary: summary.rows[0],
    tanks: tanksResult.rows,
    alarms: alarmsResult.rows.slice(0, 8),
    devices: devicesResult.rows,
  });
};

module.exports = {
  islands,
  pumps,
  nozzles,
  tanks,
  createTankReading,
  listTankAlerts,
  createDeviceStatus,
  listDeviceStatus,
  shifts,
  validateDayEnd,
  completeDayEnd,
  createAlarm,
  updateAlarmStatus,
  inventoryItems,
  createInventoryMovement,
  attendants,
  listSettings,
  upsertSetting,
  getEnterpriseReports,
  getDashboard,
};
