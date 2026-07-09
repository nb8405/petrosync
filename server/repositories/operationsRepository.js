const db = require("../db");

const countableTables = new Set([
  "dsr_records",
  "dsr_product_rows",
  "dsr_collections",
  "dsr_expenses",
  "report_history",
  "export_history",
  "print_history",
  "backup_history",
  "restore_history",
  "audit_logs",
  "activity_logs",
]);

const normalizeLimit = (limit, defaultLimit = 100, maxLimit = 500) => {
  const number = Number(limit);

  if (!Number.isInteger(number) || number < 1) {
    return defaultLimit;
  }

  return Math.min(number, maxLimit);
};

const nextSequenceValue = async ({ sequenceKey, prefix }) => {
  const result = await db.query(
    `
      INSERT INTO numbering_sequences (sequence_key, prefix, current_value)
      VALUES ($1, $2, 1)
      ON CONFLICT (sequence_key)
      DO UPDATE SET
        current_value = numbering_sequences.current_value + 1,
        updated_at = NOW()
      RETURNING prefix, current_value;
    `,
    [sequenceKey, prefix]
  );

  return result.rows[0];
};

const insertActivityLog = (log) =>
  db.query(
    `
      INSERT INTO activity_logs (
        activity_type,
        module_name,
        status,
        message,
        details
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `,
    [
      log.activityType,
      log.moduleName,
      log.status,
      log.message || null,
      JSON.stringify(log.details || {}),
    ]
  );

const insertAuditLog = (log) =>
  db.query(
    `
      INSERT INTO audit_logs (
        audit_id,
        action_type,
        action,
        module_name,
        entity_type,
        entity_id,
        user_id,
        username,
        user_role,
        old_value,
        new_value,
        ip_address,
        machine_name,
        request_id,
        correlation_id,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *;
    `,
    [
      log.auditId,
      log.actionType,
      log.action || log.actionType,
      log.moduleName,
      log.entityType || null,
      log.entityId || null,
      log.userId || null,
      log.username || null,
      log.userRole || null,
      JSON.stringify(log.oldValue || null),
      JSON.stringify(log.newValue || null),
      log.ipAddress || null,
      log.machineName || null,
      log.requestId || null,
      log.correlationId || null,
      JSON.stringify(log.details || {}),
    ]
  );

const listActivityLogs = ({ activityType, status, limit = 100 }) => {
  const params = [];
  const where = [];
  const safeLimit = normalizeLimit(limit);

  if (activityType) {
    params.push(activityType);
    where.push(`activity_type = $${params.length}`);
  }

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  params.push(safeLimit);

  return db.query(
    `
      SELECT *
      FROM activity_logs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${params.length};
    `,
    params
  );
};

const listAuditLogs = ({ moduleName, actionType, limit = 100 }) => {
  const params = [];
  const where = [];
  const safeLimit = normalizeLimit(limit);

  if (moduleName) {
    params.push(moduleName);
    where.push(`module_name = $${params.length}`);
  }

  if (actionType) {
    params.push(actionType);
    where.push(`action_type = $${params.length}`);
  }

  params.push(safeLimit);

  return db.query(
    `
      SELECT *
      FROM audit_logs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${params.length};
    `,
    params
  );
};

const createBackupHistory = (backup) =>
  db.query(
    `
      INSERT INTO backup_history (
        backup_number,
        backup_type,
        status,
        file_path,
        file_name,
        backup_size_bytes,
        checksum,
        created_by,
        metadata_encrypted,
        record_counts,
        message,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `,
    [
      backup.backupNumber,
      backup.backupType,
      backup.status,
      backup.filePath || null,
      backup.fileName || null,
      backup.backupSizeBytes || 0,
      backup.checksum || null,
      backup.createdBy || null,
      backup.metadataEncrypted || null,
      JSON.stringify(backup.recordCounts || {}),
      backup.message || null,
      backup.completedAt || null,
    ]
  );

const listBackupHistory = ({ limit = 50 }) =>
  db.query(
    `
      SELECT
        b.*,
        u.username AS created_by_username,
        u.display_name AS created_by_display_name,
        u.role AS created_by_role
      FROM backup_history b
      LEFT JOIN app_users u ON u.id = b.created_by
      WHERE b.deleted_at IS NULL
      ORDER BY started_at DESC
      LIMIT $1;
    `,
    [normalizeLimit(limit, 50, 200)]
  );

const findBackupHistoryById = async (id) => {
  const result = await db.query(
    `
      SELECT
        b.*,
        u.username AS created_by_username,
        u.display_name AS created_by_display_name,
        u.role AS created_by_role
      FROM backup_history b
      LEFT JOIN app_users u ON u.id = b.created_by
      WHERE b.id = $1
        AND b.deleted_at IS NULL;
    `,
    [id]
  );

  return result.rows[0] || null;
};

const markBackupVerified = (id) =>
  db.query(
    `
      UPDATE backup_history
      SET verified_at = NOW(),
          status = CASE WHEN status = 'failed' THEN status ELSE 'verified' END
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING *;
    `,
    [id]
  );

const softDeleteBackupHistory = (id) =>
  db.query(
    `
      UPDATE backup_history
      SET deleted_at = NOW(),
          status = 'deleted'
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING *;
    `,
    [id]
  );

const getBackupSchedule = async () => {
  const result = await db.query(
    `
      SELECT *
      FROM backup_schedule_config
      WHERE id = 1;
    `
  );

  return result.rows[0] || null;
};

const upsertBackupSchedule = (schedule) =>
  db.query(
    `
      INSERT INTO backup_schedule_config (
        id,
        enabled,
        frequency,
        backup_mode,
        run_time,
        retention_count,
        updated_by,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        frequency = EXCLUDED.frequency,
        backup_mode = EXCLUDED.backup_mode,
        run_time = EXCLUDED.run_time,
        retention_count = EXCLUDED.retention_count,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      schedule.enabled,
      schedule.frequency,
      schedule.backupMode,
      schedule.runTime,
      schedule.retentionCount,
      schedule.updatedBy || null,
    ]
  );

const createRestoreHistory = (restore) =>
  db.query(
    `
      INSERT INTO restore_history (
        restore_number,
        backup_id,
        status,
        message,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `,
    [
      restore.restoreNumber,
      restore.backupId || null,
      restore.status,
      restore.message || null,
      restore.completedAt || null,
    ]
  );

const createRestoreApproval = (approval) =>
  db.query(
    `
      INSERT INTO restore_approvals (
        restore_number,
        backup_file_name,
        backup_signature,
        requested_by,
        status,
        preview,
        message
      )
      VALUES ($1, $2, $3, $4, 'pending', $5, $6)
      RETURNING *;
    `,
    [
      approval.restoreNumber,
      approval.backupFileName,
      approval.backupSignature,
      approval.requestedBy || null,
      JSON.stringify(approval.preview || {}),
      approval.message || null,
    ]
  );

const approveRestoreApproval = ({ restoreNumber, approvedBy }) =>
  db.query(
    `
      UPDATE restore_approvals
      SET status = 'approved',
          approved_by = $2,
          approved_at = NOW(),
          message = 'Restore approved.'
      WHERE restore_number = $1
        AND status = 'pending'
        AND (requested_by IS NULL OR requested_by <> $2)
      RETURNING *;
    `,
    [restoreNumber, approvedBy || null]
  );

const completeRestoreApproval = ({ restoreNumber, status, message }) =>
  db.query(
    `
      UPDATE restore_approvals
      SET status = $2,
          completed_at = NOW(),
          message = $3
      WHERE restore_number = $1
      RETURNING *;
    `,
    [restoreNumber, status, message || null]
  );

const findRestoreApproval = async (restoreNumber) => {
  const result = await db.query(
    `
      SELECT *
      FROM restore_approvals
      WHERE restore_number = $1;
    `,
    [restoreNumber]
  );

  return result.rows[0] || null;
};

const listRestoreApprovals = ({ status, limit = 50 }) => {
  const params = [];
  const where = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  params.push(normalizeLimit(limit, 50, 200));

  return db.query(
    `
      SELECT *
      FROM restore_approvals
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY requested_at DESC
      LIMIT $${params.length};
    `,
    params
  );
};

const createExportHistory = (entry) =>
  db.query(
    `
      INSERT INTO export_history (
        export_reference,
        export_type,
        report_type,
        product_key,
        from_date,
        to_date,
        status,
        file_path,
        message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `,
    [
      entry.exportReference,
      entry.exportType,
      entry.reportType,
      entry.productKey,
      entry.fromDate,
      entry.toDate,
      entry.status,
      entry.filePath || null,
      entry.message || null,
    ]
  );

const createReportHistory = (entry) =>
  db.query(
    `
      INSERT INTO report_history (
        report_number,
        report_type,
        product_key,
        from_date,
        to_date,
        status,
        message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `,
    [
      entry.reportNumber,
      entry.reportType,
      entry.productKey,
      entry.fromDate,
      entry.toDate,
      entry.status,
      entry.message || null,
    ]
  );

const createPrintHistory = (entry) =>
  db.query(
    `
      INSERT INTO print_history (
        print_reference,
        report_type,
        product_key,
        from_date,
        to_date,
        status,
        message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `,
    [
      entry.printReference,
      entry.reportType,
      entry.productKey,
      entry.fromDate,
      entry.toDate,
      entry.status,
      entry.message || null,
    ]
  );

const countTable = async (tableName) => {
  if (!countableTables.has(tableName)) {
    throw new Error("Table is not allowed for count operation.");
  }

  const result = await db.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return result.rows[0]?.count || 0;
};

module.exports = {
  nextSequenceValue,
  insertActivityLog,
  insertAuditLog,
  listActivityLogs,
  listAuditLogs,
  createBackupHistory,
  listBackupHistory,
  findBackupHistoryById,
  markBackupVerified,
  softDeleteBackupHistory,
  getBackupSchedule,
  upsertBackupSchedule,
  createRestoreHistory,
  createRestoreApproval,
  approveRestoreApproval,
  completeRestoreApproval,
  findRestoreApproval,
  listRestoreApprovals,
  createExportHistory,
  createReportHistory,
  createPrintHistory,
  countTable,
};
