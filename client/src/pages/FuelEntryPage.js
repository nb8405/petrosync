import React from "react";
import {
  dateFromInput,
  dateInputValue,
  formatLiters,
  formatMoney,
  nozzleFieldPrefix,
  productPrintGroupsFromConfig,
  productPrintGroupForKey,
  productRowsFromForm,
} from "../utils/dsrData";
import { exportBackendDsrPdf } from "../utils/dsrPrint";
import { backendApi } from "../utils/backendApi";
import NumericInput from "../components/NumericInput";
import TrashIcon from "../components/TrashIcon";
import OperationsHeader from "../components/OperationsHeader";
import StatusTicker from "../components/StatusTicker";

export default function FuelEntryPage({
  productKey,
  selectedDate,
  setSelectedDate,
  form,
  updateField,
  setCurrentPage,
  fuelPrices,
  saveCurrentRecord,
  saveState,
  hasUnsavedChanges,
  recordStatus,
  saveBeforePrint,
  user,
  pumpBranding,
  deleteDsrRecord,
  productConfig,
}) {
  const productGroups = productPrintGroupsFromConfig(productConfig);
  const group = productPrintGroupForKey(productKey, productGroups);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyStatus, setHistoryStatus] = React.useState("idle");
  const [productHistory, setProductHistory] = React.useState([]);

  if (!group) {
    return (
      <main className="ppm-main products-page">
        <section className="ppm-card">
          <h1>Product not found</h1>
          <p className="ppm-muted">
            The selected fuel product is not configured.
          </p>
          <button
            type="button"
            className="ppm-button primary"
            onClick={() => setCurrentPage("products")}
          >
            Back to Products
          </button>
        </section>
      </main>
    );
  }

  const productRows = productRowsFromForm(form, fuelPrices, productConfig).filter((product) =>
    group.prefixes.includes(product.prefix)
  );
  const groupLiters = productRows.reduce(
    (sum, product) => sum + product.sales,
    0
  );
  const groupAmount = productRows.reduce(
    (sum, product) => sum + product.amount,
    0
  );
  const dateValue = dateInputValue(selectedDate);
  const saveIndicatorState = saveState === "failed" ? "failed" : hasUnsavedChanges ? "unsaved" : "saved";
  const saveLabel =
    saveState === "failed"
      ? "Save Failed"
      : hasUnsavedChanges
      ? "Unsaved Changes"
      : "Saved";
  const productCompletion = productRows.length
    ? Math.round(
        (productRows.filter((product) =>
          product.nozzleRows.some(
            (nozzle) =>
              nozzle.opening !== "" || nozzle.closing !== "" || nozzle.testing !== ""
          )
        ).length /
          productRows.length) *
          100
      )
    : 0;

  const printCurrentProduct = async () => {
      const printGroup = productPrintGroupForKey(productKey, productGroups);
    try {
      if (!(await saveBeforePrint())) {
        return;
      }

      const result = await backendApi.createPrintReference({
        fromDate: selectedDate,
        toDate: selectedDate,
        product: printGroup.productKey,
      });
      exportBackendDsrPdf(result.report);
    } catch {
      alert("Unable to generate product report from backend.");
    }
  };

  const handleSave = async () => {
    if (!saveCurrentRecord) {
      return;
    }

    const result = await saveCurrentRecord();
    alert(result.message);
  };

  const loadProductHistory = async () => {
    setHistoryStatus("loading");
    const fromDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() - 5,
      1
    );
    const toDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      0
    );

    try {
      const history = await backendApi.listDsrHistory({
        fromDate,
        toDate,
        product: group.productKey,
      });
      setProductHistory(history.records || []);
      setHistoryStatus("loaded");
    } catch {
      setProductHistory([]);
      setHistoryStatus("error");
    }
  };

  const openHistory = () => {
    setHistoryOpen(true);
    loadProductHistory();
  };

  const printHistoryRecord = async (record) => {
    try {
      const result = await backendApi.reportRange({
        fromDate: dateFromInput(record.dsrDate),
        toDate: dateFromInput(record.dsrDate),
        product: group.productKey,
      });
      exportBackendDsrPdf(result);
    } catch {
      alert("Unable to print product history record.");
    }
  };

  const viewHistoryRecord = async (record) => {
    const changed = await setSelectedDate(dateFromInput(record.dsrDate));

    if (changed !== false) {
      setHistoryOpen(false);
    }
  };

  const deleteHistoryRecord = async (record) => {
    const result = await deleteDsrRecord(record.dsrDate);

    if (!result.cancelled) {
      alert(result.message);
    }

    if (result.ok) {
      await loadProductHistory();
    }
  };

  const productHistorySummary = (record) =>
    (record.products || []).find(
      (product) => product.productKey === group.productKey
    ) || null;

  const formatCreatedTime = (value) =>
    value
      ? new Date(value).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

  const renderField = (field, placeholder) => (
    <NumericInput
      className="ppm-input ppm-compact-input"
      placeholder={placeholder}
      value={form[field]}
      onChange={(value) => updateField(field, value)}
    />
  );

  return (
    <main className="ppm-main products-page">
      <OperationsHeader
        module="Fuel Desk"
        title={`${group.title} Entry`}
        subtitle={group.tankNames.join(" and ")}
        selectedDate={selectedDate}
        user={user}
        pumpBranding={pumpBranding}
        recordStatus={recordStatus}
        saveState={saveState}
        hasUnsavedChanges={hasUnsavedChanges}
        actions={
          <>
            <button
              type="button"
              className="ppm-button secondary"
              onClick={() => setCurrentPage("products")}
            >
              Products
            </button>
            <button
              type="button"
              onClick={openHistory}
              className="ppm-button secondary"
            >
              History
            </button>
          </>
        }
      />

      <StatusTicker
        selectedDate={selectedDate}
        recordStatus={recordStatus}
        saveState={saveState}
        hasUnsavedChanges={hasUnsavedChanges}
        fuelPrices={fuelPrices}
        productConfig={productConfig}
        items={[
          `${group.title} ${groupLiters.toFixed(2)} L`,
          `${group.title} ${formatMoney(groupAmount)}`,
          `${productCompletion}% tank cards touched`,
        ]}
      />

      <nav className="fuel-product-tabs" aria-label="Fuel products">
        <button type="button" onClick={() => setCurrentPage("products")}>
          All
        </button>
        {productGroups.map((productGroup) => (
          <button
            key={productGroup.productKey}
            type="button"
            className={productGroup.productKey === productKey ? "active" : ""}
            onClick={() => setCurrentPage(`product-${productGroup.productKey}`)}
          >
            {productGroup.title}
          </button>
        ))}
      </nav>

      <section className="shift-summary-strip">
        <div className="ppm-stat primary">
          <span>{group.title} Liters</span>
          <strong>{groupLiters} L</strong>
        </div>
        <div className="ppm-stat success">
          <span>{group.title} Amount</span>
          <strong>{formatMoney(groupAmount)}</strong>
        </div>
        <div className="ppm-stat">
          <span>Tanks</span>
          <strong>{productRows.length}</strong>
        </div>
      </section>

      <section className="fuel-workbench-layout">
        <div className="fuel-workbench-main">
          {productRows.map((product) => (
            <FuelProductEntry
              key={product.prefix}
              product={product}
              renderField={renderField}
            />
          ))}
        </div>

        <aside className="fuel-workbench-rail">
          <section className="fuel-rail-card">
            <span>Entry Date</span>
            <input
              className="ppm-input"
              type="date"
              value={dateValue}
              onChange={(e) =>
                setSelectedDate(new Date(`${e.target.value}T00:00:00`))
              }
            />
          </section>
          <section className="fuel-rail-card total">
            <span>{group.title} Liters</span>
            <strong>{formatLiters(groupLiters)}</strong>
            <em>{formatMoney(groupAmount)}</em>
          </section>
          <section className="fuel-rail-card">
            <span>Tanks in View</span>
            <strong>{productRows.length}</strong>
            <em>{productCompletion}% with readings</em>
          </section>
          <section className="fuel-rail-card">
            <span>Save State</span>
            <strong>{saveLabel}</strong>
            <span className={`save-state-pill ${saveIndicatorState}`}>
              {saveLabel}
            </span>
          </section>
          <div className="fuel-rail-actions">
            <button
              type="button"
              onClick={handleSave}
              className="ppm-button primary"
            >
              Save DSR
            </button>
            <button
              type="button"
              onClick={printCurrentProduct}
              className="ppm-button secondary"
            >
              Print {group.title}
            </button>
          </div>
        </aside>
      </section>

      {historyOpen && (
        <div className="ppm-modal-backdrop" role="presentation">
          <section className="ppm-modal product-history-modal" role="dialog" aria-modal="true">
            <div className="ppm-card-title">
              <div>
                <p className="ppm-kicker">Product History</p>
                <h2>{group.title} Saved DSR Records</h2>
              </div>
              <button
                type="button"
                className="ppm-button secondary"
                onClick={() => setHistoryOpen(false)}
              >
                Close
              </button>
            </div>

            {historyStatus === "loading" && (
              <div className="ppm-loading-state">
                <span />
                <strong>Loading product history</strong>
              </div>
            )}

            {historyStatus !== "loading" && productHistory.length === 0 && (
              <div className="ppm-empty-state">
                <strong>No saved product history</strong>
                <span>Save DSR records to build product history.</span>
              </div>
            )}

            <div
              className="history-table product-history-list"
              style={{
                "--history-columns":
                  "minmax(105px, 0.8fr) minmax(110px, 0.9fr) minmax(125px, 1fr) minmax(150px, 1.2fr) minmax(95px, 0.8fr) minmax(155px, 1.1fr) minmax(200px, auto)",
              }}
            >
              {productHistory.length > 0 && (
                <div className="history-table-head">
                  <span>Date</span>
                  <span>Liters</span>
                  <span>Amount</span>
                  <span>Tank</span>
                  <span>User</span>
                  <span>Created Time</span>
                  <span>Actions</span>
                </div>
              )}
              {productHistory.map((record) => (
                <article key={record.dsrDate} className="history-table-row product-history-row">
                  <strong>{record.dsrDate}</strong>
                  <span>{formatLiters(record.totalLiters)}</span>
                  <span>{formatMoney(record.totalAmount)}</span>
                  <span>
                    {productHistorySummary(record)?.tankNames?.join(", ") ||
                      group.tankNames.join(", ")}
                  </span>
                  <span>{record.createdBy || "-"}</span>
                  <span>{formatCreatedTime(record.createdAt)}</span>
                  <div className="history-table-actions product-history-actions">
                    <button
                      type="button"
                      className="ppm-button secondary"
                      onClick={() => viewHistoryRecord(record)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="ppm-button secondary"
                      onClick={() => printHistoryRecord(record)}
                    >
                      Print
                    </button>
                    {user?.role === "Owner" && (
                      <button
                        type="button"
                        className="ppm-button danger icon-action-button"
                        onClick={() => deleteHistoryRecord(record)}
                        aria-label={`Delete DSR record ${record.dsrDate}`}
                        title="Delete saved DSR record"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function FuelProductEntry({ product, renderField }) {
  return (
    <article className="fuel-product-card">
      <div className="fuel-card-head">
        <div>
          <h2>{product.tankName}</h2>
          <p>{product.label}</p>
        </div>
        <div className="fuel-rate-pill">
          {formatMoney(product.rate)} / L
        </div>
      </div>

      <div className="fuel-meta-grid">
        <div>
          <span>Nozzles</span>
          <strong>{product.nozzleCount}</strong>
        </div>
        <div>
          <span>Capacity</span>
          <strong>{formatLiters(product.tankCapacity)}</strong>
        </div>
        <div>
          <span>Current Stock</span>
          <strong>
            {product.tankDip
              ? `${product.tankDip} L`
              : product.closingStock !== ""
              ? `${product.closingStock} L`
              : "-"}
          </strong>
        </div>
      </div>

      <div className="nozzle-grid">
        {product.nozzleRows.map((nozzle, index) => {
          const fieldPrefix = nozzleFieldPrefix(
            product.prefix,
            index
          );

          return (
            <div key={nozzle.name} className="nozzle-card">
              <div className="nozzle-card-head">
                <strong>{nozzle.name}</strong>
                <span>{nozzle.sales} L</span>
              </div>

              <div className="nozzle-input-grid">
                <label>
                  <span>Opening</span>
                  {renderField(`${fieldPrefix}Opening`, "0")}
                </label>
                <label>
                  <span>Closing</span>
                  {renderField(`${fieldPrefix}Closing`, "0")}
                </label>
                <label>
                  <span>Testing</span>
                  {renderField(`${fieldPrefix}Testing`, "0")}
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tank-entry-grid">
        <label>
          <span>Tank Dip</span>
          {renderField(product.dipField, "0")}
        </label>
        {product.waterDipField && (
          <label>
            <span>Water Dip</span>
            {renderField(product.waterDipField, "0")}
          </label>
        )}
        <label>
          <span>Stock / Receipt</span>
          {renderField(`${product.prefix}Receipt`, "0")}
        </label>
      </div>

      <div className="fuel-total-panel">
        <div>
          <span>Closing Stock</span>
          <strong>
            {product.closingStock !== ""
              ? `${product.closingStock} L`
              : "-"}
          </strong>
        </div>
        <div>
          <span>Total Liters</span>
          <strong>{product.sales} L</strong>
        </div>
        <div>
          <span>Total Amount</span>
          <strong>{formatMoney(product.amount)}</strong>
        </div>
      </div>
    </article>
  );
}
