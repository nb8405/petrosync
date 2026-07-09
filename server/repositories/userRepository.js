const db = require("../db");
const { assertArgon2Hash } = require("../utils/passwordHashing");

const query = (client, text, params) =>
  client && client.query ? client.query(text, params) : db.query(text, params);

const findUserByUsername = async (username, client = db) => {
  const result = await query(
    client,
    `
      SELECT *
      FROM app_users
      WHERE (username = $1 OR LOWER(email) = LOWER($1))
        AND active = true;
    `,
    [username]
  );

  return result.rows[0] || null;
};

const findUserById = async (id, client = db) => {
  const result = await query(
    client,
    `
      SELECT id, username, display_name, role, active, created_at, updated_at
      FROM app_users
      WHERE id = $1
        AND active = true;
    `,
    [id]
  );

  return result.rows[0] || null;
};

const countUsers = async (client = db) => {
  const result = await query(client, "SELECT COUNT(*)::int AS count FROM app_users;");
  return result.rows[0]?.count || 0;
};

const listUsers = async (client = db) => {
  const result = await query(
    client,
    `
      SELECT id, username, display_name, role, active, password_hash, email, created_at, updated_at
      FROM app_users
      ORDER BY id ASC;
    `
  );

  return result.rows;
};

const listPublicUsers = async (client = db) => {
  const result = await query(
    client,
    `
      SELECT id, username, display_name, role, active, email, created_at, updated_at
      FROM app_users
      ORDER BY active DESC, display_name ASC, username ASC;
    `
  );

  return result.rows;
};

const deleteUserById = (client, id) =>
  query(
    client,
    `
      DELETE FROM app_users
      WHERE id = $1
      RETURNING id, username, display_name, role, email, active, created_at, updated_at;
    `,
    [id]
  );

const createUser = (client, {
  username,
  passwordHash,
  displayName,
  role,
  firstName = null,
  lastName = null,
  email = null,
  recoveryEmail = null,
  recoveryPhone = null,
  securityQuestion = null,
  securityAnswerHash = null,
  createdBy = null,
}) => {
  assertArgon2Hash(passwordHash);
  if (securityAnswerHash) {
    assertArgon2Hash(securityAnswerHash);
  }

  return query(
    client,
    `
      INSERT INTO app_users (
        username,
        password_hash,
        display_name,
        role,
        first_name,
        last_name,
        email,
        recovery_email,
        recovery_phone,
        security_question,
        security_answer_hash,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, username, display_name, role, active, created_at, updated_at;
    `,
    [
      username,
      passwordHash,
      displayName,
      role,
      firstName,
      lastName,
      email,
      recoveryEmail,
      recoveryPhone,
      securityQuestion,
      securityAnswerHash,
      createdBy,
    ]
  );
};

module.exports = {
  findUserByUsername,
  findUserById,
  countUsers,
  listUsers,
  listPublicUsers,
  deleteUserById,
  createUser,
};
