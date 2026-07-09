const express = require("express");
const backupService = require("../services/backupService");
const restoreService = require("../services/restoreService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");
const { requireOwner } = require("../middleware/ownerOnly");

const router = express.Router();

const clientIp = (req) =>
  req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;

router.use(requireAuth);

router.get("/", requirePermission("backup:read"), async (req, res, next) => {
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

router.get("/status", requirePermission("backup:read"), async (req, res, next) => {
  try {
    return res.json(await backupService.getBackupStatus());
  } catch (error) {
    next(error);
  }
});

router.post(
  "/create",
  requireOwner({ moduleName: "backup", action: "backup:create" }),
  requirePermission("backup:create"),
  async (req, res, next) => {
    try {
      return res.json(
        await backupService.createBackup({
          user: req.user,
          ipAddress: clientIp(req),
          backupType: "manual",
          backupMode: req.body.backupMode || req.body.mode || "full",
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:id/report",
  requirePermission("backup:read"),
  async (req, res, next) => {
    try {
      const result = await backupService.getBackupReport({
        id: req.params.id,
      });

      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:id/download",
  requireOwner({ moduleName: "backup", action: "backup:download" }),
  requirePermission("backup:download"),
  async (req, res, next) => {
    try {
      const result = await backupService.prepareDownload({
        id: req.params.id,
        user: req.user,
        ipAddress: clientIp(req),
      });

      if (!result.ok) {
        return res.status(result.status || 400).json(result);
      }

      return res.download(result.filePath, result.fileName);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/verify",
  requireOwner({ moduleName: "backup", action: "backup:verify" }),
  requirePermission("backup:verify"),
  async (req, res, next) => {
    try {
      const result = await backupService.verifyBackup({
        id: req.body.id || req.body.backupId,
        fileName: req.body.fileName,
        user: req.user,
        ipAddress: clientIp(req),
      });

      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/restore",
  requireOwner({ moduleName: "restore", action: "backup:restore" }),
  requirePermission("backup:restore"),
  async (req, res, next) => {
    try {
      const result = await restoreService.restoreBackupPackage({
        backupId: req.body.backupId || req.body.id,
        fileName: req.body.fileName,
        fileBase64: req.body.fileBase64,
        uploadFileName: req.body.uploadFileName,
        ownerPassword: req.body.ownerPassword,
        confirmation: req.body.confirmation,
        user: req.user,
        ipAddress: clientIp(req),
      });

      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:id",
  requireOwner({ moduleName: "backup", action: "backup:delete" }),
  requirePermission("backup:delete"),
  async (req, res, next) => {
    try {
      const result = await backupService.deleteBackup({
        id: req.params.id,
        user: req.user,
        ipAddress: clientIp(req),
      });

      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/schedule",
  requireOwner({ moduleName: "backup", action: "backup:schedule" }),
  requirePermission("backup:schedule"),
  async (req, res, next) => {
    try {
      const result = await backupService.updateSchedule({
        schedule: req.body,
        user: req.user,
        ipAddress: clientIp(req),
      });

      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
