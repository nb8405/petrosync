import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { backendApi } from './utils/backendApi';

vi.mock('./utils/backendApi', () => ({
  backendApi: {
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    me: vi.fn(),
    setupStatus: vi.fn(),
    fuelMaster: vi.fn(),
    registerPump: vi.fn(),
    getFuelPrices: vi.fn(),
    listWorkspaceFuels: vi.fn(),
    createWorkspaceFuel: vi.fn(),
    updateWorkspaceFuel: vi.fn(),
    getDsr: vi.fn(),
    createDsr: vi.fn(),
    updateDsr: vi.fn(),
    deleteDsr: vi.fn(),
    listDsrHistory: vi.fn(),
    dashboard: vi.fn(),
    backupModuleStatus: vi.fn(),
    listBackups: vi.fn(),
    enterpriseDashboard: vi.fn(),
    listIslands: vi.fn(),
    listPumps: vi.fn(),
    listNozzles: vi.fn(),
    listTanks: vi.fn(),
    listDevices: vi.fn(),
    listShiftConfigs: vi.fn(),
    listShiftRecords: vi.fn(),
    listAlarms: vi.fn(),
    listInventoryItems: vi.fn(),
    listAttendants: vi.fn(),
    listEnterpriseSettings: vi.fn(),
    enterpriseReports: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  backendApi.setupStatus.mockResolvedValue({
    ok: true,
    needsSetup: false,
    workspace: {
      pumpName: 'MAYA KSK',
      company: 'MAYA FILLING CENTRE',
      dealerName: 'KSK',
      themeKey: 'indianOil',
      products: [
        { code: 'FUEL_A', name: 'Fuel A', capacity: 20000 },
        { code: 'FUEL_B', name: 'Fuel B', capacity: 16000 },
        { code: 'FUEL_C', name: 'Fuel C', capacity: 12000 },
        { code: 'FUEL_D', name: 'Fuel D', capacity: 10000 },
      ],
    },
  });
  backendApi.fuelMaster.mockResolvedValue({
    ok: true,
    companies: [],
  });
});

const mockBackendForSignedInOwner = () => {
  backendApi.login.mockResolvedValue({
    ok: true,
    token: 'access-token',
    refreshToken: 'refresh-token',
    csrfToken: 'csrf-token',
    user: {
      id: 1,
      username: 'owner',
      displayName: 'Owner',
      role: 'Owner',
    },
  });
  backendApi.getFuelPrices.mockResolvedValue({
    prices: {
      fuel_a: 100,
      fuel_b: 90,
      fuel_c: 110,
      fuel_d: 95,
    },
  });
  backendApi.listWorkspaceFuels.mockResolvedValue({
    ok: true,
    rows: [],
  });
  backendApi.getDsr.mockRejectedValue(new Error('DSR record not found.'));
  backendApi.createDsr.mockResolvedValue({
    ok: true,
    message: 'DSR record saved successfully.',
    record: {},
  });
  backendApi.updateDsr.mockResolvedValue({
    ok: true,
    message: 'DSR record updated successfully.',
    record: {},
  });
  backendApi.deleteDsr.mockResolvedValue({
    ok: true,
    message: 'DSR deleted successfully.',
  });
  backendApi.listDsrHistory.mockResolvedValue({
    ok: true,
    records: [],
  });
  backendApi.dashboard.mockResolvedValue({
    monthly: { totalSales: 0 },
    products: [],
    monthlyProducts: [],
    dailySales: [],
    monthlySales: [],
  });
  backendApi.backupModuleStatus.mockResolvedValue({
    ok: true,
    schemaVersion: 'backup.v2',
    schedule: {
      enabled: false,
      frequency: 'daily',
      runTime: '02:00',
      retentionCount: 7,
    },
    latestBackup: null,
  });
  backendApi.listBackups.mockResolvedValue({
    ok: true,
    backups: [],
  });
  backendApi.enterpriseDashboard.mockResolvedValue({
    ok: true,
    summary: {},
    tanks: [],
    alarms: [],
    devices: [],
  });
  backendApi.listIslands.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listPumps.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listNozzles.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listTanks.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listDevices.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listShiftConfigs.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listShiftRecords.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listAlarms.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listInventoryItems.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listAttendants.mockResolvedValue({ ok: true, rows: [] });
  backendApi.listEnterpriseSettings.mockResolvedValue({ ok: true, rows: [] });
  backendApi.enterpriseReports.mockResolvedValue({ ok: true, report: {} });
};

const renderDirtyMsEntry = async () => {
  mockBackendForSignedInOwner();
  render(<App />);

  await userEvent.type(await screen.findByLabelText(/Username/i), 'owner');
  await userEvent.type(screen.getByLabelText(/Password/i), 'secret123');
  await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));

  await screen.findByText(/Operations Dashboard/i);
  await userEvent.click(screen.getByTitle('Fuel A'));
  await screen.findByRole('heading', { name: /Fuel A Entry/i });

  const openingInputs = await screen.findAllByPlaceholderText('0');
  await userEvent.type(openingInputs[0], '100');
  await waitFor(() => {
    expect(screen.getAllByText(/Unsaved Changes/i).length).toBeGreaterThan(0);
  });
};

test('renders login screen when signed out', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /Welcome to PetroSync/i })).toBeInTheDocument();
  expect(screen.getByText(/Enterprise Petrol Pump Management Platform/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Sign In/i })).toBeInTheDocument();
}, 15000);

test('cancels beforeunload when fuel entry data is unsaved', async () => {
  await renderDirtyMsEntry();

  const event = new Event('beforeunload', { cancelable: true });
  const prevented = !window.dispatchEvent(event);

  expect(prevented).toBe(true);
  expect(event.defaultPrevented).toBe(true);
}, 15000);

test.each([
  ['Fuel A -> Fuel B', () => screen.getByTitle('Fuel B')],
  ['Fuel A -> Fuel C', () => screen.getByTitle('Fuel C')],
  ['Fuel A -> Fuel D', () => screen.getByTitle('Fuel D')],
  ['Products -> Home', () => screen.getByTitle('Home')],
  ['Products -> Reports', () => screen.getByTitle('Reports')],
  ['Products -> DSR', () => screen.getByTitle('Daily DSR')],
  ['Products -> Configuration', () => screen.getByRole('button', { name: /Configuration/i })],
])('blocks silent navigation for dirty form: %s', async (_label, targetButton) => {
  await renderDirtyMsEntry();

  await userEvent.click(targetButton());

  expect(
    await screen.findByText(/Would you like to save before leaving/i)
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Fuel A Entry/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));

  await waitFor(() => {
    expect(
      screen.queryByText(/Would you like to save before leaving/i)
    ).not.toBeInTheDocument();
  });
  expect(screen.getByRole('heading', { name: /Fuel A Entry/i })).toBeInTheDocument();
}, 15000);

test('shows save-before-logout modal when fuel entry data is unsaved', async () => {
  await renderDirtyMsEntry();

  await userEvent.click(screen.getByRole('button', { name: /Logout/i }));

  expect(
    await screen.findByText(/Would you like to save before logout/i)
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Save & Logout/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Logout Without Saving/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
}, 15000);

test('uses permanent-delete confirmation copy for saved DSR delete', async () => {
  mockBackendForSignedInOwner();
  backendApi.getDsr.mockResolvedValue({
    record: {
      products: [],
      collections: [],
      expenses: [],
    },
  });
  render(<App />);

  await userEvent.type(await screen.findByLabelText(/Username/i), 'owner');
  await userEvent.type(screen.getByLabelText(/Password/i), 'secret123');
  await userEvent.click(screen.getByRole('button', { name: /Sign In/i }));

  await screen.findByText(/Operations Dashboard/i);
  await waitFor(() => {
    expect(backendApi.getDsr).toHaveBeenCalled();
  });
  await userEvent.click(screen.getByTitle('Daily DSR'));

  const deleteButton = await screen.findByRole('button', {
    name: /Delete saved DSR record/i,
  });
  await userEvent.click(deleteButton);

  expect(
    await screen.findByText(/Delete this saved DSR record/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/Product Rows/i)).toBeInTheDocument();
  expect(screen.getByText(/Related Summary Data/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Delete$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
}, 15000);
