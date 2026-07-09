const createNozzle = ({
  nozzleId,
  productType,
  dispenserId,
  totalizerReading = 0,
  lastReading = 0,
  lastSyncTime = null,
}) => ({
  nozzleId,
  productType,
  dispenserId,
  totalizerReading,
  lastReading,
  lastSyncTime,
});

const validateNozzle = (nozzle) => {
  const errors = [];

  if (!nozzle.nozzleId) errors.push("nozzleId is required.");
  if (!nozzle.productType) errors.push("productType is required.");
  if (!nozzle.dispenserId) errors.push("dispenserId is required.");
  if (Number(nozzle.totalizerReading || 0) < 0) {
    errors.push("totalizerReading cannot be negative.");
  }
  if (Number(nozzle.lastReading || 0) < 0) {
    errors.push("lastReading cannot be negative.");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

module.exports = {
  createNozzle,
  validateNozzle,
};
