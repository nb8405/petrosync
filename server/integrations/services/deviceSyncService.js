const { createDeviceAdapter } = require("./deviceAdapterFactory");
const {
  DeviceIntegrationError,
  errorCodes,
} = require("../errors/deviceErrors");

const syncState = {
  status: "idle",
  lastSyncTime: null,
  lastError: null,
  history: [],
};

const recordHistory = (entry) => {
  const item = {
    id: syncState.history.length + 1,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  syncState.history.unshift(item);
  syncState.history = syncState.history.slice(0, 100);
  return item;
};

const manualSync = async ({ vendor = "atos" } = {}) => {
  syncState.status = "running";
  syncState.lastError = null;

  try {
    const adapter = createDeviceAdapter(vendor);
    const [tanks, nozzles] = await Promise.all([
      adapter.fetchTanks(),
      adapter.fetchNozzles(),
    ]);

    syncState.status = "success";
    syncState.lastSyncTime = new Date().toISOString();

    return recordHistory({
      vendor,
      status: "success",
      tanksSynced: tanks.length,
      nozzlesSynced: nozzles.length,
      message: "Manual sync completed.",
    });
  } catch (error) {
    const normalized =
      error instanceof DeviceIntegrationError
        ? error
        : new DeviceIntegrationError(
            errorCodes.NETWORK_FAILURE,
            error.message
          );

    syncState.status = "failed";
    syncState.lastError = {
      code: normalized.code,
      message: normalized.message,
    };

    return recordHistory({
      vendor,
      status:
        normalized.code === errorCodes.NOT_IMPLEMENTED
          ? "prepared"
          : "failed",
      errorCode: normalized.code,
      message: normalized.message,
    });
  }
};

const getSyncStatus = async ({ vendor = "atos" } = {}) => {
  const adapter = createDeviceAdapter(vendor);
  const adapterStatus = await adapter.getStatus();

  return {
    ok: true,
    sync: {
      status: syncState.status,
      lastSyncTime: syncState.lastSyncTime,
      lastError: syncState.lastError,
    },
    device: adapterStatus,
  };
};

const getSyncHistory = () => ({
  ok: true,
  history: syncState.history,
});

module.exports = {
  manualSync,
  getSyncStatus,
  getSyncHistory,
};
