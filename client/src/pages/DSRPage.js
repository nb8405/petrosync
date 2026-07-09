import React from "react";
import {
  dateFromInput,
  dateInputValue,
  formatLiters,
  formatMoney,
  groupProductRowsByFuel,
  productRowsFromForm,
  safe,
  totalsFromForm,
} from "../utils/dsrData";
import { exportBackendDsrPdf } from "../utils/dsrPrint";
import { backendApi } from "../utils/backendApi";
import TrashIcon from "../components/TrashIcon";
import OperationsHeader from "../components/OperationsHeader";
import StatusTicker from "../components/StatusTicker";
import TopTabNavigation from "../components/TopTabNavigation";

const dsrTabs = [
  ["review", "DSR Review"],
  ["entries", "Product Entries"],
  ["tanks", "Tank Readings"],
  ["nozzles", "Nozzle Readings"],
  ["collections", "Collections"],
  ["expenses", "Expenses"],
  ["payments", "Payments"],
  ["summary", "Summary"],
  ["print", "Print"],
  ["export", "Export"],
];

const isLubricantGroup = (group) =>
  /lubricant|lube|engine oil|gear oil|grease|oil/i.test(
    `${group.title} ${group.productKey}`
  );

export default function DSRPage({
  selectedDate,
  setSelectedDate,
  setCurrentPage,
  form,
  updateField,
  saveCurrentRecord,
  saveBeforePrint,
  recordStatus,
  saveState,
  hasUnsavedChanges,
  fuelPrices,
  user,
  pumpBranding,
  deleteDsrRecord,
  productConfig,
}) {
  const [activeTab, setActiveTab] = React.useState("review");
  const [fromDate, setFromDate] = React.useState(selectedDate);
  const [toDate, setToDate] = React.useState(selectedDate);
  const saveIndicatorState =
    saveState === "failed" ? "failed" : hasUnsavedChanges ? "unsaved" : "saved";
  const productRows = productRowsFromForm(form, fuelPrices, productConfig);
  const totals = totalsFromForm(form, fuelPrices, productConfig);
  const fuelSummaries = groupProductRowsByFuel(productRows, productConfig);
  const lubricantSummaries = fuelSummaries.filter(isLubricantGroup);
  const totalFuelAmount = fuelSummaries.reduce(
    (sum, fuel) => sum + Number(fuel.amount || 0),
    0
  );
  const fuelCashSummaries = fuelSummaries.map((fuel) => {
    const share =
      totalFuelAmount > 0 ? Number(fuel.amount || 0) / totalFuelAmount : 0;
    const collection = Number(fuel.amount || 0);
    const expenses = totals.totalExpenses * share;

    return {
      ...fuel,
      collection,
      expenses,
      closingCash: collection - expenses,
    };
  });

  const collectionRows = [
    ["Cash", "cash"],
    ["UPI", "upi"],
    ["Card", "card"],
    ["Fleet Card", "fleet"],
    ["Credit Customer", "credit"],
  ];

  const expenseRows = [
    ["Generator Fuel", "generator"],
    ["Staff Expense", "staff"],
    ["Cleaning", "cleaning"],
    ["Maintenance", "maintenance"],
  ];

  const Field = ({ field, placeholder }) => (
    <input
      className="ppm-input"
      type="number"
      min="0"
      step="0.01"
      placeholder={placeholder}
      value={form[field] || ""}
      onChange={(e) => updateField(field, e.target.value)}
    />
  );

  const productKeyForGroup = (productGroup) =>
    productGroup ? productGroup.productKey : "overall";

  const printDsrReport = async (
    productGroup = null,
    { exportType = "pdf", print = false } = {}
  ) => {
    try {
      if (!(await saveBeforePrint())) {
        return;
      }

      const payload = {
        fromDate,
        toDate,
        product: productKeyForGroup(productGroup),
      };

      if (print) {
        const result = await backendApi.createPrintReference(payload);
        exportBackendDsrPdf(result.report);
      } else {
        const result = await backendApi.exportReport({
          ...payload,
          exportType,
        });
        exportBackendDsrPdf(result.report);
      }
    } catch {
      alert("Unable to generate report from backend. Please check your session and selected date range.");
    }
  };

  const handleSave = async () => {
    const result = await saveCurrentRecord();
    alert(result.message);
  };

  const handleDelete = async () => {
    const result = await deleteDsrRecord(selectedDate);
    if (!result.cancelled) {
      alert(result.message);
    }
  };

  const renderAllProductsSummary = () => (
    <section className="closing-summary-section all-products">
      <div className="closing-summary-head">
        <div>
          <span>Collection minus expenses</span>
          <h3>All Products Summary</h3>
        </div>
        <strong>{formatMoney(totals.closingCash)}</strong>
      </div>
      {fuelCashSummaries.length === 0 ? (
        <div className="ppm-empty-state compact">
          <strong>No configured fuel summary</strong>
          <span>Enable fuels in Fuel Master to populate DSR summaries.</span>
        </div>
      ) : (
        <div className="fuel-closing-grid">
          {fuelCashSummaries.map((fuel) => (
            <article key={fuel.productKey} className="fuel-closing-card">
              <h3>{fuel.title}</h3>
              <div>
                <span>Collection</span>
                <strong>{formatMoney(fuel.collection)}</strong>
              </div>
              <div>
                <span>Expenses</span>
                <strong>{formatMoney(fuel.expenses)}</strong>
              </div>
              <div>
                <span>Closing Cash</span>
                <strong>{formatMoney(fuel.closingCash)}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="ppm-closing-grid dsr-total-closing-grid">
        <div className="ppm-stat primary">
          <span>Total Collection</span>
          <strong>{formatMoney(totals.totalCollection)}</strong>
        </div>
        <div className="ppm-stat">
          <span>Total Expenses</span>
          <strong>{formatMoney(totals.totalExpenses)}</strong>
        </div>
        <div className="ppm-stat success">
          <span>Total Closing Cash</span>
          <strong>{formatMoney(totals.closingCash)}</strong>
        </div>
      </div>
    </section>
  );

  const renderProductTable = () => (
    <div className="ppm-table-scroll">
      <table className="ppm-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Opening</th>
            <th>Receipt</th>
            <th>Closing</th>
            <th>Testing</th>
            <th>Tank Dip</th>
            <th>Sales Liters</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {fuelSummaries.map((fuel) =>
            fuel.rows.map((product) => (
              <tr key={product.prefix}>
                <td>{product.label}</td>
                <td>{safe(product.opening)}</td>
                <td>{safe(product.receipt)}</td>
                <td>{safe(product.closing)}</td>
                <td>{safe(product.testing)}</td>
                <td>{safe(product.tankDip)}</td>
                <td>{formatLiters(product.sales)}</td>
                <td>{formatMoney(product.rate)}</td>
                <td>{formatMoney(product.amount)}</td>
              </tr>
            ))
          )}
          <tr className="ppm-grand-total-row">
            <td colSpan="6">Total</td>
            <td>{formatLiters(totals.totalLiters)}</td>
            <td />
            <td>{formatMoney(totals.totalSales)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderTab = () => {
    if (activeTab === "entries") {
      return (
        <section className="dsr-tab-content">
          <div className="report-product-grid">
            {fuelSummaries.map((fuel) => (
              <article key={fuel.productKey} className="ppm-card report-mini-card">
                <div>
                  <p className="ppm-kicker">Product Entry</p>
                  <h2>{fuel.title} Entry</h2>
                  <p className="ppm-muted">
                    {fuel.tankNames.join(", ") || "Configured fuel product"}
                  </p>
                </div>
                <div className="product-selection-metric-row two">
                  <div>
                    <span>{fuel.title} Liters</span>
                    <strong>{formatLiters(fuel.sales)}</strong>
                  </div>
                  <div>
                    <span>{fuel.title} Amount</span>
                    <strong>{formatMoney(fuel.amount)}</strong>
                  </div>
                  <div>
                    <span>Tanks</span>
                    <strong>{fuel.rows.length}</strong>
                  </div>
                  <div>
                    <span>Entry</span>
                    <button
                      type="button"
                      className="ppm-button secondary"
                      onClick={() => setCurrentPage?.(`product-${fuel.productKey}`)}
                    >
                      Open
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {fuelSummaries.length === 0 && (
            <div className="ppm-empty-state">
              <strong>No configured fuels</strong>
              <span>Enable products in Fuel Master to create product entries.</span>
            </div>
          )}
          {lubricantSummaries.length > 0 && (
            <section className="ppm-card dsr-section">
              <div className="ppm-card-title">
                <div>
                  <p className="ppm-kicker">Lubricant Sales</p>
                  <h2>Lubricant Entries</h2>
                  <span>Configured lubricant products</span>
                </div>
              </div>
              <div className="fuel-closing-grid">
                {lubricantSummaries.map((fuel) => (
                  <article key={fuel.productKey} className="fuel-closing-card">
                    <h3>{fuel.title}</h3>
                    <div>
                      <span>Liters</span>
                      <strong>{formatLiters(fuel.sales)}</strong>
                    </div>
                    <div>
                      <span>Amount</span>
                      <strong>{formatMoney(fuel.amount)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      );
    }

    if (activeTab === "tanks") {
      return (
        <section className="ppm-card dsr-tab-content">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">Tank Readings</p>
              <h2>Product-wise Summary</h2>
              <span>Read-only DSR view from product entries</span>
            </div>
          </div>
          {renderProductTable()}
        </section>
      );
    }

    if (activeTab === "nozzles") {
      return (
        <section className="ppm-card dsr-tab-content">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">Nozzle Readings</p>
              <h2>Meter Movement</h2>
              <span>Calculated from product entries</span>
            </div>
          </div>
          <div className="ppm-table-scroll">
            <table className="ppm-table nozzle-reading-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Nozzle</th>
                  <th>Opening</th>
                  <th>Closing</th>
                  <th>Testing</th>
                  <th>Sales Liters</th>
                </tr>
              </thead>
              <tbody>
                {productRows.flatMap((product) =>
                  product.nozzleRows.map((nozzle) => (
                    <tr key={`${product.prefix}-${nozzle.name}`}>
                      <td>{product.label}</td>
                      <td>{nozzle.name}</td>
                      <td>{safe(nozzle.opening)}</td>
                      <td>{safe(nozzle.closing)}</td>
                      <td>{safe(nozzle.testing)}</td>
                      <td>{formatLiters(nozzle.sales)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (activeTab === "collections") {
      return (
        <section className="ppm-card dsr-tab-content">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">Collections</p>
              <h2>Collection Entry</h2>
              <span>Daily collection channels</span>
            </div>
          </div>
          <div className="ppm-field-grid">
            {collectionRows.map(([label, field]) => (
              <Field key={field} field={field} placeholder={label} />
            ))}
          </div>
        </section>
      );
    }

    if (activeTab === "expenses") {
      return (
        <section className="ppm-card dsr-tab-content">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">Expenses</p>
              <h2>Expense Entry</h2>
              <span>Daily operational expenses</span>
            </div>
          </div>
          <div className="ppm-field-grid">
            {expenseRows.map(([label, field]) => (
              <Field key={field} field={field} placeholder={label} />
            ))}
          </div>
        </section>
      );
    }

    if (activeTab === "payments") {
      return (
        <section className="ppm-card dsr-tab-content">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">Payments</p>
              <h2>Payment Summary</h2>
              <span>Captured payment channels against DSR sales</span>
            </div>
          </div>
          <div className="ppm-closing-grid">
            <div className="ppm-stat primary">
              <span>Captured Payments</span>
              <strong>{formatMoney(totals.paymentCollection)}</strong>
            </div>
            <div className="ppm-stat">
              <span>Sales Collection</span>
              <strong>{formatMoney(totals.totalCollection)}</strong>
            </div>
            <div className="ppm-stat success">
              <span>Difference</span>
              <strong>
                {formatMoney(totals.paymentCollection - totals.totalCollection)}
              </strong>
            </div>
          </div>
          <div className="fuel-closing-grid">
            {collectionRows.map(([label, field]) => (
              <article key={field} className="fuel-closing-card">
                <h3>{label}</h3>
                <div>
                  <span>Amount</span>
                  <strong>{formatMoney(form[field])}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }

    if (activeTab === "summary") {
      return (
        <section className="ppm-card dsr-tab-content">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">Summary</p>
              <h2>DSR Closing Summary</h2>
              <span>Product collections, expenses and closing cash</span>
            </div>
          </div>
          {renderAllProductsSummary()}
        </section>
      );
    }

    if (activeTab === "print" || activeTab === "export") {
      const isExport = activeTab === "export";

      return (
        <section className="ppm-card dsr-tab-content">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">{isExport ? "Export" : "Print"}</p>
              <h2>{isExport ? "DSR Export" : "Date Range DSR Print"}</h2>
              <span>{isExport ? "PDF and Excel exports" : "Daily DSR print only"}</span>
            </div>
          </div>

          <div className="ppm-date-range-grid">
            <label>
              <span>From Date</span>
              <input
                className="ppm-input"
                type="date"
                value={dateInputValue(fromDate)}
                onChange={(e) => setFromDate(dateFromInput(e.target.value))}
              />
            </label>
            <label>
              <span>To Date</span>
              <input
                className="ppm-input"
                type="date"
                value={dateInputValue(toDate)}
                onChange={(e) => setToDate(dateFromInput(e.target.value))}
              />
            </label>
          </div>

          <div className="ppm-print-grid">
            {isExport ? (
              <>
                <button
                  type="button"
                  onClick={() => printDsrReport(null, { exportType: "pdf" })}
                  className="ppm-button primary"
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => printDsrReport(null, { exportType: "excel" })}
                  className="ppm-button secondary"
                >
                  Export Excel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => printDsrReport(null, { print: true })}
                  className="ppm-button primary"
                >
                  Daily DSR Print
                </button>
                <button
                  type="button"
                  onClick={() => printDsrReport(null, { exportType: "pdf" })}
                  className="ppm-button secondary"
                >
                  Export PDF
                </button>
              </>
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="dsr-tab-content">
        <section className="ppm-summary-grid dsr-overview-grid">
          <div className="ppm-stat primary">
            <span>Total Sales</span>
            <strong>{formatMoney(totals.totalSales)}</strong>
          </div>
          <div className="ppm-stat success">
            <span>Closing Cash</span>
            <strong>{formatMoney(totals.closingCash)}</strong>
          </div>
        </section>

        <section className="ppm-card dsr-section">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">Selected Operating Day</p>
              <h2>{selectedDate.toDateString()}</h2>
              <span>{dateInputValue(selectedDate)}</span>
            </div>
          </div>
          <div className="basic-info-grid">
            <div>
              <span>DSR Date</span>
              <strong>{selectedDate.toDateString()}</strong>
            </div>
            <div>
              <span>Record Status</span>
              <strong>{recordStatus}</strong>
            </div>
            <div>
              <span>Save Status</span>
              <strong>
                {saveState === "failed"
                  ? "Save Failed"
                  : hasUnsavedChanges
                  ? "Unsaved Changes"
                  : "Saved"}
              </strong>
            </div>
          </div>
        </section>

        <section className="ppm-card dsr-section dsr-closing-card">
          <div className="ppm-card-title">
            <div>
              <p className="ppm-kicker">All Products Summary</p>
              <h2>Closing Summary</h2>
              <span>Collection minus expenses</span>
            </div>
          </div>
          {renderAllProductsSummary()}
        </section>
      </section>
    );
  };

  return (
    <main className="ppm-main dsr-page">
      <OperationsHeader
        module="Daily Sales Report"
        title="DSR Review"
        subtitle="Tabbed review for product readings, collections, expenses and exports."
        selectedDate={selectedDate}
        user={user}
        pumpBranding={pumpBranding}
        recordStatus={recordStatus}
        saveState={saveState}
        hasUnsavedChanges={hasUnsavedChanges}
        actions={
          <div className="product-date-card dsr-date-picker">
            <span>DSR Date</span>
            <input
              className="ppm-input"
              type="date"
              value={dateInputValue(selectedDate)}
              onChange={(e) =>
                setSelectedDate(new Date(`${e.target.value}T00:00:00`))
              }
            />
          </div>
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
          `Sales ${formatMoney(totals.totalSales)}`,
          `Collection ${formatMoney(totals.totalCollection)}`,
          `Closing cash ${formatMoney(totals.closingCash)}`,
        ]}
      />

      <TopTabNavigation
        tabs={dsrTabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel="Daily DSR sections"
        className="dsr-tabs"
      />

      <div className="dsr-tab-panel">{renderTab()}</div>

      <section className="ppm-card ppm-actions-card dsr-sticky-actions">
        <div>
          <h2>DSR Actions</h2>
          <p className="ppm-muted">
            Save the selected date record or export the formatted DSR.
          </p>
        </div>
        <div className="ppm-actions">
          <span className={`save-state-pill ${saveIndicatorState}`}>
            {saveState === "failed"
              ? "Save Failed"
              : hasUnsavedChanges
              ? "Unsaved Changes"
              : "Saved"}
          </span>
          <button
            type="button"
            onClick={handleSave}
            className="ppm-button primary"
          >
            Save DSR
          </button>
          <button
            type="button"
            onClick={() => printDsrReport(null, { print: true })}
            className="ppm-button secondary"
          >
            Daily DSR Print
          </button>
          {user?.role === "Owner" &&
            recordStatus !== "new" &&
            recordStatus !== "idle" && (
            <button
              type="button"
              onClick={handleDelete}
              className="ppm-button danger icon-action-button"
              aria-label="Delete saved DSR record"
              title="Delete saved DSR record"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
