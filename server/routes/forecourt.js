const express = require("express");
const forecourtService = require("../services/forecourtService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");

const router = express.Router();

router.use(requireAuth);

const send = (res, result) =>
  res.status(result.ok ? 200 : result.status || 400).json(result);

const crudRoutes = ({ path, controller, permissionPrefix }) => {
  router.get(path, requirePermission(`${permissionPrefix}:read`), async (req, res, next) => {
    try {
      send(res, await controller.list());
    } catch (error) {
      next(error);
    }
  });

  router.post(path, requirePermission(`${permissionPrefix}:manage`), async (req, res, next) => {
    try {
      send(res, await controller.create({ payload: req.body, user: req.user }));
    } catch (error) {
      next(error);
    }
  });

  router.put(`${path}/:id`, requirePermission(`${permissionPrefix}:manage`), async (req, res, next) => {
    try {
      send(res, await controller.update({ id: req.params.id, payload: req.body, user: req.user }));
    } catch (error) {
      next(error);
    }
  });

  router.delete(`${path}/:id`, requirePermission(`${permissionPrefix}:manage`), async (req, res, next) => {
    try {
      send(res, await controller.remove({ id: req.params.id, user: req.user }));
    } catch (error) {
      next(error);
    }
  });
};

crudRoutes({ path: "/islands", controller: forecourtService.islands, permissionPrefix: "forecourt" });
crudRoutes({ path: "/pumps", controller: forecourtService.pumps, permissionPrefix: "forecourt" });
crudRoutes({ path: "/nozzles", controller: forecourtService.nozzles, permissionPrefix: "forecourt" });
crudRoutes({ path: "/tanks", controller: forecourtService.tanks, permissionPrefix: "tank" });
crudRoutes({ path: "/shift-configs", controller: forecourtService.shifts.configs, permissionPrefix: "shift" });
crudRoutes({ path: "/shift-records", controller: forecourtService.shifts.records, permissionPrefix: "shift" });
crudRoutes({ path: "/inventory/items", controller: forecourtService.inventoryItems, permissionPrefix: "inventory" });
crudRoutes({ path: "/attendants", controller: forecourtService.attendants, permissionPrefix: "attendant" });

router.get("/dashboard", requirePermission("forecourt:read"), async (req, res, next) => {
  try {
    send(res, await forecourtService.getDashboard());
  } catch (error) {
    next(error);
  }
});

router.get("/tank-alerts", requirePermission("tank:read"), async (req, res, next) => {
  try {
    send(res, await forecourtService.listTankAlerts());
  } catch (error) {
    next(error);
  }
});

router.post("/tank-readings", requirePermission("tank:manage"), async (req, res, next) => {
  try {
    send(res, await forecourtService.createTankReading({ payload: req.body, user: req.user }));
  } catch (error) {
    next(error);
  }
});

router.get("/devices", requirePermission("device:read"), async (req, res, next) => {
  try {
    send(res, await forecourtService.listDeviceStatus());
  } catch (error) {
    next(error);
  }
});

router.post("/devices", requirePermission("device:manage"), async (req, res, next) => {
  try {
    send(res, await forecourtService.createDeviceStatus({ payload: req.body, user: req.user }));
  } catch (error) {
    next(error);
  }
});

router.get("/alarms", requirePermission("alarm:read"), async (req, res, next) => {
  try {
    send(res, { ok: true, rows: (await require("../repositories/forecourtRepository").list("alarms", "created_at DESC")).rows });
  } catch (error) {
    next(error);
  }
});

router.post("/alarms", requirePermission("alarm:manage"), async (req, res, next) => {
  try {
    send(res, await forecourtService.createAlarm({ payload: req.body, user: req.user }));
  } catch (error) {
    next(error);
  }
});

router.post("/alarms/:id/status", requirePermission("alarm:manage"), async (req, res, next) => {
  try {
    send(res, await forecourtService.updateAlarmStatus({ id: req.params.id, status: req.body.status, user: req.user }));
  } catch (error) {
    next(error);
  }
});

router.post("/inventory/movements", requirePermission("inventory:manage"), async (req, res, next) => {
  try {
    send(res, await forecourtService.createInventoryMovement({ payload: req.body, user: req.user }));
  } catch (error) {
    next(error);
  }
});

router.post("/day-end/validate", requirePermission("dayend:read"), async (req, res, next) => {
  try {
    const businessDate = req.body.businessDate || req.query.businessDate;
    send(res, { ok: true, validations: await forecourtService.validateDayEnd(businessDate) });
  } catch (error) {
    next(error);
  }
});

router.post("/day-end/complete", requirePermission("dayend:manage"), async (req, res, next) => {
  try {
    send(res, await forecourtService.completeDayEnd({ payload: req.body, user: req.user }));
  } catch (error) {
    next(error);
  }
});

router.get("/settings", requirePermission("config:read"), async (req, res, next) => {
  try {
    send(res, await forecourtService.listSettings());
  } catch (error) {
    next(error);
  }
});

router.put("/settings/:key", requirePermission("config:manage"), async (req, res, next) => {
  try {
    send(res, await forecourtService.upsertSetting({
      key: req.params.key,
      section: req.body.section,
      value: req.body.value || {},
      user: req.user,
    }));
  } catch (error) {
    next(error);
  }
});

router.get("/reports", requirePermission("reports:read"), async (req, res, next) => {
  try {
    send(res, await forecourtService.getEnterpriseReports({
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
    }));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
