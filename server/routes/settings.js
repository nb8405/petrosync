const express = require("express");
const fuelPriceService = require("../services/fuelPriceService");
const fuelMasterService = require("../services/fuelMasterService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

router.use(requireAuth);

router.get("/fuel-prices", requirePermission("settings:read"), async (req, res, next) => {
  try {
    res.json(await fuelPriceService.getFuelPrices());
  } catch (error) {
    next(error);
  }
});

router.put(
  "/fuel-prices",
  requirePermission("settings:manage"),
  async (req, res, next) => {
    try {
      const result = await fuelPriceService.updateFuelPrices({
        prices: req.body.prices || {},
        updatedBy: req.user?.id || null,
        user: req.user,
      });

      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/fuels", requirePermission("settings:read"), async (req, res, next) => {
  try {
    res.json(await fuelMasterService.listWorkspaceFuels());
  } catch (error) {
    next(error);
  }
});

router.post("/fuels", requirePermission("settings:manage"), async (req, res, next) => {
  try {
    const result = await fuelMasterService.createWorkspaceFuel({
      fuelCode: req.body.fuelCode,
      fuelName: req.body.fuelName,
    });

    res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (error) {
    next(error);
  }
});

router.put("/fuels/:id", requirePermission("settings:manage"), async (req, res, next) => {
  try {
    const result = await fuelMasterService.updateWorkspaceFuel({
      id: req.params.id,
      fuelName: req.body.fuelName,
      enabled: req.body.enabled,
    });

    res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
