import React from "react";

export default function TopTabNavigation({
  tabs,
  activeTab,
  onChange,
  ariaLabel = "Page sections",
  className = "",
}) {
  return (
    <nav
      className={`configuration-tabs top-tab-navigation ${className}`.trim()}
      aria-label={ariaLabel}
      role="tablist"
    >
      {tabs.map((tab) => {
        const key = Array.isArray(tab) ? tab[0] : tab.key;
        const label = Array.isArray(tab) ? tab[1] : tab.label;
        const icon = Array.isArray(tab) ? null : tab.icon;

        return (
          <button
            key={key}
            type="button"
            className={activeTab === key ? "active" : ""}
            onClick={() => onChange(key)}
            role="tab"
            aria-selected={activeTab === key}
          >
            {icon && <span className="top-tab-icon" aria-hidden="true">{icon}</span>}
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
