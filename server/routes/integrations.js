const express = require("express");
const deviceSyncService = require("../integrations/services/deviceSyncService");
const deviceStatusService = require("../integrations/services/deviceStatusService");
const automationService = require("../services/automationService");
const automationMappingService = require("../services/automationMappingService");
const auditService = require("../services/auditService");
const activityLogService = require("../services/activityLogService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

const requireOwnerIntegrationAccess = async (req, res, next) => {
  if (req.user?.role === "Owner") {
    return next();
  }

  const details = {
    userId: req.user?.id,
    username: req.user?.username,
    role: req.user?.role,
    timestamp: new Date().toISOString(),
    action: `${req.method} ${req.originalUrl}`,
  };

  try {
    await Promise.all([
      auditService.logAudit({
        actionType: "access_denied",
        moduleName: "integrations",
        entityType: "automation_settings",
        entityId: null,
        user: req.user,
        details,
      }),
      activityLogService.logActivity({
        activityType: "integration_access_denied",
        moduleName: "integrations",
        status: "failed",
        message: "Non-owner attempted to access automation integration.",
        details,
      }),
    ]);
  } catch {
    // Denial must not depend on logging availability.
  }

  return res.status(403).json({
    ok: false,
    message: "Access Denied",
  });
};

router.use(requireAuth, requireOwnerIntegrationAccess, requirePermission("integrations:read"));

const sendResult = (res, result) =>
  res.status(result.ok ? 200 : result.status || 400).json(result);

router.get("/", async (req, res, next) => {
  try {
    return res.json(await automationService.listConnections());
  } catch (error) {
    return next(error);
  }
});

router.post("/", requirePermission("integrations:manage"), async (req, res, next) => {
  try {
    return sendResult(res, await automationService.createConnection(req.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/sync/manual", requirePermission("integrations:sync"), async (req, res, next) => {
  try {
    const result = await deviceSyncService.manualSync({
      vendor: req.body.vendor || "atos",
    });
    return res.json({
      ok: true,
      result,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/sync/status", async (req, res, next) => {
  try {
    return res.json(
      await deviceSyncService.getSyncStatus({
        vendor: req.query.vendor || "atos",
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/sync/history", (req, res) =>
  res.json(deviceSyncService.getSyncHistory())
);

router.get("/dashboard/status", async (req, res, next) => {
  try {
    return res.json(await deviceStatusService.getDashboardDeviceStatus());
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requirePermission("integrations:manage"), async (req, res, next) => {
  try {
    return sendResult(
      res,
      await automationService.updateConnection(req.params.id, req.body)
    );
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requirePermission("integrations:manage"), async (req, res, next) => {
  try {
    return sendResult(res, await automationService.deleteConnection(req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/tanks", async (req, res, next) => {
  try {
    return res.json(await automationMappingService.listTankMappings(req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/tanks", requirePermission("integrations:manage"), async (req, res, next) => {
  try {
    return sendResult(
      res,
      await automationMappingService.saveTankMappings(
        req.params.id,
        req.body.mappings || []
      )
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/nozzles", async (req, res, next) => {
  try {
    return res.json(await automationMappingService.listNozzleMappings(req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/nozzles", requirePermission("integrations:manage"), async (req, res, next) => {
  try {
    return sendResult(
      res,
      await automationMappingService.saveNozzleMappings(
        req.params.id,
        req.body.mappings || []
      )
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/test-connection", requirePermission("integrations:manage"), async (req, res, next) => {
  try {
    return sendResult(res, await automationService.testConnection(req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/sync", requirePermission("integrations:sync"), async (req, res, next) => {
  try {
    return sendResult(res, await automationService.syncConnection(req.params.id));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
