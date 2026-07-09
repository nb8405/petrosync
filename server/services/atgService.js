const notConfigured = () => ({
  ok: false,
  message: "ATG provider not configured",
});

module.exports = {
  connect: notConfigured,
  disconnect: notConfigured,
  testConnection: notConfigured,
  fetchTankReadings: notConfigured,
  syncTankReadings: notConfigured,
};
