const express = require("express");
const authService = require("../services/authService");
const onboardingService = require("../services/onboardingService");
const { requireAuth } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionHook");
const appConfig = require("../config/appConfig");
const { parseCookies, serializeCookie } = require("../utils/cookies");

const router = express.Router();

const sendResult = (res, result) =>
  res.status(result.ok ? 200 : result.status || 400).json(result);

const cookieOptions = {
  httpOnly: true,
  secure: appConfig.auth.cookieSecure,
  sameSite: "Strict",
  path: "/",
};

const setAuthCookies = (res, result) => {
  if (!appConfig.auth.cookieEnabled || !result.ok) {
    return;
  }

  res.append(
    "Set-Cookie",
    serializeCookie("ppm_access", result.token, {
      ...cookieOptions,
      maxAge: appConfig.auth.jwtExpiresInSeconds,
    })
  );
  res.append(
    "Set-Cookie",
    serializeCookie("ppm_refresh", result.refreshToken, {
      ...cookieOptions,
      maxAge: appConfig.auth.refreshExpiresInSeconds,
    })
  );
  res.append(
    "Set-Cookie",
    serializeCookie("ppm_csrf", result.csrfToken, {
      httpOnly: false,
      secure: appConfig.auth.cookieSecure,
      sameSite: "Strict",
      path: "/",
      maxAge: appConfig.auth.refreshExpiresInSeconds,
    })
  );
};

const clearAuthCookies = (res) => {
  ["ppm_access", "ppm_refresh", "ppm_csrf"].forEach((name) => {
    res.append(
      "Set-Cookie",
      serializeCookie(name, "", {
        ...cookieOptions,
        httpOnly: name !== "ppm_csrf",
        maxAge: 0,
      })
    );
  });
};

const bearerToken = (req) => {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  return scheme === "Bearer" ? token : null;
};

router.post("/login", async (req, res, next) => {
  try {
    const result = await authService.login({
      username: req.body.username,
      password: req.body.password,
      userAgent: req.get("user-agent") || null,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
    });

    setAuthCookies(res, result);
    sendResult(res, result);
  } catch (error) {
    next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const cookies = parseCookies(req.get("cookie"));
    const result = await authService.refreshSession({
      refreshToken: req.body.refreshToken || cookies.ppm_refresh,
    });

    setAuthCookies(res, result);
    sendResult(res, result);
  } catch (error) {
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const cookies = parseCookies(req.get("cookie"));
    const result = await authService.logout({
      accessToken: bearerToken(req) || cookies.ppm_access,
      refreshToken: req.body.refreshToken || cookies.ppm_refresh,
    });

    clearAuthCookies(res);
    sendResult(res, result);
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: req.user,
  });
});

router.get("/setup-status", async (req, res, next) => {
  try {
    sendResult(res, await onboardingService.getSetupStatus());
  } catch (error) {
    next(error);
  }
});

router.get("/fuel-master", async (req, res, next) => {
  try {
    sendResult(res, await onboardingService.getFuelMaster());
  } catch (error) {
    next(error);
  }
});

router.post("/register-pump", async (req, res, next) => {
  try {
    sendResult(res, await onboardingService.registerPumpWorkspace(req.body || {}));
  } catch (error) {
    next(error);
  }
});

router.post("/users", requireAuth, requirePermission("users:create"), async (req, res, next) => {
  try {
    sendResult(
      res,
      await authService.createUser({
        ...req.body,
        createdBy: req.user.id,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/users", requireAuth, requirePermission("users:create"), async (req, res, next) => {
  try {
    sendResult(res, await authService.listManagedUsers());
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:id", requireAuth, requirePermission("users:create"), async (req, res, next) => {
  try {
    const result = await authService.deleteUser({
      userId: req.params.id,
      confirmation: req.body?.confirmation,
    });

    if (result.ok && Number(req.params.id) === Number(req.user.id)) {
      clearAuthCookies(res);
    }

    sendResult(res, result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
