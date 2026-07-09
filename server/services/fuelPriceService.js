const fs = require("fs");
const path = require("path");
const db = require("../db");
const auditService = require("./auditService");
const activityLogService = require("./activityLogService");

const priceFile = path.join(__dirname, "..", "config", "fuelPrices.json");
const productKeys = ["ms", "hsd", "xp95", "xg"];

const keyForFuelCode = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const configuredProductKeys = async () => {
  try {
    const result = await db.query(
      `
        SELECT fuel_code
        FROM workspace_fuels
        WHERE enabled = true
        ORDER BY sort_order ASC, fuel_name ASC;
      `
    );

    return result.rows
      .map((row) => keyForFuelCode(row.fuel_code))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const activeProductKeys = async () => [
  ...new Set([...productKeys, ...(await configuredProductKeys())]),
];

const readFuelPrices = (keys = productKeys) => {
  const parsed = JSON.parse(fs.readFileSync(priceFile, "utf8"));

  return keys.reduce((prices, key) => {
    prices[key] = Number(parsed[key] || 0);
    return prices;
  }, {});
};

const validateFuelPrices = (prices, keys = productKeys) => {
  const errors = [];

  keys.forEach((key) => {
    const value = Number(prices[key]);

    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${key} price must be a non-negative number.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    message: errors.join(" "),
  };
};

const getFuelPrices = async () => {
  const keys = await activeProductKeys();

  return {
    ok: true,
    prices: readFuelPrices(keys),
  };
};

const updateFuelPrices = async ({ prices, updatedBy, user }) => {
  const keys = await activeProductKeys();
  const current = readFuelPrices(keys);
  const next = {
    ...current,
    ...keys.reduce((values, key) => {
      if (prices && Object.prototype.hasOwnProperty.call(prices, key)) {
        values[key] = Number(prices[key]);
      }
      return values;
    }, {}),
  };
  const validation = validateFuelPrices(next, keys);

  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message,
      errors: validation.errors,
    };
  }

  fs.writeFileSync(priceFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  await auditService.logAudit({
    actionType: "updated",
    moduleName: "settings",
    entityType: "fuel_prices",
    entityId: "current",
    user: user || { id: updatedBy || null },
    oldValue: current,
    newValue: next,
    details: {
      updatedBy,
      previous: current,
      current: next,
    },
  });

  await activityLogService.logActivity({
    activityType: "fuel_price_update",
    moduleName: "settings",
    status: "success",
    message: "Fuel prices updated.",
    details: {
      updatedBy,
      prices: next,
    },
  });

  return {
    ok: true,
    prices: next,
  };
};

module.exports = {
  getFuelPrices,
  updateFuelPrices,
  productKeys,
};
