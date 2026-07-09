import React from "react";
import { formatMoney } from "../utils/dsrData";

export default function SalesBarChart({
  title,
  subtitle,
  data,
  loading = false,
  emptyMessage = "No sales data available for this period.",
}) {
  const hasData =
    Array.isArray(data) &&
    data.some(
      (item) =>
        Number(item.value || 0) > 0 || Number(item.quantity || 0) > 0
    );
  const maxValue = Math.max(
    ...((data || []).map((item) =>
      Math.max(Number(item.value || 0), Number(item.quantity || 0))
    )),
    1
  );

  return (
    <section className="sales-chart-card dashboard-panel">
      <div className="sales-chart-head">
        <div>
          <p className="ppm-kicker">Analytics</p>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="sales-chart-legend">
          <span />
          Sales amount
        </div>
      </div>

      {loading && (
        <div className="ppm-loading-state">
          <span />
          <strong>Loading chart data</strong>
        </div>
      )}

      {!loading && !hasData && (
        <div className="ppm-empty-state">
          <strong>No data</strong>
          <span>{emptyMessage}</span>
        </div>
      )}

      {!loading && hasData && (
        <div className="sales-chart-bars" role="img" aria-label={subtitle}>
          {data.map((item) => {
            const value = Number(item.value || 0);
            const barValue = Math.max(value, Number(item.quantity || 0));
            const height =
              barValue > 0 ? Math.max((barValue / maxValue) * 100, 8) : 4;
            const tooltip = `${item.label}: ${formatMoney(value)}${
              item.helper ? `, ${item.helper}` : ""
            }${item.detail ? `, ${item.detail}` : ""}`;

            return (
              <div
                className="sales-chart-bar-cell"
                key={item.label}
                title={tooltip}
              >
                <div className="sales-chart-bar-track">
                  <div
                    className="sales-chart-bar"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <strong>{formatMoney(value)}</strong>
                <span>{item.label}</span>
                {item.helper && <em>{item.helper}</em>}
                {item.detail && <small>{item.detail}</small>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
