const dsrRepository = require("../repositories/dsrRepository");
const operationsRepository = require("../repositories/operationsRepository");
const { productGroups } = require("../utils/reportConfig");
const { validateReportRequestAsync } = require("../utils/reportValidation");
const numberingService = require("./numberingService");
const activityLogService = require("./activityLogService");
const auditService = require("./auditService");

const toNumber = (value) => Number(value || 0);

const mapAmountRows = (rows, keyField) =>
  rows.reduce((map, row) => {
    map[row[keyField]] = toNumber(row.amount);
    return map;
  }, {});

const totalAmount = (rows) =>
  rows.reduce((sum, row) => sum + toNumber(row.amount), 0);

const normalizeProductRow = (row) => ({
  productCode: row.product_code,
  productLabel: row.product_label,
  openingReading: toNumber(row.opening_reading),
  closingReading: toNumber(row.closing_reading),
  testingQty: toNumber(row.testing_qty),
  receiptQty: toNumber(row.receipt_qty),
  tankDip: toNumber(row.tank_dip),
  waterDip: toNumber(row.water_dip),
  salesLiters: toNumber(row.sales_liters),
  rate: toNumber(row.rate),
  amount: toNumber(row.amount),
  closingStock: toNumber(row.closing_stock),
});

const productSummaryFromRows = (productRows, groups = productGroups) =>
  Object.keys(groups)
    .filter((key) => key !== "overall")
    .map((productKey) => {
      const group = groups[productKey];
      const rows = productRows.filter((row) =>
        group.productCodes.includes(row.productCode)
      );

      return {
        productKey,
        fuelType: group.title,
        salesLiters: rows.reduce(
          (sum, row) => sum + row.salesLiters,
          0
        ),
        amount: rows.reduce((sum, row) => sum + row.amount, 0),
      };
    });

const productKeyForCode = (productCode, groups = productGroups) =>
  Object.keys(groups).find((key) => {
    const group = groups[key];
    return key !== "overall" && group.productCodes.includes(productCode);
  });

const formatDateValue = (value) => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const salesBreakdownFromRows = (rows, { periodLabel, productGroups: groups = productGroups }) => {
  const grouped = new Map();

  rows.forEach((row) => {
    const periodStart = formatDateValue(row.period_start);
    const productKey = productKeyForCode(row.product_code, groups);

    if (!productKey) {
      return;
    }

    if (!grouped.has(periodStart)) {
      grouped.set(periodStart, {
        periodStart,
        label: periodLabel(periodStart),
        totalSales: 0,
        totalLiters: 0,
        products: productSummaryFromRows([], groups),
      });
    }

    const period = grouped.get(periodStart);
    const product = period.products.find((item) => item.productKey === productKey);
    const salesLiters = toNumber(row.sales_liters);
    const amount = toNumber(row.amount);

    product.salesLiters += salesLiters;
    product.amount += amount;
    period.totalSales += amount;
    period.totalLiters += salesLiters;
  });

  return Array.from(grouped.values());
};

const monthRange = (year, month) => {
  const monthNumber = Number(month);
  const yearNumber = Number(year);

  if (!yearNumber || !monthNumber || monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  return {
    fromDate: `${yearNumber}-${String(monthNumber).padStart(2, "0")}-01`,
    toDate: `${yearNumber}-${String(monthNumber).padStart(2, "0")}-${String(
      new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate()
    ).padStart(2, "0")}`,
  };
};

const buildReport = async ({
  fromDate,
  toDate,
  productKey = "overall",
  recordHistory = true,
} = {}) => {
  const validation = await validateReportRequestAsync({
    fromDate,
    toDate,
    productKey,
  });

  if (!validation.ok) {
    return validation;
  }

  const { productGroup } = validation;
  const data = await dsrRepository.getReportRows({
    fromDate: validation.fromDate,
    toDate: validation.toDate,
    productCodes: productGroup.productCodes,
  });

  if (data.recordCount === 0) {
    return {
      ok: false,
      status: 404,
      message: "No DSR records found for the selected date range.",
    };
  }

  const productRows = data.productRows.map(normalizeProductRow);

  if (productGroup.productCodes && productRows.length === 0) {
    return {
      ok: false,
      status: 404,
      message: "No product data found for this fuel in the selected date range.",
    };
  }

  const collections = mapAmountRows(data.collections, "collection_type");
  const expenses = mapAmountRows(data.expenses, "expense_type");
  const totalSales = totalAmount(productRows);
  const totalLiters = productRows.reduce(
    (sum, row) => sum + row.salesLiters,
    0
  );
  const totalTesting = productRows.reduce(
    (sum, row) => sum + row.testingQty,
    0
  );
  const totalReceipts = productRows.reduce(
    (sum, row) => sum + row.receiptQty,
    0
  );
  const totalCollections = totalSales;
  const paymentCollections = totalAmount(data.collections);
  const totalExpenses = totalAmount(data.expenses);
  const netCash = totalCollections - totalExpenses;

  const reportNumber = recordHistory
    ? await numberingService.nextReportNumber()
    : null;

  if (recordHistory) {
    await operationsRepository.createReportHistory({
      reportNumber,
      reportType:
        validation.productKey === "overall"
          ? "Overall DSR"
          : "Product-wise DSR",
      productKey: validation.productKey,
      fromDate: validation.fromDate,
      toDate: validation.toDate,
      status: "success",
      message: "Report generated.",
    });

    await activityLogService.logActivity({
      activityType: "report_generation",
      moduleName: "reports",
      status: "success",
      message: "Report generated.",
      details: {
        reportNumber,
        productKey: validation.productKey,
        fromDate: validation.fromDate,
        toDate: validation.toDate,
      },
    });

    await auditService.logAudit({
      actionType: "report:generate",
      moduleName: "reports",
      entityType: "report_history",
      entityId: reportNumber,
      newValue: {
        reportNumber,
        productKey: validation.productKey,
        fromDate: validation.fromDate,
        toDate: validation.toDate,
        recordCount: data.recordCount,
      },
      details: {
        reportNumber,
        productKey: validation.productKey,
        fromDate: validation.fromDate,
        toDate: validation.toDate,
      },
    });
  }

  return {
    ok: true,
    reportNumber,
    reportType:
      validation.productKey === "overall"
        ? "Overall DSR"
        : "Product-wise DSR",
    fuelType:
      validation.productKey === "overall" ? "All Fuels" : productGroup.title,
    fromDate: validation.fromDate,
    toDate: validation.toDate,
    recordCount: data.recordCount,
    products: productRows,
    collections,
    expenses,
    totals: {
      totalSales,
      totalLiters,
      totalTesting,
      totalReceipts,
      totalCollections,
      paymentCollections,
      totalExpenses,
      netCash,
    },
    printPayload: {
      title:
        validation.productKey === "overall"
          ? "Overall DSR Report"
          : `${productGroup.title} DSR Report`,
      generatedAt: new Date().toISOString(),
      productRows,
      collections,
      expenses,
      totals: {
        totalSales,
        totalLiters,
        totalTesting,
        totalReceipts,
        totalCollections,
        paymentCollections,
        totalExpenses,
        netCash,
      },
    },
  };
};

const buildDailyReport = (date, productKey = "overall", options = {}) =>
  buildReport({
    fromDate: date,
    toDate: date,
    productKey,
    recordHistory: options.recordHistory,
  });

const buildMonthlyReport = ({
  year,
  month,
  productKey = "overall",
  recordHistory = true,
}) => {
  const range = monthRange(year, month);

  if (!range) {
    return Promise.resolve({
      ok: false,
      message: "year and month are required. month must be between 1 and 12.",
    });
  }

  return buildReport({
    fromDate: range.fromDate,
    toDate: range.toDate,
    productKey,
    recordHistory,
  });
};

const buildDashboard = async ({ today }) => {
  const date = today || new Date().toISOString().slice(0, 10);
  const validation = await validateReportRequestAsync({
    fromDate: date,
    toDate: date,
    productKey: "overall",
  });

  if (!validation.ok) {
    return validation;
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return {
      ok: false,
      message: "today must be a valid date.",
    };
  }

  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  const selectedMonth = monthRange(year, month);
  const yearRange = monthRange(year, 12);
  const [todayReport, monthlyReport, dailyBreakdownRows, monthlyBreakdownRows] = await Promise.all([
    buildDailyReport(date, "overall", { recordHistory: false }),
    buildMonthlyReport({
      year,
      month,
      productKey: "overall",
      recordHistory: false,
    }),
    dsrRepository.getProductSalesBreakdown({
      fromDate: selectedMonth.fromDate,
      toDate: selectedMonth.toDate,
      period: "day",
    }),
    dsrRepository.getProductSalesBreakdown({
      fromDate: `${year}-01-01`,
      toDate: yearRange.toDate,
      period: "month",
    }),
  ]);

  return {
    ok: true,
    today: todayReport.ok
      ? todayReport.totals
      : {
          totalSales: 0,
          totalCollections: 0,
          paymentCollections: 0,
          totalExpenses: 0,
          netCash: 0,
        },
    monthly: monthlyReport.ok
      ? monthlyReport.totals
      : {
          totalSales: 0,
          totalCollections: 0,
          paymentCollections: 0,
          totalExpenses: 0,
        },
    monthlyProducts: monthlyReport.ok
      ? productSummaryFromRows(monthlyReport.products, validation.productGroups)
      : [],
    products: todayReport.ok ? productSummaryFromRows(todayReport.products, validation.productGroups) : [],
    dailySales: salesBreakdownFromRows(dailyBreakdownRows, {
      periodLabel: (periodStart) =>
        new Date(`${periodStart}T00:00:00`).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
      productGroups: validation.productGroups,
    }),
    monthlySales: salesBreakdownFromRows(monthlyBreakdownRows, {
      periodLabel: (periodStart) =>
        new Date(`${periodStart}T00:00:00`).toLocaleDateString("en-IN", {
          month: "short",
        }),
      productGroups: validation.productGroups,
    }),
  };
};

module.exports = {
  buildReport,
  buildDailyReport,
  buildMonthlyReport,
  buildDashboard,
  monthRange,
  salesBreakdownFromRows,
};
