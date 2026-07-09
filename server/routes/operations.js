const express = require("express");
const appConfig = require("../config/appConfig");
const numberingService = require("../services/numberingService");
const backupService = require("../services/backupService");
const restoreService = require("../services/restoreService");
const exportService = require("../services/exportService");
const activityLogService = require("../services/activityLogService");
const auditService = require("../services/auditService");
const validationService = require("../services/validationService");
const healthService = require("../services/healthService");
const automationService = require("../services/automationService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

router.use(requireAuth);

router.post("/numbering/:type", requirePermission("numbering:create"), async (req, res, next) => {
  try {
    const generators = {
      dsr: numberingService.nextDsrNumber,
      report: numberingService.nextReportNumber,
      print: numberingService.nextPrintReference,
      export: numberingService.nextExportReference,
    };
    const generator = generators[req.params.type];

    if (!generator) {
      return res.status(400).json({
        ok: false,
        message: "type must be dsr, report, print, or export.",
      });
    }

    return res.json({
      ok: true,
      value: await generator(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/backups/manual", requirePermission("backup:create"), async (req, res, next) => {
  try {
    return res.json(
      await backupService.createManualBackup({
        requestedBy: req.user.id,
        user: req.user,
        ipAddress:
          req.ip ||
          req.headers["x-forwarded-for"] ||
          req.socket?.remoteAddress ||
          null,
        backupMode: req.body.backupMode || req.body.mode || "full",
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/backups", requirePermission("backup:read"), async (req, res, next) => {
  try {
    const history = await backupService.listBackupHistory({
      limit: req.query.limit,
    });
    return res.json({
      ok: true,
      backups: history.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/backups/status", requirePermission("backup:read"), async (req, res, next) => {
  try {
    return res.json(await backupService.getBackupStatus());
  } catch (error) {
    next(error);
  }
});

router.post("/restore/request", requirePermission("restore:approve"), async (req, res, next) => {
  try {
    const result = await restoreService.requestRestoreApproval({
      filePath: req.body.filePath,
      requestedBy: req.user.id,
    });

    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/restore/approve", requirePermission("restore:approve"), async (req, res, next) => {
  try {
    const result = await restoreService.approveRestore({
      restoreNumber: req.body.restoreNumber,
      approvedBy: req.user.id,
    });

    return res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/restore/run", requirePermission("restore:run"), async (req, res, next) => {
  try {
    const result = await restoreService.restoreFromBackup({
      restoreNumber: req.body.restoreNumber,
      runBy: req.user.id,
    });

    return res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/restore/approvals", requirePermission("restore:read"), async (req, res, next) => {
  try {
    const approvals = await restoreService.listRestoreApprovals({
      status: req.query.status,
      limit: req.query.limit,
    });

    return res.json({
      ok: true,
      approvals: approvals.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/exports", requirePermission("export:create"), async (req, res, next) => {
  try {
    const result = await exportService.exportReport({
      exportType: req.body.exportType,
      fromDate: req.body.fromDate,
      toDate: req.body.toDate,
      productKey: req.body.product || "overall",
    });

    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/prints", requirePermission("print:create"), async (req, res, next) => {
  try {
    const result = await exportService.createPrintReference({
      fromDate: req.body.fromDate,
      toDate: req.body.toDate,
      productKey: req.body.product || "overall",
    });

    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/logs/activity", requirePermission("logs:read"), async (req, res, next) => {
  try {
    const logs = await activityLogService.listActivityLogs({
      activityType: req.query.activityType,
      status: req.query.status,
      limit: req.query.limit,
    });

    return res.json({
      ok: true,
      logs: logs.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/logs/audit", requirePermission("logs:read"), async (req, res, next) => {
  try {
    const logs = await auditService.listAuditLogs({
      moduleName: req.query.moduleName,
      actionType: req.query.actionType,
      limit: req.query.limit,
    });

    return res.json({
      ok: true,
      logs: logs.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/validate/dsr", requirePermission("operations:validate"), (req, res) => {
  const result = validationService.validateDsrPayload(req.body);
  return res.status(result.ok ? 200 : 400).json(result);
});

router.get("/health", requirePermission("health:read"), async (req, res, next) => {
  try {
    const health = await healthService.getSystemHealth();
    return res.status(health.ok ? 200 : 503).json(health);
  } catch (error) {
    next(error);
  }
});

router.get("/automation/status", requirePermission("automation:read"), (req, res) => {
  return res.json(automationService.getAutomationStatus());
});

router.get("/config", requirePermission("config:read"), (req, res) => {
  const safeConfig = {
    app: appConfig.app,
    reports: appConfig.reports,
    print: appConfig.print,
    backup: {
      automaticEnabled: appConfig.backup.automaticEnabled,
    },
    export: {
      referencePrefix: appConfig.export.referencePrefix,
    },
  };

  return res.json({
    ok: true,
    config: safeConfig,
  });
});

module.exports = router;
