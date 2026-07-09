const errorCodes = {
  DEVICE_OFFLINE: "DEVICE_OFFLINE",
  NETWORK_FAILURE: "NETWORK_FAILURE",
  AUTHENTICATION_FAILURE: "AUTHENTICATION_FAILURE",
  PARTIAL_SYNC: "PARTIAL_SYNC",
  INVALID_DATA: "INVALID_DATA",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
};

class DeviceIntegrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DeviceIntegrationError";
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  errorCodes,
  DeviceIntegrationError,
};
