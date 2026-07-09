const auditService = require("../services/auditService");
const activityLogService = require("../services/activityLogService");

const requireOwner = ({ moduleName = "security", action = "owner_only_access" } = {}) =>
  async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        message: "Authentication is required.",
      });
    }

    if (req.user.role === "Owner") {
      return next();
    }

    const details = {
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action,
      path: req.originalUrl || req.url,
      method: req.method,
    };

    await Promise.all([
      auditService.logAudit({
        actionType: "access_denied",
        moduleName,
        entityType: "authorization",
        details,
      }),
      activityLogService.logActivity({
        activityType: "access_denied",
        moduleName,
        status: "failed",
        message: "Owner-only access denied.",
        details,
      }),
    ]);

    return res.status(403).json({
      ok: false,
      message: "Owner access is required for this action.",
    });
  };

module.exports = {
  requireOwner,
};
