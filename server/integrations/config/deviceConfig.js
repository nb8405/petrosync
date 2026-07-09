const deviceConfig = {
  activeVendor: process.env.DEVICE_VENDOR || "atos",
  atos: {
    apiUrl: process.env.ATOS_API_URL || "",
    username: process.env.ATOS_USERNAME || "",
    password: process.env.ATOS_PASSWORD || "",
    token: process.env.ATOS_TOKEN || "",
    pollingIntervalMs: Number(process.env.ATOS_POLLING_INTERVAL_MS || 300000),
    deviceIp: process.env.ATOS_DEVICE_IP || "",
    enabled:
      String(process.env.ATOS_ENABLED || "false").toLowerCase() === "true",
  },
};

module.exports = deviceConfig;
