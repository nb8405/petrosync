const db = require("../db");
const userRepository = require("./userRepository");

const findUserByUsername = (username) => userRepository.findUserByUsername(username);

const findUserById = (id) => userRepository.findUserById(id);

const createSession = ({
  userId,
  tokenHash,
  refreshTokenHash = null,
  expiresAt,
  refreshExpiresAt = null,
  csrfTokenHash = null,
  userAgent = null,
  ipAddress = null,
}) =>
  db.query(
    `
      INSERT INTO user_sessions (
        user_id,
        token_hash,
        refresh_token_hash,
        expires_at,
        refresh_expires_at,
        csrf_token_hash,
        user_agent,
        ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `,
    [
      userId,
      tokenHash,
      refreshTokenHash,
      expiresAt,
      refreshExpiresAt,
      csrfTokenHash,
      userAgent,
      ipAddress,
    ]
  );

const findActiveSession = async (tokenHash) => {
  const result = await db.query(
    `
      SELECT *
      FROM user_sessions
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW();
    `,
    [tokenHash]
  );

  return result.rows[0] || null;
};

const findActiveRefreshSession = async (refreshTokenHash) => {
  const result = await db.query(
    `
      SELECT *
      FROM user_sessions
      WHERE refresh_token_hash = $1
        AND revoked_at IS NULL
        AND refresh_expires_at > NOW();
    `,
    [refreshTokenHash]
  );

  return result.rows[0] || null;
};

const rotateSessionTokens = ({
  sessionId,
  currentRefreshTokenHash,
  tokenHash,
  refreshTokenHash,
  expiresAt,
  refreshExpiresAt,
  csrfTokenHash,
}) =>
  db.query(
    `
      UPDATE user_sessions
      SET token_hash = $2,
          refresh_token_hash = $3,
          expires_at = $4,
          refresh_expires_at = $5,
          csrf_token_hash = $6,
          last_seen_at = NOW()
      WHERE id = $1
        AND refresh_token_hash = $7
        AND revoked_at IS NULL
      RETURNING *;
    `,
    [
      sessionId,
      tokenHash,
      refreshTokenHash,
      expiresAt,
      refreshExpiresAt,
      csrfTokenHash,
      currentRefreshTokenHash,
    ]
  );

const touchSession = (sessionId) =>
  db.query(
    `
      UPDATE user_sessions
      SET last_seen_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL;
    `,
    [sessionId]
  );

const revokeSession = (tokenHash) =>
  db.query(
    `
      UPDATE user_sessions
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL;
    `,
    [tokenHash]
  );

const revokeSessionByRefreshToken = (refreshTokenHash) =>
  db.query(
    `
      UPDATE user_sessions
      SET revoked_at = NOW()
      WHERE refresh_token_hash = $1
        AND revoked_at IS NULL;
    `,
    [refreshTokenHash]
  );

const usesDbPool = (pool) => db.pool === pool;

module.exports = {
  findUserByUsername,
  findUserById,
  createSession,
  findActiveSession,
  findActiveRefreshSession,
  rotateSessionTokens,
  touchSession,
  revokeSession,
  revokeSessionByRefreshToken,
  usesDbPool,
};
