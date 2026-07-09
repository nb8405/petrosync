import React from "react";

const formatDate = (date) =>
  date instanceof Date
    ? date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

const statusLabel = ({ recordStatus, saveState, hasUnsavedChanges }) => {
  if (saveState === "failed") {
    return "Save Failed";
  }

  if (hasUnsavedChanges) {
    return "Unsaved";
  }

  if (recordStatus === "new") {
    return "New DSR";
  }

  if (recordStatus === "loading") {
    return "Loading";
  }

  return "Saved";
};

export default function OperationsHeader({
  module = "Operations",
  title,
  subtitle,
  selectedDate,
  user,
  pumpBranding,
  recordStatus,
  saveState,
  hasUnsavedChanges,
  actions,
}) {
  const pumpName = pumpBranding?.pumpName || "PetroSync";
  const logoDataUrl = pumpBranding?.logoDataUrl;
  const initials = pumpName.slice(0, 2).toUpperCase();
  const dsrStatus = statusLabel({ recordStatus, saveState, hasUnsavedChanges });

  return (
    <header className="ops-header">
      <div className="ops-brand-block">
        <div className="ops-brand-mark">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={`${pumpName} logo`} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div>
          <p className="ppm-kicker">{module}</p>
          <h1>{title}</h1>
          {subtitle && <p className="ppm-muted">{subtitle}</p>}
        </div>
      </div>

      <div className="ops-status-cluster">
        <div className="ops-status-cell">
          <span>Station</span>
          <strong>{pumpName}</strong>
        </div>
        <div className="ops-status-cell">
          <span>Business Date</span>
          <strong>{formatDate(selectedDate)}</strong>
        </div>
        <div className="ops-status-cell">
          <span>User</span>
          <strong>{user?.displayName || user?.username || "-"}</strong>
          {user?.role && <em>{user.role}</em>}
        </div>
        <div className={`ops-status-cell dsr-state ${hasUnsavedChanges ? "warning" : "success"}`}>
          <span>DSR State</span>
          <strong>{dsrStatus}</strong>
        </div>
        {actions && <div className="ops-header-actions">{actions}</div>}
      </div>
    </header>
  );
}
