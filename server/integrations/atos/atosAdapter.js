const BaseDeviceAdapter = require("../adapters/baseDeviceAdapter");
const {
  DeviceIntegrationError,
  errorCodes,
} = require("../errors/deviceErrors");

class AtosAdapter extends BaseDeviceAdapter {
  getVendorName() {
    return "atos";
  }

  async getStatus() {
    return {
      vendor: this.getVendorName(),
      connectionStatus: this.config.enabled ? "configured" : "disabled",
      deviceStatus: "not_connected",
      lastSyncTime: null,
      deviceIp: this.config.deviceIp || null,
    };
  }

  async fetchTanks() {
    throw new DeviceIntegrationError(
      errorCodes.NOT_IMPLEMENTED,
      "ATOS tank fetch is prepared but not connected to a live system."
    );
  }

  async fetchNozzles() {
    throw new DeviceIntegrationError(
      errorCodes.NOT_IMPLEMENTED,
      "ATOS nozzle fetch is prepared but not connected to a live system."
    );
  }
}

module.exports = AtosAdapter;
