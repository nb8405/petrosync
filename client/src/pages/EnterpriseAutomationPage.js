import React from "react";
import { backendApi } from "../utils/backendApi";
import {
  dateInputValue,
  formatLiters,
  formatMoney,
  productPrintGroupsFromConfig,
} from "../utils/dsrData";
import TrashIcon from "../components/TrashIcon";

const tabs = [
  ["dashboard", "Dashboard"],
  ["forecourt", "Forecourt"],
  ["tanks", "Tanks"],
  ["devices", "Devices"],
  ["shifts", "Shifts"],
  ["dayend", "Day End"],
  ["alarms", "Alarms"],
  ["inventory", "Inventory"],
  ["attendants", "Attendants"],
  ["reports", "Reports"],
  ["config", "Config"],
];

const initialForms = {
  island: { islandNumber: "", islandName: "", vehicleType: "Mixed" },
  pump: { pumpNumber: "", manufacturer: "Tokheim", status: "Online", islandId: "" },
  nozzle: {
    pumpId: "",
    nozzleNumber: "",
    productType: "",
    currentMeterReading: "",
    openingReading: "",
    closingReading: "",
    testingQuantity: "",
  },
  tank: {
    tankNumber: "",
    productType: "",
    capacity: "",
    currentStock: "",
    waterLevel: "",
    temperature: "",
    safeCapacityPercentage: "90",
    reorderLevel: "",
  },
  shift: {
    shiftConfigId: "",
    openingCash: "",
    closingCash: "",
    totalSales: "",
    expenses: "",
    handoverNotes: "",
  },
  inventory: {
    itemName: "",
    category: "Engine Oil",
    unit: "pcs",
    openingStock: "",
    currentStock: "",
    lowStockLevel: "",
  },
  movement: { itemId: "", movementType: "Purchase", quantity: "", amount: "", notes: "" },
  attendant: { name: "", employeeId: "", shiftConfigId: "", assignedPumpId: "" },
  dayEnd: { businessDate: dateInputValue(new Date()) },
  device: { deviceType: "Printer", deviceName: "Receipt Printer", status: "Online", message: "" },
  alarm: { alarmType: "Low Tank Stock", severity: "Medium", message: "" },
};

const statusClass = (status) =>
  String(status || "").toLowerCase().replace(/\s+/g, "-");

const Field = ({ label, children }) => (
  <label>
    <span>{label}</span>
    {children}
  </label>
);

export default function EnterpriseAutomationPage({
  currentTheme,
  setCurrentTheme,
  selectedDate,
  productConfig,
}) {
  const [activeTab, setActiveTab] = React.useState("dashboard");
  const productOptions = React.useMemo(
    () => productPrintGroupsFromConfig(productConfig),
    [productConfig]
  );
  const [data, setData] = React.useState({
    dashboard: null,
    islands: [],
    pumps: [],
    nozzles: [],
    tanks: [],
    devices: [],
    shiftConfigs: [],
    shiftRecords: [],
    alarms: [],
    inventory: [],
    attendants: [],
    settings: [],
    report: null,
  });
  const [forms, setForms] = React.useState(initialForms);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    const defaultProduct = productOptions[0]?.title || "";

    if (!defaultProduct) {
      return;
    }

    setForms((current) => ({
      ...current,
      nozzle: {
        ...current.nozzle,
        productType: current.nozzle.productType || defaultProduct,
      },
      tank: {
        ...current.tank,
        productType: current.tank.productType || defaultProduct,
      },
    }));
  }, [productOptions]);

  const ProductSelect = ({ value, onChange }) => (
    <select className="ppm-input" value={value} onChange={onChange}>
      <option value="">Select Product</option>
      {productOptions.map((product) => (
        <option key={product.productKey} value={product.title}>
          {product.title}
        </option>
      ))}
    </select>
  );

  const patchForm = (name, key, value) =>
    setForms((current) => ({
      ...current,
      [name]: {
        ...current[name],
        [key]: value,
      },
    }));

  const loadAll = React.useCallback(async () => {
    const [
      dashboard,
      islands,
      pumps,
      nozzles,
      tanks,
      devices,
      shiftConfigs,
      shiftRecords,
      alarms,
      inventory,
      attendants,
      settings,
      reports,
    ] = await Promise.all([
      backendApi.enterpriseDashboard(),
      backendApi.listIslands(),
      backendApi.listPumps(),
      backendApi.listNozzles(),
      backendApi.listTanks(),
      backendApi.listDevices(),
      backendApi.listShiftConfigs(),
      backendApi.listShiftRecords(),
      backendApi.listAlarms(),
      backendApi.listInventoryItems(),
      backendApi.listAttendants(),
      backendApi.listEnterpriseSettings(),
      backendApi.enterpriseReports({ fromDate: selectedDate, toDate: selectedDate }),
    ]);

    setData({
      dashboard,
      islands: islands.rows || [],
      pumps: pumps.rows || [],
      nozzles: nozzles.rows || [],
      tanks: tanks.rows || [],
      devices: devices.rows || [],
      shiftConfigs: shiftConfigs.rows || [],
      shiftRecords: shiftRecords.rows || [],
      alarms: alarms.rows || [],
      inventory: inventory.rows || [],
      attendants: attendants.rows || [],
      settings: settings.rows || [],
      report: reports.report || null,
    });
  }, [selectedDate]);

  React.useEffect(() => {
    loadAll().catch((error) => setMessage(error.message || "Unable to load enterprise modules."));
  }, [loadAll]);

  React.useEffect(() => {
    if (activeTab !== "devices") {
      return undefined;
    }

    const timer = setInterval(() => {
      backendApi
        .listDevices()
        .then((devices) =>
          setData((current) => ({ ...current, devices: devices.rows || [] }))
        )
        .catch(() => {});
    }, 30000);

    return () => clearInterval(timer);
  }, [activeTab]);

  const run = async (action, success) => {
    setMessage("");
    try {
      const result = await action();
      await loadAll();
      setMessage(result?.message || success);
    } catch (error) {
      setMessage(error.message || "Action failed.");
    }
  };

  const remove = (label, action) => {
    if (window.confirm(`Delete ${label}?`)) {
      run(action, `${label} deleted.`);
    }
  };

  const renderDashboard = () => {
    const summary = data.dashboard?.summary || {};
    const cards = [
      ["Today's Sales", formatMoney(data.report?.product_sales || 0)],
      ["Stock Volume", formatLiters(summary.fuel_stock || 0)],
      ["Collection", formatMoney(data.report?.collections || 0)],
      ["Expenses", formatMoney(data.report?.expenses || 0)],
      ["Active Pumps", summary.active_pumps || 0],
      ["Offline Pumps", summary.offline_pumps || 0],
    ];

    return (
      <>
        <section className="enterprise-kpi-grid">
          {cards.map(([label, value]) => (
            <article key={label} className="ppm-card enterprise-kpi">
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
        <section className="enterprise-panel-grid">
          <Widget title="Tank Status">
            {data.tanks.slice(0, 6).map((tank) => (
              <div key={tank.id} className="enterprise-list-row">
                <strong>{tank.tank_number}</strong>
                <span>{tank.product_type}</span>
                <em>{Number(tank.capacity_percentage || 0).toFixed(1)}%</em>
              </div>
            ))}
          </Widget>
          <Widget title="Pump Status">
            {data.pumps.slice(0, 6).map((pump) => (
              <div key={pump.id} className="enterprise-list-row">
                <strong>{pump.pump_number}</strong>
                <span>{pump.manufacturer}</span>
                <em className={`status-pill ${statusClass(pump.status)}`}>{pump.status}</em>
              </div>
            ))}
          </Widget>
          <Widget title="Recent Alarms">
            {data.alarms.slice(0, 6).map((alarm) => (
              <div key={alarm.id} className="enterprise-list-row">
                <strong>{alarm.alarm_type}</strong>
                <span>{alarm.severity}</span>
                <em>{alarm.status}</em>
              </div>
            ))}
          </Widget>
        </section>
      </>
    );
  };

  const renderForecourt = () => (
    <section className="enterprise-panel-grid">
      <Widget title="Island Management">
        <div className="enterprise-form-grid">
          <Field label="Island Number">
            <input className="ppm-input" value={forms.island.islandNumber} onChange={(e) => patchForm("island", "islandNumber", e.target.value)} />
          </Field>
          <Field label="Island Name">
            <input className="ppm-input" value={forms.island.islandName} onChange={(e) => patchForm("island", "islandName", e.target.value)} />
          </Field>
          <Field label="Vehicle Type">
            <select className="ppm-input" value={forms.island.vehicleType} onChange={(e) => patchForm("island", "vehicleType", e.target.value)}>
              <option>Four Wheeler</option>
              <option>Two Wheeler</option>
              <option>Mixed</option>
            </select>
          </Field>
        </div>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.createIsland(forms.island), "Island saved.")}>Save Island</button>
        <DataRows rows={data.islands} columns={["island_number", "island_name", "vehicle_type"]} onDelete={(row) => remove("island", () => backendApi.deleteIsland(row.id))} />
      </Widget>
      <Widget title="Pump Management">
        <div className="enterprise-form-grid">
          <Field label="Pump Number"><input className="ppm-input" value={forms.pump.pumpNumber} onChange={(e) => patchForm("pump", "pumpNumber", e.target.value)} /></Field>
          <Field label="Manufacturer"><select className="ppm-input" value={forms.pump.manufacturer} onChange={(e) => patchForm("pump", "manufacturer", e.target.value)}><option>Tokheim</option><option>Gilbarco</option><option>Other</option></select></Field>
          <Field label="Status"><select className="ppm-input" value={forms.pump.status} onChange={(e) => patchForm("pump", "status", e.target.value)}><option>Online</option><option>Offline</option><option>Maintenance</option></select></Field>
          <Field label="Assigned Island"><select className="ppm-input" value={forms.pump.islandId} onChange={(e) => patchForm("pump", "islandId", e.target.value)}><option value="">Unassigned</option>{data.islands.map((item) => <option key={item.id} value={item.id}>{item.island_number}</option>)}</select></Field>
        </div>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.createPump(forms.pump), "Pump saved.")}>Save Pump</button>
        <DataRows rows={data.pumps} columns={["pump_number", "manufacturer", "status", "island_number"]} onDelete={(row) => remove("pump", () => backendApi.deletePump(row.id))} />
      </Widget>
      <Widget title="Nozzle Management">
        <div className="enterprise-form-grid">
          <Field label="Pump"><select className="ppm-input" value={forms.nozzle.pumpId} onChange={(e) => patchForm("nozzle", "pumpId", e.target.value)}><option value="">Select Pump</option>{data.pumps.map((item) => <option key={item.id} value={item.id}>{item.pump_number}</option>)}</select></Field>
          <Field label="Nozzle Number"><input className="ppm-input" value={forms.nozzle.nozzleNumber} onChange={(e) => patchForm("nozzle", "nozzleNumber", e.target.value)} /></Field>
          <Field label="Product"><ProductSelect value={forms.nozzle.productType} onChange={(e) => patchForm("nozzle", "productType", e.target.value)} /></Field>
          {["currentMeterReading", "openingReading", "closingReading", "testingQuantity"].map((field) => <Field key={field} label={field.replace(/[A-Z]/g, " $&")}><input className="ppm-input" type="number" value={forms.nozzle[field]} onChange={(e) => patchForm("nozzle", field, e.target.value)} /></Field>)}
        </div>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.createNozzle(forms.nozzle), "Nozzle saved.")}>Save Nozzle</button>
        <DataRows rows={data.nozzles} columns={["pump_number", "nozzle_number", "product_type", "current_meter_reading", "total_sales"]} onDelete={(row) => remove("nozzle", () => backendApi.deleteNozzle(row.id))} />
      </Widget>
    </section>
  );

  const renderTanks = () => (
    <section className="enterprise-panel-grid">
      <Widget title="Tank Status Module">
        <div className="enterprise-form-grid">
          {[
            ["tankNumber", "Tank Number"],
            ["capacity", "Capacity"],
            ["currentStock", "Current Stock"],
            ["waterLevel", "Water Level"],
            ["temperature", "Temperature"],
            ["safeCapacityPercentage", "Safe Capacity %"],
            ["reorderLevel", "Reorder Level"],
          ].map(([field, label]) => (
            <Field key={field} label={label}><input className="ppm-input" type={field === "tankNumber" ? "text" : "number"} value={forms.tank[field]} onChange={(e) => patchForm("tank", field, e.target.value)} /></Field>
          ))}
          <Field label="Product"><ProductSelect value={forms.tank.productType} onChange={(e) => patchForm("tank", "productType", e.target.value)} /></Field>
        </div>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.createTank(forms.tank), "Tank saved.")}>Save Tank</button>
      </Widget>
      <Widget title="Tank Health">
        <DataRows rows={data.tanks} columns={["tank_number", "product_type", "capacity_percentage", "current_stock", "water_level", "health_status"]} onDelete={(row) => remove("tank", () => backendApi.deleteTank(row.id))} />
      </Widget>
    </section>
  );

  const renderDevices = () => (
    <section className="enterprise-panel-grid">
      <Widget title="Device Monitoring">
        <div className="enterprise-form-grid">
          <Field label="Device Type"><select className="ppm-input" value={forms.device.deviceType} onChange={(e) => patchForm("device", "deviceType", e.target.value)}><option>Pump</option><option>Tank</option><option>Server</option><option>Database</option><option>Printer</option><option>Network</option></select></Field>
          <Field label="Device Name"><input className="ppm-input" value={forms.device.deviceName} onChange={(e) => patchForm("device", "deviceName", e.target.value)} /></Field>
          <Field label="Status"><select className="ppm-input" value={forms.device.status} onChange={(e) => patchForm("device", "status", e.target.value)}><option>Online</option><option>Offline</option><option>Warning</option></select></Field>
          <Field label="Message"><input className="ppm-input" value={forms.device.message} onChange={(e) => patchForm("device", "message", e.target.value)} /></Field>
        </div>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.saveDevice(forms.device), "Device status saved.")}>Save Status</button>
        <DataRows rows={data.devices} columns={["device_type", "device_name", "status", "message"]} />
        <p className="ppm-muted">This page polls live status every 30 seconds.</p>
      </Widget>
    </section>
  );

  const renderShifts = () => (
    <section className="enterprise-panel-grid">
      <Widget title="Shift Config">
        <DataRows rows={data.shiftConfigs} columns={["shift_name", "start_time", "end_time", "is_active"]} />
      </Widget>
      <Widget title="Shift Start / End">
        <div className="enterprise-form-grid">
          <Field label="Shift"><select className="ppm-input" value={forms.shift.shiftConfigId} onChange={(e) => patchForm("shift", "shiftConfigId", e.target.value)}><option value="">Select Shift</option>{data.shiftConfigs.map((item) => <option key={item.id} value={item.id}>{item.shift_name}</option>)}</select></Field>
          {["openingCash", "closingCash", "totalSales", "expenses"].map((field) => <Field key={field} label={field.replace(/[A-Z]/g, " $&")}><input className="ppm-input" type="number" value={forms.shift[field]} onChange={(e) => patchForm("shift", field, e.target.value)} /></Field>)}
          <Field label="Handover Notes"><input className="ppm-input" value={forms.shift.handoverNotes} onChange={(e) => patchForm("shift", "handoverNotes", e.target.value)} /></Field>
        </div>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.createShiftRecord(forms.shift), "Shift record saved.")}>Start Shift</button>
        <DataRows rows={data.shiftRecords} columns={["shift_date", "status", "opening_cash", "closing_cash", "total_sales", "expenses"]} />
      </Widget>
    </section>
  );

  const renderDayEnd = () => (
    <Widget title="Day End Operations">
      <div className="enterprise-form-grid">
        <Field label="Business Date"><input className="ppm-input" type="date" value={forms.dayEnd.businessDate} onChange={(e) => patchForm("dayEnd", "businessDate", e.target.value)} /></Field>
      </div>
      <div className="ppm-action-strip">
        <button className="ppm-button secondary" onClick={() => run(() => backendApi.validateDayEnd(forms.dayEnd), "Day end validation completed.")}>Validate</button>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.completeDayEnd(forms.dayEnd), "Day locked successfully.")}>Complete Day End</button>
      </div>
      <p className="ppm-muted">Validates DSR, tank stock, expenses and collections before locking the day.</p>
    </Widget>
  );

  const renderAlarms = () => (
    <Widget title="Event & Alarm Center">
      <div className="enterprise-form-grid">
        <Field label="Alarm Type"><select className="ppm-input" value={forms.alarm.alarmType} onChange={(e) => patchForm("alarm", "alarmType", e.target.value)}><option>Low Tank Stock</option><option>Pump Offline</option><option>Nozzle Error</option><option>Database Error</option><option>Network Error</option></select></Field>
        <Field label="Severity"><select className="ppm-input" value={forms.alarm.severity} onChange={(e) => patchForm("alarm", "severity", e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></Field>
        <Field label="Message"><input className="ppm-input" value={forms.alarm.message} onChange={(e) => patchForm("alarm", "message", e.target.value)} /></Field>
      </div>
      <button className="ppm-button primary" onClick={() => run(() => backendApi.createAlarm(forms.alarm), "Alarm created.")}>Create Alarm</button>
      <DataRows rows={data.alarms} columns={["alarm_type", "severity", "status", "message"]} actions={(row) => <><button className="ppm-button secondary" onClick={() => run(() => backendApi.updateAlarmStatus(row.id, "Acknowledged"), "Alarm acknowledged.")}>Ack</button><button className="ppm-button secondary" onClick={() => run(() => backendApi.updateAlarmStatus(row.id, "Resolved"), "Alarm resolved.")}>Resolve</button></>} />
    </Widget>
  );

  const renderInventory = () => (
    <section className="enterprise-panel-grid">
      <Widget title="Dry Stock">
        <div className="enterprise-form-grid">
          <Field label="Item Name"><input className="ppm-input" value={forms.inventory.itemName} onChange={(e) => patchForm("inventory", "itemName", e.target.value)} /></Field>
          <Field label="Category"><select className="ppm-input" value={forms.inventory.category} onChange={(e) => patchForm("inventory", "category", e.target.value)}><option>Engine Oil</option><option>Gear Oil</option><option>Grease</option><option>Additives</option><option>Consumables</option></select></Field>
          {["unit", "openingStock", "currentStock", "lowStockLevel"].map((field) => <Field key={field} label={field.replace(/[A-Z]/g, " $&")}><input className="ppm-input" value={forms.inventory[field]} onChange={(e) => patchForm("inventory", field, e.target.value)} /></Field>)}
        </div>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.createInventoryItem(forms.inventory), "Inventory item saved.")}>Save Item</button>
        <DataRows rows={data.inventory} columns={["item_name", "category", "current_stock", "low_stock_level"]} />
      </Widget>
      <Widget title="Stock Movement">
        <div className="enterprise-form-grid">
          <Field label="Item"><select className="ppm-input" value={forms.movement.itemId} onChange={(e) => patchForm("movement", "itemId", e.target.value)}><option value="">Select Item</option>{data.inventory.map((item) => <option key={item.id} value={item.id}>{item.item_name}</option>)}</select></Field>
          <Field label="Type"><select className="ppm-input" value={forms.movement.movementType} onChange={(e) => patchForm("movement", "movementType", e.target.value)}><option>Purchase</option><option>Sale</option><option>Adjustment</option></select></Field>
          <Field label="Quantity"><input className="ppm-input" type="number" value={forms.movement.quantity} onChange={(e) => patchForm("movement", "quantity", e.target.value)} /></Field>
          <Field label="Amount"><input className="ppm-input" type="number" value={forms.movement.amount} onChange={(e) => patchForm("movement", "amount", e.target.value)} /></Field>
        </div>
        <button className="ppm-button primary" onClick={() => run(() => backendApi.createInventoryMovement(forms.movement), "Stock movement saved.")}>Save Movement</button>
      </Widget>
    </section>
  );

  const renderAttendants = () => (
    <Widget title="Attendant Management">
      <div className="enterprise-form-grid">
        <Field label="Name"><input className="ppm-input" value={forms.attendant.name} onChange={(e) => patchForm("attendant", "name", e.target.value)} /></Field>
        <Field label="Employee ID"><input className="ppm-input" value={forms.attendant.employeeId} onChange={(e) => patchForm("attendant", "employeeId", e.target.value)} /></Field>
        <Field label="Shift"><select className="ppm-input" value={forms.attendant.shiftConfigId} onChange={(e) => patchForm("attendant", "shiftConfigId", e.target.value)}><option value="">Select Shift</option>{data.shiftConfigs.map((item) => <option key={item.id} value={item.id}>{item.shift_name}</option>)}</select></Field>
        <Field label="Assigned Pump"><select className="ppm-input" value={forms.attendant.assignedPumpId} onChange={(e) => patchForm("attendant", "assignedPumpId", e.target.value)}><option value="">Select Pump</option>{data.pumps.map((item) => <option key={item.id} value={item.id}>{item.pump_number}</option>)}</select></Field>
      </div>
      <button className="ppm-button primary" onClick={() => run(() => backendApi.createAttendant(forms.attendant), "Attendant saved.")}>Save Attendant</button>
      <DataRows rows={data.attendants} columns={["name", "employee_id", "is_active"]} />
    </Widget>
  );

  const renderReports = () => (
    <Widget title="ATOS Style Report Center">
      <div className="enterprise-report-grid">
        {[
          ["Daily Sales", data.report?.product_sales],
          ["Monthly Sales", data.report?.product_sales],
          ["Tank Inventory", data.dashboard?.summary?.fuel_stock],
          ["Shift Report", data.report?.shift_sales],
          ["Pump Sales", data.dashboard?.summary?.nozzle_sales],
          ["Nozzle Sales", data.dashboard?.summary?.nozzle_sales],
          ["Product Wise Sales", data.report?.product_sales],
          ["Expense Report", data.report?.expenses],
          ["Collection Report", data.report?.collections],
          ["Employee Sales Report", data.report?.attendant_collections],
        ].map(([name, value]) => (
          <article key={name} className="enterprise-report-card">
            <span>{name}</span>
            <strong>{formatMoney(value || 0)}</strong>
            <div className="ppm-action-strip">
              <button className="ppm-button secondary">PDF</button>
              <button className="ppm-button secondary">Excel</button>
              <button className="ppm-button secondary">Print</button>
            </div>
          </article>
        ))}
      </div>
    </Widget>
  );

  const renderConfig = () => (
    <Widget title="Configuration Center">
      <DataRows rows={data.settings} columns={["section", "setting_key", "value"]} />
      <p className="ppm-muted">Station Settings, Fuel Prices, Shift Config, Tax Settings, Receipt Settings and DSR Template Settings are backed by the configuration API.</p>
    </Widget>
  );

  const renderTab = () => {
    if (activeTab === "dashboard") return renderDashboard();
    if (activeTab === "forecourt") return renderForecourt();
    if (activeTab === "tanks") return renderTanks();
    if (activeTab === "devices") return renderDevices();
    if (activeTab === "shifts") return renderShifts();
    if (activeTab === "dayend") return renderDayEnd();
    if (activeTab === "alarms") return renderAlarms();
    if (activeTab === "inventory") return renderInventory();
    if (activeTab === "attendants") return renderAttendants();
    if (activeTab === "reports") return renderReports();
    return renderConfig();
  };

  return (
    <main className="ppm-main enterprise-page">
      <header className="ppm-header">
        <div>
          <p className="ppm-kicker">ATOS Ready Automation</p>
          <h1>Forecourt Operations Center</h1>
          <p className="ppm-muted">Fuel islands, pumps, nozzles, tanks, shifts, alarms, inventory and attendant control.</p>
        </div>
        <select value={currentTheme} onChange={(e) => setCurrentTheme(e.target.value)} className="ppm-theme-select">
          <option value="indianOil">IndianOil Classic</option>
          <option value="neonBlue">Neon Blue</option>
          <option value="emerald">Emerald Green</option>
          <option value="dark">Dark Mode</option>
        </select>
      </header>
      {message && <div className="ppm-status-banner">{message}</div>}
      <nav className="enterprise-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      {renderTab()}
    </main>
  );
}

function Widget({ title, children }) {
  return (
    <section className="ppm-card enterprise-widget">
      <div className="ppm-card-title">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DataRows({ rows = [], columns = [], onDelete, actions }) {
  if (!rows.length) {
    return (
      <div className="ppm-empty-state">
        <strong>No records</strong>
        <span>Use the form above to create records.</span>
      </div>
    );
  }

  return (
    <div className="enterprise-table">
      {rows.map((row) => (
        <article key={row.id || JSON.stringify(row)} className="enterprise-row">
          {columns.map((column) => (
            <div key={column}>
              <span>{column.replace(/_/g, " ")}</span>
              <strong>
                {typeof row[column] === "object"
                  ? JSON.stringify(row[column])
                  : row[column] ?? "-"}
              </strong>
            </div>
          ))}
          {(onDelete || actions) && (
            <div className="enterprise-row-actions">
              {actions?.(row)}
              {onDelete && (
                <button className="ppm-button danger icon-action-button" onClick={() => onDelete(row)} title="Delete">
                  <TrashIcon />
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
