const express = require("express");
const reportingService = require("../services/reportingService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

router.get("/", requireAuth, requirePermission("dashboard:read"), async (req, res, next) => {
  try {
    const dashboard = await reportingService.buildDashboard({
      today: req.query.date,
    });

    if (!dashboard.ok) {
      return res.status(400).json(dashboard);
    }

    return res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
