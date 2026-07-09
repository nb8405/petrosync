const tankMappings = {
  // Example:
  // "ATOS-TANK-1": { appTankId: "ms", productType: "MS" },
};

const nozzleMappings = {
  // Example:
  // "ATOS-NOZZLE-1": { appNozzleId: "msN1", productType: "MS" },
};

const mapTankId = (vendorTankId) => tankMappings[vendorTankId] || null;

const mapNozzleId = (vendorNozzleId) =>
  nozzleMappings[vendorNozzleId] || null;

module.exports = {
  tankMappings,
  nozzleMappings,
  mapTankId,
  mapNozzleId,
};
