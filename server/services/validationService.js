const {
  validateReportRequest,
  validateReportRequestAsync,
} = require("../utils/reportValidation");
const db = require("../db");
const { dynamicProductGroups, keyForCode } = require("../utils/reportConfig");

const isEmpty = (value) =>
  value === undefined || value === null || value === "";

const toNumber = (value) => Number(value || 0);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const allowedProductCodes = new Set(["ms", "hsdTank1", "hsdTank2", "xp95", "xg"]);
const allowedCollectionTypes = new Set(["cash", "upi", "card", "fleet", "credit"]);
const allowedExpenseTypes = new Set(["generator", "staff", "cleaning", "maintenance"]);

const configuredDsrProductCodes = async () => {
  const codes = new Set(allowedProductCodes);

  try {
    const groups = await dynamicProductGroups();
    Object.values(groups).forEach((group) => {
      (group.productCodes || []).forEach((code) => codes.add(code));
    });
  } catch {
    // Legacy product codes remain available when configuration cannot be read.
  }

  try {
    const result = await db.query(
      `
        SELECT product_type, tank_number
        FROM forecourt_tanks
        ORDER BY product_type ASC, tank_number ASC;
      `
    );
    const tankIndexByFuel = new Map();

    result.rows.forEach((tank) => {
      const key = keyForCode(tank.product_type);
      const index = tankIndexByFuel.get(key) || 0;

      if (key) {
        codes.add(index > 0 ? `${key}_tank_${index + 1}` : key);
        tankIndexByFuel.set(key, index + 1);
      }
    });
  } catch {
    // Forecourt rows are optional during first-run tests and fresh setup.
  }

  return codes;
};

const dateFromParts = (value) => {
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return {
    date,
    valid:
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day,
  };
};

const validateDate = (value, label, errors) => {
  if (!datePattern.test(String(value || ""))) {
    errors.push(`${label} must use YYYY-MM-DD format.`);
    return;
  }

  const parsed = dateFromParts(value);

  if (Number.isNaN(parsed.date.getTime()) || !parsed.valid) {
    errors.push(`${label} must be a valid date.`);
  }
};

const validateNonNegativeNumber = (value, label, errors) => {
  if (isEmpty(value)) {
    errors.push(`${label} is required.`);
    return;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    errors.push(`${label} must be a valid number.`);
    return;
  }

  if (number < 0) {
    errors.push(`${label} cannot be negative.`);
  }
};

const validateReadingSet = ({ opening, closing, testing, label }, errors) => {
  validateNonNegativeNumber(opening, `${label} opening reading`, errors);
  validateNonNegativeNumber(closing, `${label} closing reading`, errors);
  validateNonNegativeNumber(testing, `${label} testing quantity`, errors);

  if (errors.length > 0) {
    return;
  }

  const grossSales = toNumber(closing) - toNumber(opening);

  if (grossSales < 0) {
    errors.push(`${label} closing reading cannot be less than opening reading.`);
  }

  if (toNumber(testing) > grossSales) {
    errors.push(`${label} testing quantity cannot exceed gross meter sales.`);
  }
};

const validateTankValues = ({ tankDip, waterDip, receiptQty, label }, errors) => {
  validateNonNegativeNumber(tankDip, `${label} tank dip`, errors);
  validateNonNegativeNumber(waterDip || 0, `${label} water dip`, errors);
  validateNonNegativeNumber(receiptQty || 0, `${label} receipt quantity`, errors);
};

const validateDsrPayload = (payload, allowedCodes = allowedProductCodes) => {
  const errors = [];

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      errors: ["DSR payload is required."],
    };
  }

  if (!payload.dsrDate) {
    errors.push("DSR date is required.");
  } else {
    validateDate(payload.dsrDate, "DSR date", errors);
  }

  if (!Array.isArray(payload.products) || payload.products.length === 0) {
    errors.push("At least one product row is required.");
  } else if (payload.products.length > allowedCodes.size) {
    errors.push("Too many product rows were submitted.");
  }

  if (!Array.isArray(payload.collections)) {
    errors.push("collections must be an array.");
  }

  if (!Array.isArray(payload.expenses)) {
    errors.push("expenses must be an array.");
  }

  const seenProducts = new Set();

  (Array.isArray(payload.products) ? payload.products : []).forEach((product) => {
    const label = product.productLabel || product.productCode || "Product";

    if (!allowedCodes.has(product.productCode)) {
      errors.push(`${label} productCode is not supported.`);
    }

    if (seenProducts.has(product.productCode)) {
      errors.push(`${label} productCode cannot be duplicated.`);
    }

    seenProducts.add(product.productCode);

    validateReadingSet(
      {
        opening: product.openingReading,
        closing: product.closingReading,
        testing: product.testingQty,
        label,
      },
      errors
    );
    validateTankValues(
      {
        tankDip: product.tankDip || 0,
        waterDip: product.waterDip || 0,
        receiptQty: product.receiptQty || 0,
        label,
      },
      errors
    );
  });

  (Array.isArray(payload.collections) ? payload.collections : []).forEach((collection) => {
    if (!allowedCollectionTypes.has(collection.collectionType)) {
      errors.push(`${collection.collectionType || "Collection"} type is not supported.`);
    }

    validateNonNegativeNumber(
      collection.amount,
      `${collection.collectionType || "Collection"} amount`,
      errors
    );
  });

  (Array.isArray(payload.expenses) ? payload.expenses : []).forEach((expense) => {
    if (!allowedExpenseTypes.has(expense.expenseType)) {
      errors.push(`${expense.expenseType || "Expense"} type is not supported.`);
    }

    validateNonNegativeNumber(
      expense.amount,
      `${expense.expenseType || "Expense"} amount`,
      errors
    );
  });

  return {
    ok: errors.length === 0,
    errors,
    message: errors.length ? errors.slice(0, 5).join("\n") : "Valid payload.",
  };
};

const validateDsrPayloadAsync = async (payload) =>
  validateDsrPayload(payload, await configuredDsrProductCodes());

module.exports = {
  validateReportRequest,
  validateReportRequestAsync,
  validateDsrPayload,
  validateDsrPayloadAsync,
  validateReadingSet,
  validateTankValues,
};
