const deviceSyncService = require("./deviceSyncService");

const getDashboardDeviceStatus = async () => {
  const status = await deviceSyncService.getSyncStatus({ vendor: "atos" });

  return {
    ok: true,
    deviceStatus: status.device.deviceStatus,
    connectionStatus: status.device.connectionStatus,
    lastSyncTime: status.sync.lastSyncTime,
    tankStatus: "pending_vendor_mapping",
    vendor: status.device.vendor,
  };
};

module.exports = {
  getDashboardDeviceStatus,
};
