const path = require("path");
const db = require("../db");
const operationsRepository = require("../repositories/operationsRepository");
const authRepository = require("../repositories/authRepository");
const numberingService = require("./numberingService");
const activityLogService = require("./activityLogService");
const auditService = require("./auditService");
const backupService = require("./backupService");
const { verifyPassword } = require("../utils/passwordHashing");

const allowedColumnsCache = new Map();

const restoreAudit = async ({ action, user, ipAddress, status, details = {} }) => {
  await Promise.all([
    auditService.logAudit({
      actionType: action,
      moduleName: "restore",
      entityType: "backup",
      entityId: details.restoreNumber || details.backupId || null,
      user,
      ipAddress,
      newValue: details,
      details: {
        userId: user?.id || null,
        username: user?.username || null,
        role: user?.role || null,
        ipAddress,
        result: status,
        ...details,
      },
    }),
    activityLogService.logActivity({
      activityType: `backup:${action.split(":").pop()}`,
      moduleName: "restore",
      status,
      message: details.message || action,
      details: {
        userId: user?.id || null,
        username: user?.username || null,
        ipAddress,
        ...details,
      },
    }),
  ]);
};

const getAllowedColumns = async (tableName) => {
  if (allowedColumnsCache.has(tableName)) {
    return allowedColumnsCache.get(tableName);
  }

  const result = await db.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position;
    `,
    [tableName]
  );
  const columns = result.rows.map((row) => row.column_name);
  allowedColumnsCache.set(tableName, columns);
  return columns;
};

const verifyOwnerPassword = async ({ user, password }) => {
  if (!user || user.role !== "Owner") {
    return false;
  }

  const fullUser = await authRepository.findUserByUsername(user.username);

  if (!fullUser || fullUser.role !== "Owner") {
    return false;
  }

  return verifyPassword(fullUser.password_hash, String(password || ""));
};

const validateRestoreRequest = async ({ user, ownerPassword, confirmation }) => {
  if (!user || user.role !== "Owner") {
    return {
      ok: false,
      status: 403,
      message: "Owner access is required to restore backups.",
    };
  }

  if (String(confirmation || "") !== "RESTORE MY DATA") {
    return {
      ok: false,
      status: 400,
      message: "Type RESTORE MY DATA to enable restore.",
    };
  }

  if (!(await verifyOwnerPassword({ user, password: ownerPassword }))) {
    return {
      ok: false,
      status: 403,
      message: "Owner password confirmation failed.",
    };
  }

  return { ok: true };
};

const validateBackupFile = (filePath) => backupService.validateBackupPackage(filePath);

const previewFromValidation = (validation) => ({
  backupNumber: validation.metadata.backupNumber,
  generatedAt: validation.metadata.createdAt,
  fileName: path.basename(validation.filePath),
  signature: validation.metadata.packageSignature,
  checksum: validation.checksum,
  tables: validation.metadata.recordCounts || {},
});

const requestRestoreApproval = async ({ filePath, requestedBy }) => {
  const validation = validateBackupFile(filePath);
  const restoreNumber = await numberingService.nextRestoreNumber();

  if (!validation.ok) {
    await operationsRepository.createRestoreHistory({
      restoreNumber,
      status: "failed",
      message: validation.message,
      completedAt: new Date(),
    });

    return validation;
  }

  const preview = previewFromValidation(validation);
  const approval = await operationsRepository.createRestoreApproval({
    restoreNumber,
    backupFileName: path.basename(validation.filePath),
    backupSignature: validation.metadata.packageSignature,
    requestedBy,
    preview,
    message: "Restore approval requested.",
  });

  await activityLogService.logActivity({
    activityType: "restore_approval",
    moduleName: "restore",
    status: "pending",
    message: "Restore approval requested.",
    details: {
      restoreNumber,
      fileName: preview.fileName,
    },
  });

  return {
    ok: true,
    restoreNumber,
    requiresApproval: true,
    message: "Backup validation passed. Restore approval is pending.",
    approval: approval.rows[0],
    preview,
  };
};

const approveRestore = async ({ restoreNumber, approvedBy }) => {
  if (!approvedBy) {
    return {
      ok: false,
      status: 401,
      message: "Authenticated approver is required.",
    };
  }

  const existingApproval = await operationsRepository.findRestoreApproval(
    restoreNumber
  );

  if (!existingApproval || existingApproval.status !== "pending") {
    return {
      ok: false,
      status: 404,
      message: "Pending restore approval was not found.",
    };
  }

  if (String(existingApproval.requested_by) === String(approvedBy)) {
    await activityLogService.logActivity({
      activityType: "restore_approval",
      moduleName: "restore",
      status: "failed",
      message: "Restore self-approval was blocked.",
      details: { restoreNumber, approvedBy },
    });

    return {
      ok: false,
      status: 403,
      message: "Restore requester cannot approve their own restore request.",
    };
  }

  const approval = await operationsRepository.approveRestoreApproval({
    restoreNumber,
    approvedBy,
  });

  if (approval.rows.length === 0) {
    return {
      ok: false,
      status: 404,
      message: "Pending restore approval was not found.",
    };
  }

  await activityLogService.logActivity({
    activityType: "restore_approval",
    moduleName: "restore",
    status: "approved",
    message: "Restore approved.",
    details: { restoreNumber },
  });

  return {
    ok: true,
    approval: approval.rows[0],
    message: "Restore approved.",
  };
};

const truncateRestoreTables = async () => {
  for (const tableName of [...backupService.restoreTables].reverse()) {
    await db.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);
  }
};

const insertBackupRows = async (database) => {
  for (const tableName of backupService.restoreTables) {
    const allowedColumns = await getAllowedColumns(tableName);

    for (const row of database.tables[tableName] || []) {
      const columns = allowedColumns.filter((column) =>
        Object.prototype.hasOwnProperty.call(row, column)
      );
      const values = columns.map((column) => row[column]);
      const placeholders = values.map((_, index) => `$${index + 1}`);

      if (columns.length === 0) {
        continue;
      }

      await db.query(
        `
          INSERT INTO ${tableName} (${columns.join(", ")})
          VALUES (${placeholders.join(", ")});
        `,
        values
      );
    }
  }
};

const countRestoredTables = async () => {
  const counts = {};

  for (const tableName of backupService.restoreTables) {
    const result = await db.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
    counts[tableName] = result.rows[0]?.count || 0;
  }

  return counts;
};

const verifyRecordCounts = (expected, actual) => {
  const mismatches = [];

  backupService.restoreTables.forEach((tableName) => {
    const expectedCount = Number(expected[tableName] || 0);
    const actualCount = Number(actual[tableName] || 0);

    if (expectedCount !== actualCount) {
      mismatches.push(`${tableName}: expected ${expectedCount}, restored ${actualCount}`);
    }
  });

  return mismatches;
};

const restoreValidatedBackup = async ({ validation, restoreNumber }) => {
  let restoredCounts = {};

  await db.query("BEGIN");

  try {
    await truncateRestoreTables();
    await insertBackupRows(validation.database);

    restoredCounts = await countRestoredTables();
    const mismatches = verifyRecordCounts(
      validation.metadata.recordCounts || {},
      restoredCounts
    );

    if (mismatches.length > 0) {
      throw new Error(`Restore record count verification failed: ${mismatches.join("; ")}`);
    }

    await db.query("COMMIT");

    await operationsRepository.createRestoreHistory({
      restoreNumber,
      status: "success",
      message: "Restore completed successfully.",
      completedAt: new Date(),
    });

    return {
      ok: true,
      restoredCounts,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    await operationsRepository.createRestoreHistory({
      restoreNumber,
      status: "failed",
      message: error.message,
      completedAt: new Date(),
    });
    throw error;
  }
};

const restoreBackupPackage = async ({
  backupId,
  fileName,
  fileBase64,
  uploadFileName,
  ownerPassword,
  confirmation,
  user,
  ipAddress,
}) => {
  const requestValidation = await validateRestoreRequest({
    user,
    ownerPassword,
    confirmation,
  });

  if (!requestValidation.ok) {
    await restoreAudit({
      action: "backup:restore",
      user,
      ipAddress,
      status: "failed",
      details: { backupId, fileName, message: requestValidation.message },
    });
    return requestValidation;
  }

  const backup = backupId ? await backupService.getBackupById(backupId) : null;
  let targetFile = backup?.fileName || fileName;

  if (!targetFile && fileBase64) {
    const upload = backupService.storeUploadedBackup({
      fileName: uploadFileName,
      base64: fileBase64,
    });

    if (!upload.ok) {
      await restoreAudit({
        action: "backup:restore",
        user,
        ipAddress,
        status: "failed",
        details: { backupId, fileName: uploadFileName, message: upload.message },
      });
      return upload;
    }

    targetFile = upload.fileName;
  }

  const validation = validateBackupFile(targetFile);
  const restoreNumber = await numberingService.nextRestoreNumber();

  await restoreAudit({
    action: "backup:restore",
    user,
    ipAddress,
    status: "started",
    details: {
      restoreNumber,
      backupId,
      fileName: targetFile,
      message: "Restore started.",
    },
  });

  if (!validation.ok) {
    await operationsRepository.createRestoreHistory({
      restoreNumber,
      status: "failed",
      message: validation.message,
      completedAt: new Date(),
    });
    await restoreAudit({
      action: "backup:restore",
      user,
      ipAddress,
      status: "failed",
      details: {
        restoreNumber,
        backupId,
        fileName: targetFile,
        message: validation.message,
      },
    });
    return validation;
  }

  const preRestoreBackup = await backupService.createBackup({
    user,
    ipAddress,
    backupType: "pre_restore",
  });

  try {
    const restoreResult = await restoreValidatedBackup({
      validation,
      restoreNumber,
    });

    await restoreAudit({
      action: "backup:restore",
      user,
      ipAddress,
      status: "success",
      details: {
        restoreNumber,
        backupId,
        fileName: validation.fileName,
        preRestoreBackup: preRestoreBackup.backupNumber,
        checksum: validation.checksum,
        message: "Restore completed successfully.",
      },
    });

    return {
      ok: true,
      restoreNumber,
      preRestoreBackup: preRestoreBackup.backupNumber,
      restoredCounts: restoreResult.restoredCounts,
      message: "Restore completed successfully.",
    };
  } catch (error) {
    await restoreAudit({
      action: "backup:restore",
      user,
      ipAddress,
      status: "failed",
      details: {
        restoreNumber,
        backupId,
        fileName: validation.fileName,
        preRestoreBackup: preRestoreBackup.backupNumber,
        message: error.message,
      },
    });
    throw error;
  }
};

const restoreFromBackup = async ({ restoreNumber, runBy }) => {
  const approval = await operationsRepository.findRestoreApproval(restoreNumber);

  if (!approval || approval.status !== "approved") {
    return {
      ok: false,
      status: 400,
      message: "Restore must be approved before it can run.",
    };
  }

  const validation = validateBackupFile(approval.backup_file_name);

  if (!validation.ok) {
    await operationsRepository.completeRestoreApproval({
      restoreNumber,
      status: "failed",
      message: validation.message,
    });
    return validation;
  }

  if (validation.metadata.packageSignature !== approval.backup_signature) {
    return {
      ok: false,
      status: 400,
      message: "Approved backup signature does not match the restore file.",
    };
  }

  const restoreResult = await restoreValidatedBackup({
    validation,
    restoreNumber,
  });

  await operationsRepository.completeRestoreApproval({
    restoreNumber,
    status: "completed",
    message: "Restore completed successfully.",
  });

  await activityLogService.logActivity({
    activityType: "restore",
    moduleName: "restore",
    status: "success",
    message: "Restore completed successfully.",
    details: {
      restoreNumber,
      fileName: path.basename(validation.filePath),
      runBy,
    },
  });

  return {
    ok: true,
    restoreNumber,
    restoredCounts: restoreResult.restoredCounts,
    message: "Restore completed successfully.",
  };
};

const listRestoreApprovals = ({ status, limit }) =>
  operationsRepository.listRestoreApprovals({ status, limit });

module.exports = {
  validateBackupFile,
  requestRestoreApproval,
  approveRestore,
  restoreBackupPackage,
  restoreFromBackup,
  listRestoreApprovals,
  verifyRecordCounts,
};
