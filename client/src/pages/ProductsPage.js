import React from "react";
import {
  dateFromInput,
  dateInputValue,
  formatLiters,
  formatMoney,
  productPrintGroupsFromConfig,
  productRowsFromForm,
} from "../utils/dsrData";
import { tankCapacityProvider } from "../services/tankCapacityService";
import { backendApi } from "../utils/backendApi";
import { exportBackendDsrPdf } from "../utils/dsrPrint";
import OperationsHeader from "../components/OperationsHeader";
import StatusTicker from "../components/StatusTicker";

const pageForProductKey = (productKey) => `product-${productKey}`;

export default function ProductsPage({
  selectedDate,
  form,
  setCurrentPage,
  fuelPrices,
  saveBeforePrint,
  dashboardRefreshKey,
  user,
  pumpBranding,
  recordStatus,
  saveState,
  hasUnsavedChanges,
  productConfig,
}) {
  const [fromDate, setFromDate] = React.useState(selectedDate);
  const [toDate, setToDate] = React.useState(selectedDate);
  const [dashboardData, setDashboardData] = React.useState(null);
  const [reportStatus, setReportStatus] = React.useState("");
  const productGroups = productPrintGroupsFromConfig(productConfig);
  const productTiles = productGroups.map((group) => ({
    title: group.title,
    subtitle: group.tankNames.join(" and "),
    page: pageForProductKey(group.productKey),
    productKey: group.productKey,
    prefixes: group.prefixes,
    tankCapacity: group.tankCapacity,
  }));
  const productRows = productRowsFromForm(form, fuelPrices, productConfig);
  const tankCapacityRows = tankCapacityProvider.fromForm(form, { productConfig });

  React.useEffect(() => {
    let active = true;

    backendApi
      .dashboard(selectedDate)
      .then((dashboard) => {
        if (active) {
          setDashboardData(dashboard);
        }
      })
      .catch(() => {
        if (active) {
          setDashboardData(null);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDate, dashboardRefreshKey]);

  const getTileTotals = (prefixes) => {
    const rows = productRows.filter((product) =>
      prefixes.includes(product.prefix)
    );
    const tanks = tankCapacityRows.filter((tank) =>
      prefixes.includes(tank.tankId)
    );

    return {
      nozzles: rows.reduce(
        (sum, product) => sum + product.nozzleCount,
        0
      ),
      liters: rows.reduce((sum, product) => sum + product.sales, 0),
      amount: rows.reduce((sum, product) => sum + product.amount, 0),
      currentVolume: tanks.reduce(
        (sum, tank) => sum + Number(tank.currentVolume || 0),
        0
      ),
      capacity: rows.reduce(
        (sum, product) => sum + Number(product.tankCapacity || 0),
        0
      ),
    };
  };

  const dashboardProductFor = (tile, source = "products") =>
    (dashboardData?.[source] || []).find(
      (product) =>
        String(product.fuelType || product.productKey || "").toLowerCase() ===
          tile.productKey.toLowerCase() ||
        String(product.productKey || "").toLowerCase() ===
          tile.productKey.toLowerCase()
    ) || null;

  const generateProductReport = async (group = null) => {
    setReportStatus("");

    try {
      if (saveBeforePrint && !(await saveBeforePrint())) {
        return;
      }

      const result = await backendApi.exportReport({
        exportType: "pdf",
        fromDate,
        toDate,
        product: group?.productKey || "overall",
      });
      exportBackendDsrPdf(result.report);
      setReportStatus(
        group ? `${group.title} report generated.` : "Product report generated."
      );
    } catch (error) {
      setReportStatus(error.message || "Unable to generate product report.");
    }
  };

  return (
    <main className="ppm-main products-page">
      <OperationsHeader
        module="Fuel Desk"
        title="Fuel Product Console"
        subtitle="Select a product to enter nozzle readings and tank movement."
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
          "Choose product card for detailed nozzle entry",
          reportStatus || "Report range ready",
        ]}
      />

      <section className="ppm-card product-report-toolbar">
        <div className="ppm-card-title">
          <div>
            <h2>Product Report Range</h2>
            <span>Backend DSR records only</span>
          </div>
          {reportStatus && <span>{reportStatus}</span>}
        </div>
        <div className="ppm-date-range-grid product-range-grid">
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
            onClick={generateProductReport}
          >
            Generate Report
          </button>
        </div>
      </section>

      <section className="product-selection-grid">
        {productTiles.map((tile) => {
          const tileTotals = getTileTotals(tile.prefixes);
          const todayProduct = dashboardProductFor(tile, "products");
          const monthlyProduct = dashboardProductFor(tile, "monthlyProducts");
          const filledPercent =
            tileTotals.capacity > 0
              ? (tileTotals.currentVolume / tileTotals.capacity) * 100
              : 0;
          const progressPercent = Math.min(Math.max(filledPercent, 0), 100);
          const totalLiters = Number(todayProduct?.salesLiters ?? tileTotals.liters);
          const totalAmount = Number(todayProduct?.amount ?? tileTotals.amount);
          const tileGroup = productGroups.find(
            (group) => group.productKey === tile.productKey
          );
          const cardMetrics = [
            ["Total Liters", formatLiters(totalLiters)],
            ["Total Amount", formatMoney(totalAmount)],
            ["Tank Count", tile.prefixes.length],
            ["Nozzle Count", tileTotals.nozzles],
          ];

          return (
            <article
              key={tile.page}
              role="button"
              tabIndex={0}
              className="product-selection-card"
              onClick={() => setCurrentPage(tile.page)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) {
                  return;
                }

                if (e.key === "Enter" || e.key === " ") {
                  setCurrentPage(tile.page);
                }
              }}
            >
              <div className="product-selection-head">
                <div>
                  <span>Fuel Name</span>
                  <h2>{tile.title}</h2>
                </div>
                <div>
                  <span>Tanks</span>
                  <p>{tile.subtitle}</p>
                </div>
                <strong>{formatMoney(monthlyProduct?.amount ?? 0)}</strong>
              </div>

              <div className="product-selection-metrics">
                <div className="product-selection-metric-row two">
                  {cardMetrics.map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="product-fill-section">
                <div className="product-fill-label">
                  <span>Filled</span>
                  <strong>{filledPercent.toFixed(1)}%</strong>
                </div>
                <div
                  className="product-fill-track"
                  role="meter"
                  aria-label={`${tile.title} tank occupancy`}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={Number(progressPercent.toFixed(1))}
                >
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              <div className="product-card-action-row quick-action-row">
                <button
                  type="button"
                  className="ppm-button primary"
                  onClick={(event) => {
                    event.stopPropagation();
                    setCurrentPage(tile.page);
                  }}
                >
                  Enter {tile.title}
                </button>
                <button
                  type="button"
                  className="ppm-button secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    generateProductReport(tileGroup);
                  }}
                >
                  PDF
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
