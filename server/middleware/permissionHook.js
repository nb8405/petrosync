const { hasPermission } = require("../security/roles");

const requirePermission = (permission) => (req, res, next) => {
  req.requiredPermission = permission;

  if (req.user) {
    if (hasPermission(req.user.role, permission)) {
      return next();
    }

    return res.status(403).json({
      ok: false,
      message: "You do not have permission to perform this action.",
    });
  }

  return res.status(401).json({
    ok: false,
    message: "Authentication is required.",
  });
};

module.exports = {
  requirePermission,
};
