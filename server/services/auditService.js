const crypto = require("crypto");
const operationsRepository = require("../repositories/operationsRepository");
const { redact } = require("../utils/redaction");
const logger = require("./loggerService");
const { currentRequestContext } = require("../middleware/requestContext");

const auditId = () => `AUD-${new Date().toISOString().replace(/\D/g, "")}-${crypto.randomUUID()}`;

const normalizeUser = ({ user, details = {}, context = {} }) => ({
  userId: user?.id || details.userId || context.userId || null,
  username: user?.username || details.username || context.username || null,
  userRole: user?.role || details.role || context.role || null,
});

const logAudit = async ({
  actionType,
  action,
  moduleName,
  entityType = null,
  entityId = null,
  user = null,
  oldValue = null,
  newValue = null,
  ipAddress = null,
  machineName = null,
  requestId = null,
  correlationId = null,
  details = {},
}) => {
  const context = currentRequestContext() || {};
  const sanitizedDetails = redact(details);
  const userFields = normalizeUser({
    user,
    details: sanitizedDetails,
    context,
  });
  const record = {
    auditId: auditId(),
    actionType,
    action: action || actionType,
    moduleName,
    entityType,
    entityId,
    ...userFields,
    oldValue: redact(oldValue),
    newValue: redact(newValue),
    ipAddress: ipAddress || sanitizedDetails.ipAddress || context.ipAddress || null,
    machineName:
      machineName || sanitizedDetails.machineName || context.machineName || null,
    requestId: requestId || sanitizedDetails.requestId || context.requestId || null,
    correlationId:
      correlationId ||
      sanitizedDetails.correlationId ||
      context.correlationId ||
      null,
    details: sanitizedDetails,
  };

  const result = await operationsRepository.insertAuditLog(record);

  logger.security("Audit event recorded.", {
    severity: "info",
    module: "audit",
    requestContext: context,
    auditId: record.auditId,
    actionType: record.actionType,
    moduleName: record.moduleName,
    entityType: record.entityType,
    entityId: record.entityId,
    userId: record.userId,
    username: record.username,
    role: record.userRole,
  });

  return result;
};

const listAuditLogs = ({ moduleName, actionType, limit }) =>
  operationsRepository.listAuditLogs({
    moduleName,
    actionType,
    limit: Number(limit || 100),
  });

module.exports = {
  logAudit,
  listAuditLogs,
};
