import React from "react";
import { backendApi } from "../utils/backendApi";
import { formatMoney, productPrintGroupsFromConfig } from "../utils/dsrData";

const vendors = [
  { value: "atos", label: "ATOS" },
  { value: "doms", label: "DOMS" },
  { value: "veederroot", label: "Veeder Root" },
  { value: "generic", label: "Generic" },
];

const emptyConnection = {
  vendor: "atos",
  ipAddress: "",
  port: "8080",
  username: "",
  password: "",
  syncIntervalMinutes: "15",
  isActive: true,
};

const tankOptionsFromConfig = (products = []) =>
  products.map((product) => ({
    id: product.prefix,
    name: product.tankName,
    productType: product.fuelType,
  }));

const nozzleOptionsFromConfig = (products = []) =>
  products.flatMap((product) =>
    product.nozzles.map((name, index) => ({
      id: `${product.prefix}-nozzle-${index + 1}`,
      name,
      productType: product.fuelType,
    }))
  );

const emptyTankMapping = (tankOptions = []) => ({
  externalTankId: "",
  externalTankName: "",
  internalTankId: tankOptions[0]?.id || "",
  productType: tankOptions[0]?.productType || "",
});

const emptyNozzleMapping = (nozzleOptions = []) => ({
  externalNozzleId: "",
  externalNozzleName: "",
  internalNozzleId: nozzleOptions[0]?.id || "",
  productType: nozzleOptions[0]?.productType || "",
});

const inputValue = (value) => (value === null || value === undefined ? "" : value);

const connectionToForm = (connection) => ({
  vendor: connection?.vendor || "atos",
  ipAddress: connection?.ipAddress || "",
  port: String(connection?.port || "8080"),
  username: connection?.username || "",
  password: "",
  syncIntervalMinutes: String(connection?.syncIntervalMinutes || 15),
  isActive: connection?.isActive ?? true,
});

const statusText = (result) =>
  result?.message || (result?.ok ? "Completed." : "Request failed.");

export default function AutomationIntegrationPage({
  theme,
  user,
  fuelPrices,
  setFuelPrices,
  productConfig,
  title = "Automation Integration",
}) {
  const tankOptions = React.useMemo(
    () => tankOptionsFromConfig(productConfig),
    [productConfig]
  );
  const nozzleOptions = React.useMemo(
    () => nozzleOptionsFromConfig(productConfig),
    [productConfig]
  );
  const priceLabels = React.useMemo(
    () =>
      productPrintGroupsFromConfig(productConfig).map((group) => [
        group.productKey,
        group.title,
      ]),
    [productConfig]
  );
  const [connections, setConnections] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [form, setForm] = React.useState(emptyConnection);
  const [tankMappings, setTankMappings] = React.useState(() => [
    emptyTankMapping(tankOptions),
  ]);
  const [nozzleMappings, setNozzleMappings] = React.useState(() => [
    emptyNozzleMapping(nozzleOptions),
  ]);
  const [message, setMessage] = React.useState("");
  const [priceMessage, setPriceMessage] = React.useState("");
  const [priceForm, setPriceForm] = React.useState(fuelPrices);
  const [loading, setLoading] = React.useState(false);

  const selectedConnection = connections.find(
    (connection) => String(connection.id) === String(selectedId)
  );
  const canManageFuelPrices = user?.role === "Owner";

  React.useEffect(() => {
    setPriceForm(fuelPrices);
  }, [fuelPrices]);

  const loadConnections = React.useCallback(async () => {
    const result = await backendApi.listIntegrations();
    const nextConnections = result.connections || [];
    setConnections(nextConnections);

    if (!selectedId && nextConnections.length > 0) {
      setSelectedId(String(nextConnections[0].id));
      setForm(connectionToForm(nextConnections[0]));
    }

    return nextConnections;
  }, [selectedId]);

  const loadMappings = React.useCallback(async (connectionId) => {
    if (!connectionId) {
      setTankMappings([emptyTankMapping(tankOptions)]);
      setNozzleMappings([emptyNozzleMapping(nozzleOptions)]);
      return;
    }

    const [tanks, nozzles] = await Promise.all([
      backendApi.listIntegrationTanks(connectionId),
      backendApi.listIntegrationNozzles(connectionId),
    ]);

    setTankMappings(
      tanks.mappings?.length ? tanks.mappings : [emptyTankMapping(tankOptions)]
    );
    setNozzleMappings(
      nozzles.mappings?.length
        ? nozzles.mappings
        : [emptyNozzleMapping(nozzleOptions)]
    );
  }, [nozzleOptions, tankOptions]);

  React.useEffect(() => {
    let active = true;

    setLoading(true);
    loadConnections()
      .catch((error) => {
        if (active) {
          setMessage(error.message || "Unable to load integrations.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadConnections]);

  React.useEffect(() => {
    if (selectedConnection) {
      setForm(connectionToForm(selectedConnection));
    }

    loadMappings(selectedId).catch((error) =>
      setMessage(error.message || "Unable to load mappings.")
    );
  }, [selectedId, selectedConnection, loadMappings]);

  const updateForm = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const connectionPayload = () => ({
    vendor: form.vendor,
    ipAddress: form.ipAddress,
    port: Number(form.port),
    username: form.username,
    ...(form.password ? { password: form.password } : {}),
    syncIntervalMinutes: Number(form.syncIntervalMinutes),
    isActive: form.isActive,
  });

  const saveConnection = async () => {
    setLoading(true);
    setMessage("");

    try {
      const result = selectedId
        ? await backendApi.updateIntegration(selectedId, connectionPayload())
        : await backendApi.createIntegration(connectionPayload());
      const nextConnections = await loadConnections();
      const savedId = String(result.connection?.id || selectedId);
      setSelectedId(savedId);
      setConnections(nextConnections);
      setForm(connectionToForm(result.connection));
      setMessage("Automation integration saved.");
    } catch (error) {
      setMessage(error.message || "Unable to save automation integration.");
    } finally {
      setLoading(false);
    }
  };

  const createNew = () => {
    setSelectedId("");
    setForm(emptyConnection);
    setTankMappings([emptyTankMapping(tankOptions)]);
    setNozzleMappings([emptyNozzleMapping(nozzleOptions)]);
    setMessage("");
  };

  const deleteSelected = async () => {
    if (!selectedId) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await backendApi.deleteIntegration(selectedId);
      setSelectedId("");
      setForm(emptyConnection);
      setTankMappings([emptyTankMapping(tankOptions)]);
      setNozzleMappings([emptyNozzleMapping(nozzleOptions)]);
      await loadConnections();
      setMessage("Automation integration deleted.");
    } catch (error) {
      setMessage(error.message || "Unable to delete automation integration.");
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    if (!selectedId) {
      setMessage("Save the integration before testing.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const result = await backendApi.testIntegrationConnection(selectedId);
      setMessage(statusText(result));
    } catch (error) {
      setMessage(error.message || "Connection test failed.");
    } finally {
      setLoading(false);
    }
  };

  const syncNow = async () => {
    if (!selectedId) {
      setMessage("Save the integration before syncing.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const result = await backendApi.syncIntegration(selectedId);
      await loadConnections();
      setMessage(statusText(result));
    } catch (error) {
      setMessage(error.message || "Sync failed.");
    } finally {
      setLoading(false);
    }
  };

  const updateTankMapping = (index, key, value) => {
    setTankMappings((current) =>
      current.map((mapping, itemIndex) =>
        itemIndex === index ? { ...mapping, [key]: value } : mapping
      )
    );
  };

  const updateNozzleMapping = (index, key, value) => {
    setNozzleMappings((current) =>
      current.map((mapping, itemIndex) =>
        itemIndex === index ? { ...mapping, [key]: value } : mapping
      )
    );
  };

  const saveMappings = async () => {
    if (!selectedId) {
      setMessage("Save the integration before mapping.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const cleanedTanks = tankMappings.filter(
        (mapping) => mapping.externalTankId && mapping.internalTankId
      );
      const cleanedNozzles = nozzleMappings.filter(
        (mapping) => mapping.externalNozzleId && mapping.internalNozzleId
      );

      await Promise.all([
        backendApi.saveIntegrationTanks(selectedId, cleanedTanks),
        backendApi.saveIntegrationNozzles(selectedId, cleanedNozzles),
      ]);
      await loadMappings(selectedId);
      setMessage("Automation mappings saved.");
    } catch (error) {
      setMessage(error.message || "Unable to save automation mappings.");
    } finally {
      setLoading(false);
    }
  };

  const updatePrice = (key, value) => {
    setPriceForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const saveFuelPrices = async () => {
    if (!canManageFuelPrices) {
      setPriceMessage("Only Owner can update fuel prices.");
      return;
    }

    setLoading(true);
    setPriceMessage("");

    try {
      const result = await backendApi.updateFuelPrices(priceForm);
      setFuelPrices(result.prices);
      setPriceForm(result.prices);
      setPriceMessage("Fuel prices updated.");
    } catch (error) {
      setPriceMessage(error.message || "Unable to update fuel prices.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="ppm-main">
      <div className="ppm-header">
        <div>
          <p className="ppm-kicker">Settings</p>
          <h1>{title}</h1>
        </div>
        <select
          className="ppm-theme-select"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">New Integration</option>
          {connections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.vendor.toUpperCase()} - {connection.ipAddress}
            </option>
          ))}
        </select>
      </div>

      {message && <div className="ppm-card automation-message">{message}</div>}

      <section className="ppm-card">
        <div className="ppm-card-title">
          <div>
            <h2>Fuel Price Management</h2>
            <span>Current rates drive Product Entry and DSR calculations</span>
          </div>
        </div>

        <div className="fuel-price-grid">
          {priceLabels.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                className="ppm-input"
                type="number"
                min="0"
                step="0.01"
                value={priceForm[key] ?? ""}
                disabled={!canManageFuelPrices}
                onChange={(event) => updatePrice(key, event.target.value)}
              />
              <em>{formatMoney(priceForm[key])} / L</em>
            </label>
          ))}
        </div>

        {priceMessage && <p className="ppm-muted">{priceMessage}</p>}

        <div className="ppm-action-strip">
          <button
            type="button"
            className="ppm-button primary"
            disabled={loading || !canManageFuelPrices}
            onClick={saveFuelPrices}
          >
            Save Fuel Prices
          </button>
        </div>
      </section>

      <section className="ppm-card">
        <div className="ppm-card-title">
          <div>
            <h2>Connection</h2>
            <span>
              {selectedConnection?.hasPassword
                ? "Password stored encrypted"
                : "No password stored"}
            </span>
          </div>
          <label className="automation-toggle">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => updateForm("isActive", event.target.checked)}
            />
            <span>Active</span>
          </label>
        </div>

        <div className="automation-form-grid">
          <label>
            <span>Vendor</span>
            <select
              className="ppm-input"
              value={form.vendor}
              onChange={(event) => updateForm("vendor", event.target.value)}
            >
              {vendors.map((vendor) => (
                <option key={vendor.value} value={vendor.value}>
                  {vendor.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>IP Address</span>
            <input
              className="ppm-input"
              value={form.ipAddress}
              onChange={(event) => updateForm("ipAddress", event.target.value)}
            />
          </label>
          <label>
            <span>Port</span>
            <input
              className="ppm-input"
              type="number"
              min="1"
              max="65535"
              value={form.port}
              onChange={(event) => updateForm("port", event.target.value)}
            />
          </label>
          <label>
            <span>Username</span>
            <input
              className="ppm-input"
              value={form.username}
              onChange={(event) => updateForm("username", event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              className="ppm-input"
              type="password"
              value={form.password}
              placeholder={
                selectedConnection?.hasPassword ? "Leave blank to keep stored password" : ""
              }
              onChange={(event) => updateForm("password", event.target.value)}
            />
          </label>
          <label>
            <span>Sync Frequency</span>
            <input
              className="ppm-input"
              type="number"
              min="1"
              value={form.syncIntervalMinutes}
              onChange={(event) =>
                updateForm("syncIntervalMinutes", event.target.value)
              }
            />
          </label>
        </div>

        <div className="ppm-action-strip">
          <button
            type="button"
            className="ppm-button primary"
            disabled={loading}
            onClick={saveConnection}
          >
            Save
          </button>
          <button
            type="button"
            className="ppm-button secondary"
            disabled={loading}
            onClick={testConnection}
          >
            Test Connection
          </button>
          <button
            type="button"
            className="ppm-button secondary"
            disabled={loading}
            onClick={syncNow}
          >
            Sync Now
          </button>
          <button
            type="button"
            className="ppm-button secondary"
            disabled={loading}
            onClick={createNew}
          >
            New
          </button>
          {selectedId && (
            <button
              type="button"
              className="ppm-button secondary"
              disabled={loading}
              onClick={deleteSelected}
            >
              Delete
            </button>
          )}
        </div>
      </section>

      <section className="automation-mapping-grid">
        <MappingPanel
          title="Automation Tank"
          targetTitle="Internal Tank"
          rows={tankMappings}
          options={tankOptions}
          externalIdKey="externalTankId"
          externalNameKey="externalTankName"
          internalIdKey="internalTankId"
          updateRow={updateTankMapping}
          addRow={() =>
            setTankMappings((rows) => [...rows, emptyTankMapping(tankOptions)])
          }
          removeRow={(index) =>
            setTankMappings((rows) => rows.filter((_, itemIndex) => itemIndex !== index))
          }
        />
        <MappingPanel
          title="Automation Nozzle"
          targetTitle="Internal Nozzle"
          rows={nozzleMappings}
          options={nozzleOptions}
          externalIdKey="externalNozzleId"
          externalNameKey="externalNozzleName"
          internalIdKey="internalNozzleId"
          updateRow={updateNozzleMapping}
          addRow={() =>
            setNozzleMappings((rows) => [
              ...rows,
              emptyNozzleMapping(nozzleOptions),
            ])
          }
          removeRow={(index) =>
            setNozzleMappings((rows) =>
              rows.filter((_, itemIndex) => itemIndex !== index)
            )
          }
        />
      </section>

      <div className="ppm-action-strip">
        <button
          type="button"
          className="ppm-button primary"
          disabled={loading}
          onClick={saveMappings}
        >
          Save Mappings
        </button>
      </div>
    </main>
  );
}

function MappingPanel({
  title,
  targetTitle,
  rows,
  options,
  externalIdKey,
  externalNameKey,
  internalIdKey,
  updateRow,
  addRow,
  removeRow,
}) {
  return (
    <section className="ppm-card automation-panel">
      <div className="ppm-card-title">
        <div>
          <h2>{title}</h2>
          <span>{targetTitle}</span>
        </div>
        <button type="button" className="ppm-button secondary" onClick={addRow}>
          Add
        </button>
      </div>

      <div className="automation-map-list">
        {rows.map((row, index) => {
          const selectedOption = options.find(
            (option) => option.id === row[internalIdKey]
          );

          return (
            <div className="automation-map-row" key={`${title}-${index}`}>
              <label>
                <span>{title} ID</span>
                <input
                  className="ppm-input"
                  value={inputValue(row[externalIdKey])}
                  onChange={(event) =>
                    updateRow(index, externalIdKey, event.target.value)
                  }
                />
              </label>
              <label>
                <span>{title} Name</span>
                <input
                  className="ppm-input"
                  value={inputValue(row[externalNameKey])}
                  onChange={(event) =>
                    updateRow(index, externalNameKey, event.target.value)
                  }
                />
              </label>
              <label>
                <span>{targetTitle}</span>
                <select
                  className="ppm-input"
                  value={inputValue(row[internalIdKey])}
                  onChange={(event) => {
                    const option = options.find(
                      (item) => item.id === event.target.value
                    );
                    updateRow(index, internalIdKey, event.target.value);
                    updateRow(index, "productType", option?.productType || "");
                  }}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Product</span>
                <input
                  className="ppm-input"
                  value={inputValue(row.productType || selectedOption?.productType)}
                  onChange={(event) =>
                    updateRow(index, "productType", event.target.value)
                  }
                />
              </label>
              <button
                type="button"
                className="ppm-button secondary"
                onClick={() => removeRow(index)}
                disabled={rows.length === 1}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
