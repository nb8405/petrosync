const {
  dynamicProductGroups,
  productGroups,
  normalizeProductKey,
  normalizeDynamicProductKey,
} = require("./reportConfig");

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

const parseReportDate = (value, fieldName) => {
  if (!value) {
    return {
      ok: false,
      message: `${fieldName} is required.`,
    };
  }

  if (!datePattern.test(String(value))) {
    return {
      ok: false,
      message: `${fieldName} must use YYYY-MM-DD format.`,
    };
  }

  const parsed = dateFromParts(value);

  if (Number.isNaN(parsed.date.getTime()) || !parsed.valid) {
    return {
      ok: false,
      message: `${fieldName} must be a valid date.`,
    };
  }

  return {
    ok: true,
    date: parsed.date,
    value,
  };
};

const validateReportRequest = ({ fromDate, toDate, productKey }) => {
  const from = parseReportDate(fromDate, "fromDate");
  if (!from.ok) {
    return from;
  }

  const to = parseReportDate(toDate, "toDate");
  if (!to.ok) {
    return to;
  }

  if (from.date > to.date) {
    return {
      ok: false,
      message: "fromDate cannot be greater than toDate.",
    };
  }

  const normalizedProductKey = normalizeProductKey(productKey);

  if (!normalizedProductKey) {
    return {
      ok: false,
      message: "product must be one of overall, ms, hsd, xp95, xg.",
    };
  }

  return {
    ok: true,
    fromDate: from.value,
    toDate: to.value,
    productKey: normalizedProductKey,
    productGroup: productGroups[normalizedProductKey],
  };
};

const validateReportRequestAsync = async ({ fromDate, toDate, productKey }) => {
  const from = parseReportDate(fromDate, "fromDate");
  if (!from.ok) {
    return from;
  }

  const to = parseReportDate(toDate, "toDate");
  if (!to.ok) {
    return to;
  }

  if (from.date > to.date) {
    return {
      ok: false,
      message: "fromDate cannot be greater than toDate.",
    };
  }

  const groups = await dynamicProductGroups();
  const normalizedProductKey = await normalizeDynamicProductKey(productKey);

  if (!normalizedProductKey) {
    return {
      ok: false,
      message: "product must be a configured fuel or overall.",
    };
  }

  return {
    ok: true,
    fromDate: from.value,
    toDate: to.value,
    productKey: normalizedProductKey,
    productGroup: groups[normalizedProductKey],
    productGroups: groups,
  };
};

module.exports = {
  validateReportRequest,
  validateReportRequestAsync,
};
