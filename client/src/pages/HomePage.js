import React from "react";
import {
  formatLiters,
  formatMoney,
  productPrintGroupsFromConfig,
} from "../utils/dsrData";
import { backendApi } from "../utils/backendApi";
import OperationsHeader from "../components/OperationsHeader";

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

const productTotalForGroup = (products, group) => {
  const product = (products || []).find((item) => productMatchesGroup(item, group));

  return {
    title: group.title,
    productKey: group.productKey,
    liters: Number(product?.salesLiters || product?.liters || 0),
    amount: Number(product?.amount || product?.totalAmount || 0),
  };
};

const tankMatchesGroups = (tank, groups) => {
  const tankValues = [
    tank?.productType,
    tank?.product_type,
    tank?.product,
    tank?.fuelType,
  ]
    .map(normalize)
    .filter(Boolean);

  if (tankValues.length === 0) {
    return true;
  }

  return groups.some((group) => {
    const groupValues = [group.productKey, group.title, ...group.prefixes]
      .map(normalize)
      .filter(Boolean);

    return tankValues.some((value) => groupValues.includes(value));
  });
};

export default function HomePage({
  selectedDate,
  setCurrentPage,
  dashboardRefreshKey,
  user,
  pumpBranding,
  recordStatus,
  saveState,
  hasUnsavedChanges,
  productConfig,
}) {
  const [backendDashboard, setBackendDashboard] = React.useState(null);
  const productGroups = React.useMemo(
    () => productPrintGroupsFromConfig(productConfig),
    [productConfig]
  );

  React.useEffect(() => {
    let active = true;

    backendApi
      .dashboard(selectedDate)
      .then((dashboard) => {
        if (active) {
          setBackendDashboard(dashboard);
        }
      })
      .catch(() => {
        if (active) {
          setBackendDashboard(null);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDate, dashboardRefreshKey]);

  const dashboardTotals = backendDashboard?.totals || {};
  const dashboardTanks = backendDashboard?.tanks || backendDashboard?.tankStatus || [];
  const dashboardDevices = backendDashboard?.devices || {};
  const filteredTanks = productGroups.length
    ? dashboardTanks.filter((tank) => tankMatchesGroups(tank, productGroups))
    : [];
  const activeTanks =
    backendDashboard?.activeTanks ??
    filteredTanks.filter(
      (tank) =>
        String(tank.status || tank.healthStatus || "active").toLowerCase() !==
        "offline"
    ).length;
  const activeNozzles =
    backendDashboard?.activeNozzles ??
    dashboardDevices.activeNozzles ??
    backendDashboard?.active_nozzles ??
    0;
  const renderedProductTotals = productGroups.map((group) =>
    productTotalForGroup(backendDashboard?.products, group)
  );
  const todaySales = renderedProductTotals.reduce(
    (sum, product) => sum + Number(product.amount || 0),
    0
  );
  const todayLiters = renderedProductTotals.reduce(
    (sum, product) => sum + Number(product.liters || 0),
    0
  );
  const selectedDateLabel = selectedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const dashboardCards = [
    ["Total Sales", formatMoney(todaySales), formatLiters(todayLiters), "primary"],
    [
      "Closing Cash",
      formatMoney(dashboardTotals.totalCollections ?? todaySales),
      "Saved operating day collection",
      "success",
    ],
    ["Active Tanks", activeTanks, "Configured operational tanks", ""],
    ["Active Nozzles", activeNozzles, "Configured nozzles", ""],
  ];

  return (
    <main className="ppm-main dashboard-page">
      <OperationsHeader
        module="Front Panel"
        title="Operations Dashboard"
        subtitle="Station operating day, sales movement and tank status."
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
              className="ppm-button primary"
              onClick={() => setCurrentPage("dsr")}
            >
              Daily DSR
            </button>
          </>
        }
      />

      <section className="dashboard-command-panel operation-day-panel">
        <div className="dashboard-day-card">
          <span>Operation Day</span>
          <strong>{selectedDateLabel}</strong>
          <em>
            {backendDashboard === null
              ? "Waiting for saved DSR data"
              : "Saved DSR data loaded"}
          </em>
        </div>
        <div className="dashboard-command-actions">
          <button
            type="button"
            className="console-action-button"
            onClick={() => setCurrentPage("products")}
          >
            <span>01</span>
            <strong>Enter Fuel Readings</strong>
          </button>
          <button
            type="button"
            className="console-action-button"
            onClick={() => setCurrentPage("dsr")}
          >
            <span>02</span>
            <strong>Review Daily DSR</strong>
          </button>
          <button
            type="button"
            className="console-action-button"
            onClick={() => setCurrentPage("reports")}
          >
            <span>03</span>
            <strong>Print Reports</strong>
          </button>
        </div>
      </section>

      <section className="ppm-card operation-dashboard-card">
        <div className="ppm-card-title">
          <div>
            <p className="ppm-kicker">Operation Dashboard</p>
            <h2>Daily KPI Overview</h2>
            <span>Configured fuel products only</span>
          </div>
        </div>
        <div className="dashboard-kpi-grid erp-kpi-grid">
          {dashboardCards.map(([label, value, helper, variant]) => (
            <article key={label} className={`dashboard-kpi ${variant || ""}`}>
              <span>{label}</span>
              <strong>{value}</strong>
              <em>{helper}</em>
            </article>
          ))}
        </div>
        {renderedProductTotals.length === 0 ? (
          <div className="ppm-empty-state compact">
            <strong>No configured fuels</strong>
            <span>Enable products in Fuel Master to populate dashboard cards.</span>
          </div>
        ) : (
          <div className="product-mini-grid dashboard-product-kpis">
            {renderedProductTotals.map((product) => (
              <div key={product.productKey}>
                <span>{product.title}</span>
                <strong>{formatMoney(product.amount)}</strong>
                <em>{formatLiters(product.liters)}</em>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ppm-card tank-status-overview">
        <div className="ppm-card-title">
          <div>
            <p className="ppm-kicker">Tank Status Overview</p>
            <h2>Configured Fuel Tanks</h2>
            <span>Backend tank health and stock snapshot</span>
          </div>
        </div>
        {filteredTanks.length === 0 ? (
          <div className="ppm-empty-state">
            <strong>No tank status data</strong>
            <span>Configure tanks or save DSR records to populate stock status.</span>
          </div>
        ) : (
          <div className="tank-status-grid">
            {filteredTanks.slice(0, 8).map((tank) => {
              const percent = Number(
                tank.capacityPercentage ??
                  tank.capacity_percentage ??
                  tank.filledPercent ??
                  0
              );

              return (
                <article key={tank.id || tank.tankNumber || tank.tank_number}>
                  <div>
                    <strong>{tank.tankNumber || tank.tank_number || tank.name}</strong>
                    <span>
                      {tank.productType || tank.product_type || tank.product || "-"}
                    </span>
                  </div>
                  <em>
                    {formatLiters(
                      tank.currentStock || tank.current_stock || tank.currentVolume || 0
                    )}
                  </em>
                  <div className="product-fill-track">
                    <span
                      style={{
                        width: `${Math.min(Math.max(percent, 0), 100)}%`,
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
