const db = require("../db");

const productGroups = {
  overall: {
    title: "Overall",
    productCodes: null,
  },
  ms: {
    title: "MS",
    productCodes: ["ms"],
  },
  hsd: {
    title: "HSD",
    productCodes: ["hsdTank1", "hsdTank2"],
  },
  xp95: {
    title: "XP95",
    productCodes: ["xp95"],
  },
  xg: {
    title: "XG",
    productCodes: ["xg"],
  },
};

const keyForCode = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const labelForCode = (value) =>
  String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeProductKey = (productKey = "overall") => {
  const normalized = String(productKey).trim().toLowerCase();
  return productGroups[normalized] ? normalized : null;
};

const dynamicProductGroups = async () => {
  try {
    const result = await db.query(
      `
        SELECT fuel_code, fuel_name
        FROM workspace_fuels
        WHERE enabled = true
        ORDER BY sort_order ASC, fuel_name ASC;
      `
    );

    const configured = result.rows.reduce((groups, row) => {
      const key = keyForCode(row.fuel_code);

      if (!key || groups[key]) {
        return groups;
      }

      groups[key] = {
        title: row.fuel_name || labelForCode(row.fuel_code),
        productCodes: [key],
      };

      return groups;
    }, {});

    const groups = {
      ...productGroups,
      ...configured,
    };

    try {
      const tankResult = await db.query(
        `
          SELECT product_type, tank_number
          FROM forecourt_tanks
          ORDER BY product_type ASC, tank_number ASC;
        `
      );
      const tankIndexByFuel = new Map();

      tankResult.rows.forEach((tank) => {
        const key = keyForCode(tank.product_type);
        const index = tankIndexByFuel.get(key) || 0;
        const productCode = index > 0 ? `${key}_tank_${index + 1}` : key;

        if (!key) {
          return;
        }

        if (!groups[key]) {
          groups[key] = {
            title: labelForCode(tank.product_type),
            productCodes: [],
          };
        }

        if (!groups[key].productCodes.includes(productCode)) {
          groups[key].productCodes.push(productCode);
        }

        tankIndexByFuel.set(key, index + 1);
      });
    } catch {
      // Forecourt configuration is optional for report filter discovery.
    }

    return groups;
  } catch {
    return productGroups;
  }
};

const normalizeDynamicProductKey = async (productKey = "overall") => {
  const normalized = String(productKey).trim().toLowerCase();
  const groups = await dynamicProductGroups();

  return groups[normalized] ? normalized : null;
};

module.exports = {
  productGroups,
  normalizeProductKey,
  dynamicProductGroups,
  normalizeDynamicProductKey,
  keyForCode,
};
