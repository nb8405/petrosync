import React from "react";
import { productPrintGroupsFromConfig } from "../utils/dsrData";

const priceText = (fuelPrices = {}, productConfig = []) => {
  const labels = productPrintGroupsFromConfig(productConfig).map((group) => [
    group.productKey,
    group.title,
  ]);

  if (labels.length === 0) {
    return null;
  }

  return labels
    .map(([key, label]) => {
      const value = Number(fuelPrices[key] || 0);
      return value > 0 ? `${label} Rs. ${value.toFixed(2)}` : `${label} rate pending`;
    })
    .join(" | ");
};

export default function StatusTicker({
  selectedDate,
  recordStatus,
  saveState,
  hasUnsavedChanges,
  fuelPrices,
  productConfig,
  dashboardData,
  items = [],
}) {
  const dateLabel =
    selectedDate instanceof Date
      ? selectedDate.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";
  const activeTanks =
    dashboardData?.activeTanks ??
    (dashboardData?.tanks || dashboardData?.tankStatus || []).filter(
      (tank) =>
        String(tank.status || tank.healthStatus || "active").toLowerCase() !==
        "offline"
    ).length;
  const activeNozzles =
    dashboardData?.activeNozzles ?? dashboardData?.devices?.activeNozzles;
  const tickerItems = [
    `Business date ${dateLabel}`,
    hasUnsavedChanges ? "Unsaved DSR changes" : `DSR ${recordStatus || saveState || "idle"}`,
    priceText(fuelPrices, productConfig),
    activeTanks !== undefined ? `${activeTanks} active tanks` : null,
    activeNozzles !== undefined ? `${activeNozzles} active nozzles` : null,
    ...items,
  ].filter(Boolean);

  return (
    <div className="ops-ticker" role="status" aria-live="polite">
      <strong>Live Status</strong>
      <div>
        {tickerItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}
