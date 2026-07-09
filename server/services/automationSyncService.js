const automationRepository = require("../repositories/automationRepository");
const { createProvider } = require("../integrations/providers");
const { decryptCredential } = require("../utils/credentialCrypto");

const providerConfig = (connection) => ({
  vendor: connection.vendor,
  connectionType: connection.connection_type,
  ipAddress: connection.ip_address,
  port: connection.port,
  username: connection.username || "",
  password: decryptCredential(connection.password_encrypted),
  syncIntervalMinutes: connection.sync_interval_minutes,
});

const testConnection = async (connection) => {
  const missing = [];

  if (!connection.ip_address) {
    missing.push("ipAddress");
  }

  if (!connection.port) {
    missing.push("port");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      status: 400,
      message: `Connection configuration is incomplete: ${missing.join(", ")}.`,
    };
  }

  const provider = createProvider(connection.vendor, providerConfig(connection));
  const providerResult = await provider.testConnection();

  return {
    ok: true,
    status: "prepared",
    message: "Configuration is valid. Provider not configured",
    provider: providerResult,
  };
};

const sync = async (connection) => {
  const provider = createProvider(connection.vendor, providerConfig(connection));
  const providerResult = await provider.sync();
  const status = providerResult.status === "not_configured" ? "not_configured" : "prepared";
  const completed = await automationRepository.createSyncLog({
    connectionId: connection.id,
    syncType: "manual",
    recordsProcessed: 0,
    status,
    errorMessage: providerResult.message,
    completedAt: new Date(),
  });

  if (status === "prepared") {
    await automationRepository.touchConnectionSync(connection.id);
  }

  return {
    ok: true,
    status,
    message: providerResult.message || "Provider not configured",
    syncLog: completed.rows[0],
  };
};

module.exports = {
  testConnection,
  sync,
};
