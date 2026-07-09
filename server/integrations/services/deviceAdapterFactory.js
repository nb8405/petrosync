const deviceConfig = require("../config/deviceConfig");
const AtosAdapter = require("../atos/atosAdapter");

const createDeviceAdapter = (vendor = deviceConfig.activeVendor) => {
  if (vendor === "atos") {
    return new AtosAdapter(deviceConfig.atos);
  }

  throw new Error(`Unsupported device vendor: ${vendor}`);
};

module.exports = {
  createDeviceAdapter,
};
