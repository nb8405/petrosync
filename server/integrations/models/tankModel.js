const createTank = ({
  tankId,
  productType,
  tankName,
  capacity = 0,
  currentVolume = 0,
  waterLevel = 0,
  temperature = null,
  lastSyncTime = null,
}) => ({
  tankId,
  productType,
  tankName,
  capacity,
  currentVolume,
  waterLevel,
  temperature,
  lastSyncTime,
});

const validateTank = (tank) => {
  const errors = [];

  if (!tank.tankId) errors.push("tankId is required.");
  if (!tank.productType) errors.push("productType is required.");
  if (!tank.tankName) errors.push("tankName is required.");
  if (Number(tank.capacity || 0) < 0) errors.push("capacity cannot be negative.");
  if (Number(tank.currentVolume || 0) < 0) errors.push("currentVolume cannot be negative.");
  if (Number(tank.waterLevel || 0) < 0) errors.push("waterLevel cannot be negative.");

  return {
    ok: errors.length === 0,
    errors,
  };
};

module.exports = {
  createTank,
  validateTank,
};
