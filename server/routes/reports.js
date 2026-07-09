const express = require("express");
const reportingService = require("../services/reportingService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

router.use(requireAuth, requirePermission("reports:read"));

const sendReport = (res, report) => {
  if (!report.ok) {
    return res.status(report.status || 400).json(report);
  }

  return res.json(report);
};

const shouldRecordHistory = (value) => value !== "false";

router.get("/daily", async (req, res, next) => {
  try {
    const report = await reportingService.buildDailyReport(
      req.query.date,
      req.query.product || "overall",
      { recordHistory: shouldRecordHistory(req.query.recordHistory) }
    );
    sendReport(res, report);
  } catch (error) {
    next(error);
  }
});

router.get("/range", async (req, res, next) => {
  try {
    const report = await reportingService.buildReport({
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      productKey: req.query.product || "overall",
      recordHistory: shouldRecordHistory(req.query.recordHistory),
    });
    sendReport(res, report);
  } catch (error) {
    next(error);
  }
});

router.get("/monthly", async (req, res, next) => {
  try {
    const report = await reportingService.buildMonthlyReport({
      year: req.query.year,
      month: req.query.month,
      productKey: req.query.product || "overall",
      recordHistory: shouldRecordHistory(req.query.recordHistory),
    });
    sendReport(res, report);
  } catch (error) {
    next(error);
  }
});

router.get("/print-data", async (req, res, next) => {
  try {
    const report = await reportingService.buildReport({
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      productKey: req.query.product || "overall",
    });
    sendReport(res, report);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
