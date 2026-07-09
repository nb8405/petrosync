const express = require("express");
const forecourtService = require("../services/forecourtService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

router.use(requireAuth);

router.get("/", requirePermission("tank:read"), async (req, res, next) => {
  try {
    res.json(await forecourtService.tanks.list());
  } catch (error) {
    next(error);
  }
});

router.post("/", requirePermission("tank:manage"), async (req, res, next) => {
  try {
    const result = await forecourtService.tanks.create({ payload: req.body, user: req.user });
    res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requirePermission("tank:manage"), async (req, res, next) => {
  try {
    const result = await forecourtService.tanks.update({ id: req.params.id, payload: req.body, user: req.user });
    res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requirePermission("tank:manage"), async (req, res, next) => {
  try {
    const result = await forecourtService.tanks.remove({ id: req.params.id, user: req.user });
    res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
