import { apiClient } from "./apiClient";
import {
  productRowsFromForm,
  dateInputValue,
} from "./dsrData";

const dateParamValue = (date) =>
  date instanceof Date ? dateInputValue(date) : String(date || "").slice(0, 10);

const collectionFields = ["cash", "upi", "card", "fleet", "credit"];
const expenseFields = ["generator", "staff", "cleaning", "maintenance"];

export const formToDsrPayload = (date, form, fuelPrices, productConfig) => {
  const products = productRowsFromForm(form, fuelPrices, productConfig).map((product) => ({
    productCode: product.prefix,
    productLabel: product.label,
    openingReading: Number(product.opening || 0),
    closingReading: Number(product.closing || 0),
    testingQty: Number(product.testing || 0),
    receiptQty: Number(product.receipt || 0),
    tankDip: Number(product.tankDip || 0),
    waterDip: Number(product.waterDip || 0),
    salesLiters: Number(product.sales || 0),
    rate: Number(product.rate || 0),
    amount: Number(product.amount || 0),
    closingStock: Number(product.closingStock || 0),
  }));

  return {
    dsrDate: dateInputValue(date),
    products,
    collections: collectionFields.map((field) => ({
      collectionType: field,
      amount: Number(form[field] || 0),
    })),
    expenses: expenseFields.map((field) => ({
      expenseType: field,
      amount: Number(form[field] || 0),
    })),
  };
};

export const backendApi = {
  login: ({ username, password }) =>
    apiClient.post("/auth/login", { username, password }),
  logout: (refreshToken) =>
    apiClient.post("/auth/logout", refreshToken ? { refreshToken } : {}),
  refresh: (refreshToken) =>
    apiClient.post("/auth/refresh", refreshToken ? { refreshToken } : {}),
  me: () => apiClient.get("/auth/me"),
  setupStatus: () => apiClient.get("/auth/setup-status"),
  fuelMaster: () => apiClient.get("/auth/fuel-master"),
  registerPump: (payload) => apiClient.post("/auth/register-pump", payload),
  listUsers: () => apiClient.get("/auth/users"),
  deleteUser: (id, payload) => apiClient.delete(`/auth/users/${id}`, payload),
  getFuelPrices: () => apiClient.get("/settings/fuel-prices"),
  updateFuelPrices: (prices) =>
    apiClient.put("/settings/fuel-prices", { prices }),
  listWorkspaceFuels: () => apiClient.get("/settings/fuels"),
  createWorkspaceFuel: (payload) => apiClient.post("/settings/fuels", payload),
  updateWorkspaceFuel: (id, payload) => apiClient.put(`/settings/fuels/${id}`, payload),
  createDsr: (date, form, fuelPrices, productConfig) =>
    apiClient.post("/dsr", formToDsrPayload(date, form, fuelPrices, productConfig)),
  updateDsr: (date, form, fuelPrices, productConfig) =>
    apiClient.put(
      `/dsr/${dateInputValue(date)}`,
      formToDsrPayload(date, form, fuelPrices, productConfig)
    ),
  getDsr: (date) => apiClient.get(`/dsr/${dateParamValue(date)}`),
  deleteDsr: (date) => apiClient.delete(`/dsr/${dateParamValue(date)}`),
  listDsrHistory: ({ fromDate, toDate, product = "overall" }) =>
    apiClient.get(
      `/dsr/history/list?fromDate=${dateParamValue(fromDate)}&toDate=${dateParamValue(
        toDate
      )}&product=${product}`
    ),
  reportRange: ({ fromDate, toDate, product = "overall" }) =>
    apiClient.get(
      `/reports/range?fromDate=${dateInputValue(fromDate)}&toDate=${dateInputValue(
        toDate
      )}&product=${product}`
    ),
  reportMonthly: ({ year, month, product = "overall", recordHistory = true }) =>
    apiClient.get(
      `/reports/monthly?year=${year}&month=${month}&product=${product}&recordHistory=${recordHistory}`
    ),
  dashboard: (date) =>
    apiClient.get(`/dashboard?date=${dateInputValue(date)}`),
  exportReport: ({ exportType, fromDate, toDate, product = "overall" }) =>
    apiClient.post("/operations/exports", {
      exportType,
      fromDate: dateInputValue(fromDate),
      toDate: dateInputValue(toDate),
      product,
    }),
  createPrintReference: ({ fromDate, toDate, product = "overall" }) =>
    apiClient.post("/operations/prints", {
      fromDate: dateInputValue(fromDate),
      toDate: dateInputValue(toDate),
      product,
    }),
  manualBackup: () => apiClient.post("/operations/backups/manual", {}),
  backupStatus: () => apiClient.get("/operations/backups/status"),
  listBackups: () => apiClient.get("/backups"),
  backupModuleStatus: () => apiClient.get("/backups/status"),
  createBackup: () => apiClient.post("/backups/create", {}),
  downloadBackup: (id) => apiClient.blob(`/backups/${id}/download`),
  verifyBackup: (payload) => apiClient.post("/backups/verify", payload),
  restoreBackup: (payload) => apiClient.post("/backups/restore", payload),
  deleteBackup: (id) => apiClient.delete(`/backups/${id}`),
  updateBackupSchedule: (schedule) => apiClient.post("/backups/schedule", schedule),
  enterpriseDashboard: () => apiClient.get("/forecourt/dashboard"),
  listIslands: () => apiClient.get("/forecourt/islands"),
  createIsland: (payload) => apiClient.post("/forecourt/islands", payload),
  updateIsland: (id, payload) => apiClient.put(`/forecourt/islands/${id}`, payload),
  deleteIsland: (id) => apiClient.delete(`/forecourt/islands/${id}`),
  listPumps: () => apiClient.get("/forecourt/pumps"),
  createPump: (payload) => apiClient.post("/forecourt/pumps", payload),
  updatePump: (id, payload) => apiClient.put(`/forecourt/pumps/${id}`, payload),
  deletePump: (id) => apiClient.delete(`/forecourt/pumps/${id}`),
  listNozzles: () => apiClient.get("/forecourt/nozzles"),
  createNozzle: (payload) => apiClient.post("/forecourt/nozzles", payload),
  updateNozzle: (id, payload) => apiClient.put(`/forecourt/nozzles/${id}`, payload),
  deleteNozzle: (id) => apiClient.delete(`/forecourt/nozzles/${id}`),
  listTanks: () => apiClient.get("/tanks"),
  createTank: (payload) => apiClient.post("/tanks", payload),
  updateTank: (id, payload) => apiClient.put(`/tanks/${id}`, payload),
  deleteTank: (id) => apiClient.delete(`/tanks/${id}`),
  createTankReading: (payload) => apiClient.post("/tank-readings", payload),
  listTankAlerts: () => apiClient.get("/tank-alerts"),
  listDevices: () => apiClient.get("/forecourt/devices"),
  saveDevice: (payload) => apiClient.post("/forecourt/devices", payload),
  listShiftConfigs: () => apiClient.get("/forecourt/shift-configs"),
  listShiftRecords: () => apiClient.get("/forecourt/shift-records"),
  createShiftRecord: (payload) => apiClient.post("/forecourt/shift-records", payload),
  updateShiftRecord: (id, payload) => apiClient.put(`/forecourt/shift-records/${id}`, payload),
  validateDayEnd: (payload) => apiClient.post("/forecourt/day-end/validate", payload),
  completeDayEnd: (payload) => apiClient.post("/forecourt/day-end/complete", payload),
  listAlarms: () => apiClient.get("/forecourt/alarms"),
  createAlarm: (payload) => apiClient.post("/forecourt/alarms", payload),
  updateAlarmStatus: (id, status) => apiClient.post(`/forecourt/alarms/${id}/status`, { status }),
  listInventoryItems: () => apiClient.get("/forecourt/inventory/items"),
  createInventoryItem: (payload) => apiClient.post("/forecourt/inventory/items", payload),
  createInventoryMovement: (payload) => apiClient.post("/forecourt/inventory/movements", payload),
  listAttendants: () => apiClient.get("/forecourt/attendants"),
  createAttendant: (payload) => apiClient.post("/forecourt/attendants", payload),
  enterpriseReports: ({ fromDate, toDate }) =>
    apiClient.get(`/forecourt/reports?fromDate=${dateParamValue(fromDate)}&toDate=${dateParamValue(toDate)}`),
  listEnterpriseSettings: () => apiClient.get("/forecourt/settings"),
  updateEnterpriseSetting: (key, payload) => apiClient.put(`/forecourt/settings/${key}`, payload),
  requestRestore: ({ filePath }) =>
    apiClient.post("/operations/restore/request", { filePath }),
  approveRestore: ({ restoreNumber }) =>
    apiClient.post("/operations/restore/approve", { restoreNumber }),
  runRestore: ({ restoreNumber }) =>
    apiClient.post("/operations/restore/run", { restoreNumber }),
  listIntegrations: () => apiClient.get("/integrations"),
  createIntegration: (payload) => apiClient.post("/integrations", payload),
  updateIntegration: (id, payload) => apiClient.put(`/integrations/${id}`, payload),
  deleteIntegration: (id) => apiClient.delete(`/integrations/${id}`),
  listIntegrationTanks: (id) => apiClient.get(`/integrations/${id}/tanks`),
  saveIntegrationTanks: (id, mappings) =>
    apiClient.put(`/integrations/${id}/tanks`, { mappings }),
  listIntegrationNozzles: (id) => apiClient.get(`/integrations/${id}/nozzles`),
  saveIntegrationNozzles: (id, mappings) =>
    apiClient.put(`/integrations/${id}/nozzles`, { mappings }),
  testIntegrationConnection: (id) =>
    apiClient.post(`/integrations/${id}/test-connection`, {}),
  syncIntegration: (id) => apiClient.post(`/integrations/${id}/sync`, {}),
};
