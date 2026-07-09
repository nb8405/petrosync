import React from "react";
import {
  dateFromInput,
  dateInputValue,
  formatMoney,
  formatLiters,
  productPrintGroupsFromConfig,
} from "../utils/dsrData";
import { exportBackendDsrPdf } from "../utils/dsrPrint";
import { backendApi } from "../utils/backendApi";
import SalesBarChart from "../components/SalesBarChart";
import TrashIcon from "../components/TrashIcon";
import OperationsHeader from "../components/OperationsHeader";
import StatusTicker from "../components/StatusTicker";
import TopTabNavigation from "../components/TopTabNavigation";

const reportTabs = [
  ["centre", "DSR Report Centre"],
  ["sales", "Sales Reports"],
  ["collections", "Collection Reports"],
  ["expenses", "Expense Reports"],
  ["products", "Product Reports"],
  ["tanks", "Tank Reports"],
  ["inventory", "Inventory Reports"],
  ["exports", "Export History"],
];

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const productMatchesGroup = (product, group) => {
  const productValues = [
    product?.fuelType,
    product?.productType,
    product?.product_type,
    product?.product,
    product?.productKey,
  ]
    .map(normalize)
    .filter(Boolean);
  const groupValues = [group.productKey, group.title, ...group.prefixes]
    .map(normalize)
    .filter(Boolean);

  return productValues.some((value) => groupValues.includes(value));
};

export default function ReportsPage({
  selectedDate,
  setSelectedDate,
  setCurrentPage,
  saveBeforePrint,
  dashboardRefreshKey,
  user,
  pumpBranding,
  fuelPrices,
  recordStatus,
  saveState,
  hasUnsavedChanges,
  deleteDsrRecord,
  productConfig,
}) {
  const [activeTab, setActiveTab] = React.useState("centre");
  const [fromDate, setFromDate] = React.useState(selectedDate);
  const [toDate, setToDate] = React.useState(selectedDate);
  const [dashboardData, setDashboardData] = React.useState(null);
  const [dashboardStatus, setDashboardStatus] = React.useState("loading");
  const [historyRecords, setHistoryRecords] = React.useState([]);
  const [historyStatus, setHistoryStatus] = React.useState("loading");
  const [selectedProduct, setSelectedProduct] = React.useState("overall");
  const productPrintGroups = productPrintGroupsFromConfig(productConfig);

  React.useEffect(() => {
    let active = true;

    setDashboardStatus("loading");
    backendApi
      .dashboard(selectedDate)
      .then((dashboard) => {
        if (active) {
          setDashboardData(dashboard);
          setDashboardStatus("loaded");
        }
      })
      .catch(() => {
        if (active) {
          setDashboardData(null);
          setDashboardStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDate, dashboardRefreshKey]);

  const productForGroup = (group) =>
    group ? group.productKey : selectedProduct;

  const loadReportHistory = React.useCallback(async () => {
    setHistoryStatus("loading");

    try {
      const history = await backendApi.listDsrHistory({
        fromDate,
        toDate,
        product: "overall",
      });
      setHistoryRecords(history.records || []);
      setHistoryStatus("loaded");
    } catch {
      setHistoryRecords([]);
      setHistoryStatus("error");
    }
  }, [fromDate, toDate]);

  React.useEffect(() => {
    loadReportHistory();
  }, [loadReportHistory, dashboardRefreshKey]);

  const exportReport = async (group = null, exportType = "pdf") => {
    try {
      if (!(await saveBeforePrint())) {
        return;
      }

      const result = await backendApi.exportReport({
        exportType,
        fromDate,
        toDate,
        product: productForGroup(group),
      });
      exportBackendDsrPdf(result.report);
    } catch {
      alert("Unable to export report from backend. Please check your session and selected date range.");
    }
  };

  const printHistoryRecord = async (record) => {
    try {
      if (!(await saveBeforePrint())) {
        return;
      }

      const reportDate = dateFromInput(record.dsrDate);
      const result = await backendApi.createPrintReference({
        fromDate: reportDate,
        toDate: reportDate,
        product: "overall",
      });
      exportBackendDsrPdf(result.report);
    } catch {
      alert("Unable to print saved DSR record.");
    }
  };

  const printSalesReport = async () => {
    try {
      if (!(await saveBeforePrint())) {
        return;
      }

      const result = await backendApi.createPrintReference({
        fromDate,
        toDate,
        product: selectedProduct,
      });
      exportBackendDsrPdf(result.report);
    } catch {
      alert("Unable to print sales report from backend.");
    }
  };

  const viewHistoryRecord = async (record) => {
    const changed = await setSelectedDate(dateFromInput(record.dsrDate));

    if (changed !== false) {
      await setCurrentPage("dsr");
    }
  };

  const deleteHistoryRecord = async (record) => {
    const result = await deleteDsrRecord(record.dsrDate);

    if (!result.cancelled) {
      alert(result.message);
    }

    if (result.ok) {
      await loadReportHistory();
    }
  };

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

  const selectedDateLabel = selectedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const emptyProductTotals = productPrintGroups.map((group) => ({
    title: group.title,
    productKey: group.productKey,
    liters: 0,
    amount: 0,
  }));
  const renderedProductTotals =
    productPrintGroups.length > 0
      ? productPrintGroups.map((group) => {
          const product = (dashboardData?.products || []).find((item) =>
            productMatchesGroup(item, group)
          );

          return {
            title: group.title,
            productKey: group.productKey,
            liters: Number(product?.salesLiters || product?.liters || 0),
            amount: Number(product?.amount || product?.totalAmount || 0),
          };
        })
      : emptyProductTotals;
  const dailySalesAmount = renderedProductTotals.reduce(
    (sum, product) => sum + Number(product.amount || 0),
    0
  );
  const dailySalesLiters = renderedProductTotals.reduce(
    (sum, product) => sum + Number(product.liters || 0),
    0
  );
  const dailyChartData = renderedProductTotals.map((product) => ({
    label: product.title,
    value: Number(product.amount || 0),
    helper: formatLiters(product.liters),
  }));
  const monthlyChartData = (dashboardData?.monthlyProducts || []).map((product) => ({
    label: product.fuelType,
    value: Number(product.amount || 0),
    helper: formatLiters(product.salesLiters),
  }));
  const dailyTrendData = (dashboardData?.dailySales || []).map((day) => ({
    label: day.label,
    value: Number(day.totalSales || 0),
    quantity: Number(day.totalLiters || 0),
    helper: formatLiters(day.totalLiters),
  }));
  const monthlyTrendData = (dashboardData?.monthlySales || []).map((month) => ({
    label: month.label,
    value: Number(month.totalSales || 0),
    quantity: Number(month.totalLiters || 0),
    helper: formatLiters(month.totalLiters),
  }));
  const tankWiseData = (dashboardData?.tanks || dashboardData?.tankStatus || []).map((tank) => ({
    label: tank.tankNumber || tank.tank_number || tank.name || tank.productType || "Tank",
    value: Number(tank.currentStock || tank.current_stock || tank.currentVolume || 0),
    helper: tank.productType || tank.product_type || tank.product || "",
  }));
  const isChartLoading = dashboardStatus === "loading";
  const selectedProductLabel =
    selectedProduct === "overall"
      ? "All products"
      : productPrintGroups.find((group) => group.productKey === selectedProduct)
          ?.title || selectedProduct;

  const filterPanel = (
    <>
      <section className="reports-filter-card ppm-card">
        <div className="ppm-card-title">
          <div>
            <h2>Report Filters</h2>
            <span>Product and date range apply to exports</span>
          </div>
        </div>
        <div className="report-filter-grid">
          <label>
            <span>Product</span>
            <select
              className="ppm-input"
              value={selectedProduct}
              onChange={(event) => setSelectedProduct(event.target.value)}
            >
              <option value="overall">All Products</option>
              {productPrintGroups.map((group) => (
                <option key={group.productKey} value={group.productKey}>
                  {group.title}
                </option>
              ))}
            </select>
          </label>
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
          <button
            type="button"
            className="ppm-button primary"
            onClick={() => exportReport(null, "pdf")}
          >
            Export PDF
          </button>
          <button
            type="button"
            className="ppm-button secondary"
            onClick={() => exportReport(null, "excel")}
          >
            Export Excel
          </button>
          <button
            type="button"
            className="ppm-button secondary"
            onClick={printSalesReport}
          >
            Sales Report Print
          </button>
        </div>
      </section>

      <section className="ppm-card ppm-actions-card">
        <div>
          <h2>Daily Entry</h2>
          <p className="ppm-muted">
            Open Daily DSR to enter or adjust a saved record.
          </p>
        </div>
        <button
          type="button"
          className="ppm-button primary"
          onClick={() => setCurrentPage("dsr")}
        >
          Go to Daily DSR
        </button>
      </section>
    </>
  );

  const salesPanel = (
    <section className="reports-dashboard-grid reports-chart-grid">
      <SalesBarChart
        title="Daily Sales Graph"
        subtitle="Day-wise saved DSR sales"
        data={dailyTrendData.length ? dailyTrendData : dailyChartData}
        loading={isChartLoading}
        emptyMessage="Save a DSR record to generate daily sales graphs."
      />
      <SalesBarChart
        title="Monthly Sales Graph"
        subtitle="Month-wise saved DSR sales"
        data={monthlyTrendData.length ? monthlyTrendData : monthlyChartData}
        loading={isChartLoading}
        emptyMessage="Save DSR records to generate monthly sales graphs."
      />
      <SalesBarChart
        title="Fuel Wise Sales"
        subtitle={`${selectedDateLabel} | ${formatMoney(
          dailySalesAmount
        )} | ${dailySalesLiters.toFixed(2)} L`}
        data={dailyChartData}
        loading={isChartLoading}
      />
    </section>
  );

  const collectionsPanel = (
    <section className="ppm-card reports-summary-card">
      <div className="ppm-card-title">
        <div>
          <p className="ppm-kicker">Collection Reports</p>
          <h2>Collection Summary</h2>
          <span>{selectedProductLabel} for selected report range</span>
        </div>
      </div>
      <div className="ppm-closing-grid">
        <div className="ppm-stat primary">
          <span>Saved Records</span>
          <strong>{historyRecords.length}</strong>
        </div>
        <div className="ppm-stat success">
          <span>Total Collection</span>
          <strong>
            {formatMoney(
              historyRecords.reduce(
                (sum, record) => sum + Number(record.totalAmount || 0),
                0
              )
            )}
          </strong>
        </div>
      </div>
    </section>
  );

  const expensesPanel = (
    <section className="ppm-card reports-summary-card">
      <div className="ppm-card-title">
        <div>
          <p className="ppm-kicker">Expense Reports</p>
          <h2>Expense Summary</h2>
          <span>Expense totals from available DSR dashboard data</span>
        </div>
      </div>
      <div className="ppm-closing-grid">
        <div className="ppm-stat">
          <span>Total Expenses</span>
          <strong>
            {formatMoney(
              dashboardData?.totals?.totalExpenses ??
                dashboardData?.totals?.expenses ??
                0
            )}
          </strong>
        </div>
        <div className="ppm-stat success">
          <span>Net Sales</span>
          <strong>{formatMoney(dailySalesAmount)}</strong>
        </div>
      </div>
    </section>
  );

  const productReportsPanel = (
    <section className="report-product-grid">
      {productPrintGroups.map((group) => (
        <article key={group.title} className="ppm-card report-mini-card">
          <div>
            <p className="ppm-kicker">Product Report</p>
            <h2>{group.title} Report</h2>
            <p className="ppm-muted">
              Export only {group.title} sales and stock movement for the
              selected period.
            </p>
          </div>
          <div className="report-card-actions">
            <button
              type="button"
              className="ppm-button secondary"
              onClick={() => exportReport(group, "pdf")}
            >
              PDF
            </button>
            <button
              type="button"
              className="ppm-button secondary"
              onClick={() => exportReport(group, "excel")}
            >
              Excel
            </button>
          </div>
        </article>
      ))}
      {productPrintGroups.length === 0 && (
        <div className="ppm-empty-state">
          <strong>No configured product reports</strong>
          <span>Enable fuels in Fuel Master to generate product reports.</span>
        </div>
      )}
    </section>
  );

  const tankReportsPanel = (
    <section className="reports-dashboard-grid reports-chart-grid">
      <SalesBarChart
        title="Tank Wise Sales"
        subtitle="Tank stock and movement overview"
        data={tankWiseData}
        loading={isChartLoading}
        emptyMessage="No tank data found for the selected period."
      />
    </section>
  );

  const inventoryPanel = (
    <section className="ppm-card">
      <div className="ppm-card-title">
        <div>
          <p className="ppm-kicker">Inventory Reports</p>
          <h2>Inventory Report Centre</h2>
          <span>Inventory exports appear here when inventory data is available.</span>
        </div>
      </div>
      <div className="ppm-empty-state">
        <strong>No inventory report data</strong>
        <span>Save inventory activity to populate inventory reports.</span>
      </div>
    </section>
  );

  const historyPanel = (
    <section className="ppm-card reports-history-card">
      <div className="ppm-card-title">
        <div>
          <h2>Reports History</h2>
          <span>Saved DSR records in the selected range</span>
        </div>
      </div>

      {historyStatus === "loading" && (
        <div className="ppm-loading-state">
          <span />
          <strong>Loading saved DSR records</strong>
        </div>
      )}

      {historyStatus !== "loading" && historyRecords.length === 0 && (
        <div className="ppm-empty-state">
          <strong>No saved DSR records</strong>
          <span>Save a DSR record to generate report history.</span>
        </div>
      )}

      <div
        className="history-table reports-history-list"
        style={{
          "--history-columns":
            "minmax(110px, 0.8fr) minmax(110px, 0.8fr) minmax(125px, 0.9fr) minmax(95px, 0.8fr) minmax(155px, 1.1fr) minmax(205px, auto)",
        }}
      >
        {historyRecords.length > 0 && (
          <div className="history-table-head">
            <span>Date</span>
            <span>Liters</span>
            <span>Amount</span>
            <span>User</span>
            <span>Created Time</span>
            <span>Actions</span>
          </div>
        )}
        {historyRecords.map((record) => (
          <article key={record.dsrDate} className="history-table-row reports-history-row">
            <strong>{record.dsrDate}</strong>
            <span>{formatLiters(record.totalLiters)}</span>
            <span>{formatMoney(record.totalAmount)}</span>
            <span>{record.createdBy || "-"}</span>
            <span>{formatCreatedTime(record.createdAt)}</span>
            <div className="history-table-actions reports-history-actions">
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
  );

  const renderReportTab = () => {
    if (activeTab === "sales") return salesPanel;
    if (activeTab === "collections") return collectionsPanel;
    if (activeTab === "expenses") return expensesPanel;
    if (activeTab === "products") return productReportsPanel;
    if (activeTab === "tanks") return tankReportsPanel;
    if (activeTab === "inventory") return inventoryPanel;
    if (activeTab === "exports") return historyPanel;
    return filterPanel;
  };

  return (
    <main className="ppm-main reports-page">
      <OperationsHeader
        module="Reports"
        title="DSR Report Centre"
        subtitle="Sales, stock, collections, expenses and print references."
        selectedDate={selectedDate}
        user={user}
        pumpBranding={pumpBranding}
        recordStatus={recordStatus}
        saveState={saveState}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      <StatusTicker
        selectedDate={selectedDate}
        recordStatus={recordStatus}
        saveState={saveState}
        hasUnsavedChanges={hasUnsavedChanges}
        fuelPrices={fuelPrices}
        productConfig={productConfig}
        dashboardData={dashboardData}
        items={[
          `${historyRecords.length} saved records in range`,
          `${selectedProductLabel} selected`,
        ]}
      />

      <TopTabNavigation
        tabs={reportTabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel="Report sections"
        className="reports-tabs"
      />

      <div className="reports-tab-panel">{renderReportTab()}</div>
    </main>
  );
}
