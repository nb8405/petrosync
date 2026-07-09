const notConfigured = () => ({
  ok: false,
  message: "FCC provider not configured",
});

module.exports = {
  connect: notConfigured,
  disconnect: notConfigured,
  testConnection: notConfigured,
  fetchPumpStatus: notConfigured,
  fetchNozzleReadings: notConfigured,
  syncPumpController: notConfigured,
};
