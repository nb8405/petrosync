class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  providerNotConfigured() {
    return {
      ok: false,
      status: "not_configured",
      message: "Provider not configured",
    };
  }

  async connect() {
    return this.providerNotConfigured();
  }

  async disconnect() {
    return this.providerNotConfigured();
  }

  async testConnection() {
    return this.providerNotConfigured();
  }

  async fetchTankReadings() {
    return this.providerNotConfigured();
  }

  async fetchNozzleReadings() {
    return this.providerNotConfigured();
  }

  async fetchSalesData() {
    return this.providerNotConfigured();
  }

  async sync() {
    return this.providerNotConfigured();
  }
}

module.exports = BaseProvider;
