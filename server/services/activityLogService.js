const operationsRepository = require("../repositories/operationsRepository");
const { redact } = require("../utils/redaction");

const logActivity = async ({
  activityType,
  moduleName,
  status = "success",
  message = "",
  details = {},
}) =>
  operationsRepository.insertActivityLog({
    activityType,
    moduleName,
    status,
    message,
    details: redact(details),
  });

const listActivityLogs = ({ activityType, status, limit }) =>
  operationsRepository.listActivityLogs({
    activityType,
    status,
    limit: Number(limit || 100),
  });

module.exports = {
  logActivity,
  listActivityLogs,
};
