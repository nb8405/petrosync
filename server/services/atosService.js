const notConfigured = () => ({
  ok: false,
  message: "ATOS provider not configured",
});

module.exports = {
  connect: notConfigured,
  disconnect: notConfigured,
  testConnection: notConfigured,
  fetchTankReadings: notConfigured,
  fetchNozzleReadings: notConfigured,
  fetchSalesData: notConfigured,
  sync: notConfigured,
};
