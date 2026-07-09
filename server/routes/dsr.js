const express = require("express");
const dsrService = require("../services/dsrService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");
const { requireOwner } = require("../middleware/ownerOnly");

const router = express.Router();

const sendResult = (res, result) =>
  res.status(result.ok ? 200 : result.status || 400).json(result);

router.post("/", requireAuth, requirePermission("dsr:create"), async (req, res, next) => {
  try {
    sendResult(res, await dsrService.createDsr(req.body, req.user));
  } catch (error) {
    next(error);
  }
});

router.get("/history/list", requireAuth, requirePermission("dsr:read"), async (req, res, next) => {
  try {
    sendResult(
      res,
      await dsrService.listDsrHistory({
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        productKey: req.query.product || "overall",
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/:date", requireAuth, requirePermission("dsr:read"), async (req, res, next) => {
  try {
    sendResult(res, await dsrService.getDsr(req.params.date));
  } catch (error) {
    next(error);
  }
});

router.put("/:date", requireAuth, requirePermission("dsr:update"), async (req, res, next) => {
  try {
    sendResult(res, await dsrService.updateDsr(req.params.date, req.body, req.user));
  } catch (error) {
    next(error);
  }
});

router.delete(
  "/:date",
  requireAuth,
  requireOwner({ moduleName: "dsr", action: "delete_dsr" }),
  requirePermission("dsr:delete"),
  async (req, res, next) => {
  try {
    sendResult(res, await dsrService.deleteDsr(req.params.date, req.user));
  } catch (error) {
    next(error);
  }
  }
);

module.exports = router;
