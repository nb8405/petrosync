const db = require("../db");

const connectionFields = `
  id,
  vendor,
  connection_type,
  ip_address,
  port,
  username,
  password_encrypted,
  sync_interval_minutes,
  is_active,
  last_sync_at,
  created_at,
  updated_at
`;

const listConnections = () =>
  db.query(`
    SELECT ${connectionFields}
    FROM automation_connections
    ORDER BY created_at DESC, id DESC;
  `);

const findConnectionById = async (id) => {
  const result = await db.query(
    `
      SELECT ${connectionFields}
      FROM automation_connections
      WHERE id = $1;
    `,
    [id]
  );

  return result.rows[0] || null;
};

const createConnection = (connection) =>
  db.query(
    `
      INSERT INTO automation_connections (
        vendor,
        connection_type,
        ip_address,
        port,
        username,
        password_encrypted,
        sync_interval_minutes,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${connectionFields};
    `,
    [
      connection.vendor,
      connection.connectionType,
      connection.ipAddress,
      connection.port,
      connection.username || null,
      connection.passwordEncrypted || null,
      connection.syncIntervalMinutes,
      connection.isActive,
    ]
  );

const updateConnection = (id, connection) => {
  const assignments = [];
  const values = [];

  Object.entries({
    vendor: connection.vendor,
    connection_type: connection.connectionType,
    ip_address: connection.ipAddress,
    port: connection.port,
    username: connection.username,
    password_encrypted: connection.passwordEncrypted,
    sync_interval_minutes: connection.syncIntervalMinutes,
    is_active: connection.isActive,
  }).forEach(([column, value]) => {
    if (value !== undefined) {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    }
  });

  if (assignments.length === 0) {
    return findConnectionById(id).then((row) => ({ rows: row ? [row] : [] }));
  }

  values.push(id);

  return db.query(
    `
      UPDATE automation_connections
      SET ${assignments.join(", ")},
          updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING ${connectionFields};
    `,
    values
  );
};

const deleteConnection = (id) =>
  db.query(
    `
      DELETE FROM automation_connections
      WHERE id = $1
      RETURNING ${connectionFields};
    `,
    [id]
  );

const touchConnectionSync = (id) =>
  db.query(
    `
      UPDATE automation_connections
      SET last_sync_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${connectionFields};
    `,
    [id]
  );

const listTankMappings = (connectionId) =>
  db.query(
    `
      SELECT *
      FROM automation_tank_mappings
      WHERE connection_id = $1
      ORDER BY external_tank_id ASC;
    `,
    [connectionId]
  );

const upsertTankMappings = async (connectionId, mappings = []) => {
  await db.query("BEGIN");

  try {
    await db.query(
      "DELETE FROM automation_tank_mappings WHERE connection_id = $1;",
      [connectionId]
    );

    for (const mapping of mappings) {
      await db.query(
        `
          INSERT INTO automation_tank_mappings (
            connection_id,
            external_tank_id,
            external_tank_name,
            internal_tank_id,
            product_type
          )
          VALUES ($1, $2, $3, $4, $5);
        `,
        [
          connectionId,
          mapping.externalTankId,
          mapping.externalTankName || null,
          mapping.internalTankId,
          mapping.productType,
        ]
      );
    }

    const result = await listTankMappings(connectionId);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
};

const listNozzleMappings = (connectionId) =>
  db.query(
    `
      SELECT *
      FROM automation_nozzle_mappings
      WHERE connection_id = $1
      ORDER BY external_nozzle_id ASC;
    `,
    [connectionId]
  );

const upsertNozzleMappings = async (connectionId, mappings = []) => {
  await db.query("BEGIN");

  try {
    await db.query(
      "DELETE FROM automation_nozzle_mappings WHERE connection_id = $1;",
      [connectionId]
    );

    for (const mapping of mappings) {
      await db.query(
        `
          INSERT INTO automation_nozzle_mappings (
            connection_id,
            external_nozzle_id,
            external_nozzle_name,
            internal_nozzle_id,
            product_type
          )
          VALUES ($1, $2, $3, $4, $5);
        `,
        [
          connectionId,
          mapping.externalNozzleId,
          mapping.externalNozzleName || null,
          mapping.internalNozzleId,
          mapping.productType,
        ]
      );
    }

    const result = await listNozzleMappings(connectionId);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
};

const createSyncLog = (entry) =>
  db.query(
    `
      INSERT INTO automation_sync_logs (
        connection_id,
        sync_type,
        records_processed,
        status,
        error_message,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `,
    [
      entry.connectionId || null,
      entry.syncType,
      entry.recordsProcessed || 0,
      entry.status,
      entry.errorMessage || null,
      entry.completedAt || null,
    ]
  );

const listSyncLogs = ({ connectionId, limit = 50 }) =>
  db.query(
    `
      SELECT *
      FROM automation_sync_logs
      WHERE connection_id = $1
      ORDER BY started_at DESC
      LIMIT $2;
    `,
    [connectionId, Math.min(Math.max(Number(limit) || 50, 1), 200)]
  );

module.exports = {
  listConnections,
  findConnectionById,
  createConnection,
  updateConnection,
  deleteConnection,
  touchConnectionSync,
  listTankMappings,
  upsertTankMappings,
  listNozzleMappings,
  upsertNozzleMappings,
  createSyncLog,
  listSyncLogs,
};
