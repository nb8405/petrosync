const express = require("express");
const forecourtService = require("../services/forecourtService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

router.get("/", requireAuth, requirePermission("tank:read"), async (req, res, next) => {
  try {
    res.json(await forecourtService.listTankAlerts());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
