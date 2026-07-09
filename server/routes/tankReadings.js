const express = require("express");
const forecourtService = require("../services/forecourtService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

router.post("/", requireAuth, requirePermission("tank:manage"), async (req, res, next) => {
  try {
    const result = await forecourtService.createTankReading({
      payload: req.body,
      user: req.user,
    });
    res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
