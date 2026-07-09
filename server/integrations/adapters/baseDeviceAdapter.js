class BaseDeviceAdapter {
  constructor(config) {
    this.config = config;
  }

  getVendorName() {
    return "base";
  }

  async getStatus() {
    return {
      vendor: this.getVendorName(),
      connectionStatus: "not_configured",
      deviceStatus: "unknown",
      lastSyncTime: null,
    };
  }

  async fetchTanks() {
    throw new Error("fetchTanks is not implemented.");
  }

  async fetchNozzles() {
    throw new Error("fetchNozzles is not implemented.");
  }
}

module.exports = BaseDeviceAdapter;
