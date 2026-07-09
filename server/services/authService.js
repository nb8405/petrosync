const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../db");
const authRepository = require("../repositories/authRepository");
const onboardingRepository = require("../repositories/onboardingRepository");
const userRepository = require("../repositories/userRepository");
const activityLogService = require("./activityLogService");
const auditService = require("./auditService");
const appConfig = require("../config/appConfig");
const { roles } = require("../security/roles");
const { isArgon2Hash, verifyPassword } = require("../utils/passwordHashing");
const userAccountService = require("./userAccountService");

const tokenHash = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString("base64url");

const jwtSecret = () =>
  appConfig.auth.jwtSecret || appConfig.auth.developmentJwtSecret;

const likeLiteral = (value) => `%${String(value || "").replace(/[\\%_]/g, "\\$&")}%`;

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.display_name,
  role: user.role,
});

const publicManagedUser = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.display_name,
  role: user.role,
  email: user.email || "",
  active: Boolean(user.active),
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});

const userReferenceColumns = [
  ["app_users", ["created_by"]],
  ["pump_workspaces", ["created_by"]],
  ["backup_history", ["created_by"]],
  ["restore_approvals", ["requested_by", "approved_by"]],
  ["backup_schedule_config", ["updated_by"]],
  ["tank_readings", ["created_by"]],
  ["shift_records", ["operator_id", "created_by"]],
  ["day_end_records", ["completed_by"]],
  ["alarms", ["acknowledged_by", "resolved_by"]],
  ["dry_stock_movements", ["created_by"]],
  ["station_settings", ["updated_by"]],
];

const parseJson = (value, fallback) => {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const publicWorkspace = (workspace) => {
  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    pumpName: workspace.pump_name,
    dealerName: workspace.dealer_name,
    company: workspace.company,
    state: workspace.state,
    district: workspace.district,
    address: workspace.address,
    contactNumber: workspace.contact_number,
    email: workspace.email,
    logoDataUrl: workspace.logo_data_url,
    themeKey: workspace.theme_key,
    financialYear: workspace.financial_year,
    gstConfiguration: parseJson(workspace.gst_configuration, {}),
    taxSettings: parseJson(workspace.tax_settings, {}),
    currency: workspace.currency,
    language: workspace.language,
    dateFormat: workspace.date_format,
    backupSettings: parseJson(workspace.backup_settings, {}),
    products: parseJson(workspace.products, []),
    staffRoles: parseJson(workspace.staff_roles, []),
    integrations: parseJson(workspace.integrations, {}),
    healthCheck: parseJson(workspace.health_check, {}),
    launchedAt: workspace.launched_at,
  };
};

const createAccessToken = ({ user, expiresAt }) =>
  jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      role: user.role,
      tokenType: "access",
    },
    jwtSecret(),
    {
      expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      issuer: appConfig.auth.jwtIssuer,
      audience: appConfig.auth.jwtAudience,
    }
  );

const createTokenSet = (user) => {
  const accessExpiresAt = new Date(
    Date.now() + appConfig.auth.jwtExpiresInSeconds * 1000
  );
  const refreshExpiresAt = new Date(
    Date.now() + appConfig.auth.refreshExpiresInSeconds * 1000
  );
  const accessToken = createAccessToken({
    user,
    expiresAt: accessExpiresAt,
  });
  const refreshToken = randomToken();
  const csrfToken = randomToken(32);

  return {
    accessToken,
    refreshToken,
    csrfToken,
    accessExpiresAt,
    refreshExpiresAt,
  };
};

const login = async ({ username, password, userAgent, ipAddress }) => {
  if (!username || !password) {
    return {
      ok: false,
      status: 400,
      message: "Username and password are required.",
    };
  }

  const user = await authRepository.findUserByUsername(String(username).trim());

  if (!user) {
    return {
      ok: false,
      status: 401,
      message: "Invalid username or password.",
    };
  }

  if (!isArgon2Hash(user.password_hash)) {
    await activityLogService.logActivity({
      activityType: "auth_login",
      moduleName: "auth",
      status: "blocked",
      message: "Login blocked because the stored password hash is not Argon2id.",
      details: { username: user.username, userId: user.id },
    });

    return {
      ok: false,
      status: 409,
      code: "LEGACY_DEVELOPMENT_PASSWORD_HASH",
      needsSetup: true,
      blockedByLegacyPasswordHash: true,
      message:
        "Legacy development account data was detected. Complete onboarding to reset and recreate the owner account with Argon2id.",
    };
  }

  const passwordValid = await verifyPassword(user.password_hash, password);

  if (!passwordValid) {
    await activityLogService.logActivity({
      activityType: "auth_login",
      moduleName: "auth",
      status: "failed",
      message: "Login failed.",
      details: { username },
    });

    return {
      ok: false,
      status: 401,
      message: "Invalid username or password.",
    };
  }

  const tokenSet = createTokenSet(user);

  await authRepository.createSession({
    userId: user.id,
    tokenHash: tokenHash(tokenSet.accessToken),
    refreshTokenHash: tokenHash(tokenSet.refreshToken),
    expiresAt: tokenSet.accessExpiresAt,
    refreshExpiresAt: tokenSet.refreshExpiresAt,
    csrfTokenHash: tokenHash(tokenSet.csrfToken),
    userAgent,
    ipAddress,
  });

  await activityLogService.logActivity({
    activityType: "auth_login",
    moduleName: "auth",
    status: "success",
    message: "Login successful.",
    details: { userId: user.id, username: user.username, role: user.role },
  });
  await auditService.logAudit({
    actionType: "login",
    moduleName: "authentication",
    entityType: "app_user",
    entityId: String(user.id),
    user,
    details: {
      status: "success",
      username: user.username,
      role: user.role,
      ipAddress,
      userAgent,
    },
  });
  const workspace = await onboardingRepository.latestWorkspace();

  return {
    ok: true,
    token: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken,
    csrfToken: tokenSet.csrfToken,
    expiresAt: tokenSet.accessExpiresAt.toISOString(),
    refreshExpiresAt: tokenSet.refreshExpiresAt.toISOString(),
    user: publicUser(user),
    workspace: publicWorkspace(workspace),
  };
};

const logout = async ({ accessToken, refreshToken }) => {
  if (accessToken) {
    await authRepository.revokeSession(tokenHash(accessToken));
  }

  if (refreshToken) {
    await authRepository.revokeSessionByRefreshToken(tokenHash(refreshToken));
  }

  await auditService.logAudit({
    actionType: "logout",
    moduleName: "authentication",
    entityType: "session",
    details: {
      hadAccessToken: Boolean(accessToken),
      hadRefreshToken: Boolean(refreshToken),
    },
  });

  return {
    ok: true,
    message: "Logged out successfully.",
  };
};

const verifyToken = async (token) => {
  const decoded = jwt.verify(token, jwtSecret(), {
    issuer: appConfig.auth.jwtIssuer,
    audience: appConfig.auth.jwtAudience,
    clockTolerance: appConfig.auth.jwtClockToleranceSeconds,
  });

  if (decoded.tokenType !== "access") {
    const error = new Error("Invalid token type.");
    error.status = 401;
    throw error;
  }

  const session = await authRepository.findActiveSession(tokenHash(token));

  if (!session) {
    const error = new Error("Session is no longer active.");
    error.status = 401;
    throw error;
  }

  const user = await authRepository.findUserById(decoded.sub);

  if (!user) {
    const error = new Error("User is no longer active.");
    error.status = 401;
    throw error;
  }

  await authRepository.touchSession(session.id);

  return publicUser(user);
};

const refreshSession = async ({ refreshToken }) => {
  if (!refreshToken) {
    return {
      ok: false,
      status: 400,
      message: "Refresh token is required.",
    };
  }

  const session = await authRepository.findActiveRefreshSession(
    tokenHash(refreshToken)
  );

  if (!session) {
    return {
      ok: false,
      status: 401,
      message: "Refresh session is invalid or expired.",
    };
  }

  const user = await authRepository.findUserById(session.user_id);

  if (!user) {
    await authRepository.revokeSessionByRefreshToken(tokenHash(refreshToken));
    return {
      ok: false,
      status: 401,
      message: "User is no longer active.",
    };
  }

  const tokenSet = createTokenSet(user);

  const rotated = await authRepository.rotateSessionTokens({
    sessionId: session.id,
    currentRefreshTokenHash: tokenHash(refreshToken),
    tokenHash: tokenHash(tokenSet.accessToken),
    refreshTokenHash: tokenHash(tokenSet.refreshToken),
    expiresAt: tokenSet.accessExpiresAt,
    refreshExpiresAt: tokenSet.refreshExpiresAt,
    csrfTokenHash: tokenHash(tokenSet.csrfToken),
  });

  if (rotated.rows.length === 0) {
    return {
      ok: false,
      status: 401,
      message: "Refresh session is invalid or expired.",
    };
  }

  await activityLogService.logActivity({
    activityType: "auth_refresh",
    moduleName: "auth",
    status: "success",
    message: "Session refreshed.",
    details: { userId: user.id, username: user.username },
  });
  await auditService.logAudit({
    actionType: "refresh",
    moduleName: "authentication",
    entityType: "session",
    entityId: String(session.id),
    user,
    details: {
      status: "success",
      username: user.username,
      role: user.role,
    },
  });
  const workspace = await onboardingRepository.latestWorkspace();

  return {
    ok: true,
    token: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken,
    csrfToken: tokenSet.csrfToken,
    expiresAt: tokenSet.accessExpiresAt.toISOString(),
    refreshExpiresAt: tokenSet.refreshExpiresAt.toISOString(),
    user: publicUser(user),
    workspace: publicWorkspace(workspace),
  };
};

const createUser = async ({ username, password, displayName, role, createdBy }) => {
  if (!username || !password || !role) {
    return {
      ok: false,
      status: 400,
      message: "username, password, and role are required.",
    };
  }

  if (!roles.includes(role)) {
    return {
      ok: false,
      status: 400,
      message: `role must be one of ${roles.join(", ")}.`,
    };
  }

  if (String(password).length < 10) {
    return {
      ok: false,
      status: 400,
      message: "Password must be at least 10 characters.",
    };
  }

  const result = await userAccountService.createUserWithPassword({
    username: String(username).trim(),
    password,
    displayName: displayName || username,
    role,
    createdBy,
  });
  const user = result.rows[0];

  await auditService.logAudit({
    actionType: "user:create",
    moduleName: "authentication",
    entityType: "app_user",
    entityId: String(user.id),
    user: { id: createdBy || null },
    newValue: publicUser(user),
    details: { username: user.username, role: user.role },
  });

  return {
    ok: true,
    user: publicUser(user),
  };
};

const listManagedUsers = async () => ({
  ok: true,
  users: (await userRepository.listPublicUsers()).map(publicManagedUser),
});

const deleteUser = async ({ userId, confirmation }) => {
  const targetId = Number(userId);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return {
      ok: false,
      status: 400,
      message: "A valid user id is required.",
    };
  }

  if (String(confirmation || "").trim().toUpperCase() !== "DELETE") {
    return {
      ok: false,
      status: 400,
      message: "Type DELETE to confirm permanent user deletion.",
    };
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const targetResult = await client.query(
      `
        SELECT id, username, display_name, role, email, active, created_at, updated_at
        FROM app_users
        WHERE id = $1
        FOR UPDATE;
      `,
      [targetId]
    );
    const target = targetResult.rows[0];

    if (!target) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 404,
        message: "User was not found.",
      };
    }

    if (target.role === "Owner" && target.active) {
      const ownerCount = await client.query(
        "SELECT COUNT(*)::int AS count FROM app_users WHERE role = 'Owner' AND active = true AND id <> $1;",
        [targetId]
      );

      if ((ownerCount.rows[0]?.count || 0) === 0) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          status: 409,
          message: "You cannot delete the only active Owner account.",
        };
      }
    }

    const counts = {};
    const usernamePattern = likeLiteral(target.username);
    const countResult = async (label, result) => {
      counts[label] = (counts[label] || 0) + Number(result.rowCount || 0);
    };

    await countResult(
      "userSessions",
      await client.query("DELETE FROM user_sessions WHERE user_id = $1;", [targetId])
    );
    await client.query("SET LOCAL app.allow_audit_log_purge = 'on';");
    await countResult(
      "auditLogs",
      await client.query(
        `
          DELETE FROM audit_logs
          WHERE user_id = $1
             OR (entity_type = 'app_user' AND entity_id = $2)
             OR details::text ILIKE $3 ESCAPE '\\';
        `,
        [targetId, String(targetId), usernamePattern]
      )
    );
    await countResult(
      "activityLogs",
      await client.query(
        `
          DELETE FROM activity_logs
          WHERE details @> $1::jsonb
             OR details @> $2::jsonb
             OR details::text ILIKE $3 ESCAPE '\\';
        `,
        [
          JSON.stringify({ userId: targetId }),
          JSON.stringify({ username: target.username }),
          usernamePattern,
        ]
      )
    );

    for (const [table, columns] of userReferenceColumns) {
      for (const column of columns) {
        await countResult(
          `${table}.${column}`,
          await client.query(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = $1;`, [
            targetId,
          ])
        );
      }
    }

    const deleteResult = await userRepository.deleteUserById(client, targetId);

    if (deleteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 404,
        message: "User was not found.",
      };
    }

    await client.query("COMMIT");

    return {
      ok: true,
      deletedUser: publicManagedUser(deleteResult.rows[0]),
      affectedRows: counts,
      message: "User and stored user information were permanently deleted.",
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  login,
  logout,
  verifyToken,
  refreshSession,
  createUser,
  listManagedUsers,
  deleteUser,
  tokenHash,
  usesDbPool: authRepository.usesDbPool,
};
