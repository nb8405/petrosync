import React from "react";
import { formatLiters } from "../utils/dsrData";
import TankIcon from "./TankIcon";

export default function TankCapacityCard({ tank, compact = false }) {
  const percentage = Math.min(
    Math.max(Number(tank?.percentageFilled || 0), 0),
    100
  );

  return (
    <article className={`tank-capacity-card ${compact ? "compact" : ""}`}>
      <div className="tank-capacity-head">
        <div className="tank-icon-shell">
          <TankIcon />
        </div>
        <div>
          <p className="ppm-kicker">{tank?.fuelType || "Fuel"}</p>
          <h3>{tank?.tankName || "Tank"}</h3>
          <span>{tank?.lastUpdated || "Pending update"}</span>
        </div>
      </div>

      <div className="tank-capacity-meter" aria-label={`${percentage}% filled`}>
        <div style={{ width: `${percentage}%` }} />
      </div>

      <div className="tank-capacity-grid">
        <div>
          <span>Current Volume</span>
          <strong>{formatLiters(tank?.currentVolume)}</strong>
        </div>
        <div>
          <span>Total Capacity</span>
          <strong>{formatLiters(tank?.capacity)}</strong>
        </div>
        <div className="tank-capacity-percent">
          <span>Filled</span>
          <strong>{percentage.toFixed(1)}%</strong>
        </div>
      </div>
    </article>
  );
}
