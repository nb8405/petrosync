const fs = require("fs");
const path = require("path");
const appConfig = require("../config/appConfig");
const operationsRepository = require("../repositories/operationsRepository");
const reportingService = require("./reportingService");
const numberingService = require("./numberingService");
const activityLogService = require("./activityLogService");
const auditService = require("./auditService");

const ensureExportDir = () => {
  fs.mkdirSync(appConfig.export.directory, { recursive: true });
};

const csvFormulaPattern = /^[=+\-@\t\r]/;

const escapeCsvCell = (cell) => {
  const value = String(cell ?? "");
  const safeValue = csvFormulaPattern.test(value) ? `'${value}` : value;

  return `"${safeValue.replace(/"/g, '""')}"`;
};

const buildCsv = (report) => {
  const rows = [
    ["Product", "Opening", "Closing", "Testing", "Receipt", "Sales Liters", "Rate", "Amount", "Closing Stock"],
    ...report.products.map((product) => [
      product.productLabel,
      product.openingReading,
      product.closingReading,
      product.testingQty,
      product.receiptQty,
      product.salesLiters,
      product.rate,
      product.amount,
      product.closingStock,
    ]),
    [],
    ["Total Sales", report.totals.totalSales],
    ["Total Collections", report.totals.totalCollections],
    ["Total Expenses", report.totals.totalExpenses],
    ["Net Cash", report.totals.netCash],
  ];

  return rows
    .map((row) =>
      row
        .map(escapeCsvCell)
        .join(",")
    )
    .join("\n");
};

const exportReport = async ({
  exportType,
  fromDate,
  toDate,
  productKey = "overall",
}) => {
  const normalizedExportType = String(exportType || "").toLowerCase();

  if (!["pdf", "excel"].includes(normalizedExportType)) {
    return {
      ok: false,
      message: "exportType must be pdf or excel.",
    };
  }

  const report = await reportingService.buildReport({
    fromDate,
    toDate,
    productKey,
  });

  if (!report.ok) {
    return report;
  }

  ensureExportDir();

  const exportReference = await numberingService.nextExportReference();
  const extension = normalizedExportType === "excel" ? "csv" : "json";
  const filePath = path.join(
    appConfig.export.directory,
    `${exportReference}.${extension}`
  );
  const fileBody =
    normalizedExportType === "excel"
      ? buildCsv(report)
      : JSON.stringify(report.printPayload, null, 2);

  fs.writeFileSync(filePath, fileBody, "utf8");

  await operationsRepository.createExportHistory({
    exportReference,
    exportType: normalizedExportType,
    reportType: report.reportType,
    productKey,
    fromDate,
    toDate,
    status: "success",
    filePath,
    message: `${normalizedExportType.toUpperCase()} export completed.`,
  });

  await activityLogService.logActivity({
    activityType: "export",
    moduleName: "export",
    status: "success",
    message: `${normalizedExportType.toUpperCase()} export completed.`,
    details: {
      exportReference,
      productKey,
      fromDate,
      toDate,
      fileName: path.basename(filePath),
    },
  });

  await auditService.logAudit({
    actionType: "export:create",
    moduleName: "export",
    entityType: "export_history",
    entityId: exportReference,
    newValue: {
      exportReference,
      exportType: normalizedExportType,
      productKey,
      fromDate,
      toDate,
      fileName: path.basename(filePath),
    },
    details: {
      exportReference,
      productKey,
      fromDate,
      toDate,
      fileName: path.basename(filePath),
    },
  });

  return {
    ok: true,
    exportReference,
    exportType: normalizedExportType,
    fileName: path.basename(filePath),
    report,
  };
};

const createPrintReference = async ({ fromDate, toDate, productKey = "overall" }) => {
  const report = await reportingService.buildReport({
    fromDate,
    toDate,
    productKey,
  });

  if (!report.ok) {
    return report;
  }

  const printReference = await numberingService.nextPrintReference();

  await operationsRepository.createPrintHistory({
    printReference,
    reportType: report.reportType,
    productKey,
    fromDate,
    toDate,
    status: "success",
    message: "Print reference generated.",
  });

  await activityLogService.logActivity({
    activityType: "print",
    moduleName: "print",
    status: "success",
    message: "Print reference generated.",
    details: {
      printReference,
      productKey,
      fromDate,
      toDate,
    },
  });

  await auditService.logAudit({
    actionType: "print:create",
    moduleName: "print",
    entityType: "print_history",
    entityId: printReference,
    newValue: {
      printReference,
      productKey,
      fromDate,
      toDate,
    },
    details: {
      printReference,
      productKey,
      fromDate,
      toDate,
    },
  });

  return {
    ok: true,
    printReference,
    report,
  };
};

module.exports = {
  exportReport,
  createPrintReference,
  escapeCsvCell,
};
