import React, { useState } from "react";
import { productPrintGroupsFromConfig } from "./utils/dsrData";

const pageForProductKey = (productKey) => `product-${productKey}`;

const roleCanReadReports = (role) =>
  role === "Owner" ||
  ["Accountant", "Manager", "Supervisor", "Auditor", "ReadOnly"].includes(role);

const Icon = ({ name }) => {
  const paths = {
    menu: "M4 7h16M4 12h16M4 17h16",
    home: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.5Z",
    fuel: "M6 3h8a2 2 0 0 1 2 2v16H6V3Zm3 4h4M16 8h2l2 3v6a2 2 0 0 1-4 0v-5",
    dsr: "M6 3h12v18H6V3Zm3 5h6M9 12h6M9 16h4",
    reports: "M5 19V5m0 14h15M9 16V9m4 7V6m4 10v-5",
    settings: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-5v3m0 12v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M1 12h3m16 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12",
    logout: "M10 6H6v12h4m3-3 3-3-3-3m3 3H9",
    chevron: "m9 6 6 6-6 6",
    logo: "M12 3 4 8v8l8 5 8-5V8l-8-5Zm0 5 4 2.5v3L12 16l-4-2.5v-3L12 8Z",
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={paths[name]}
        fill={["home", "logo"].includes(name) ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default function Sidebar({
  theme,
  currentPage,
  setCurrentPage,
  user,
  pumpBranding,
  productConfig,
  onLogout,
}) {
  const [productsOpen, setProductsOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("ppm-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem("ppm-sidebar-collapsed", String(collapsed));
    } catch {
      // Sidebar state is a non-critical preference.
    }
  }, [collapsed]);

  const productPrintGroups = productPrintGroupsFromConfig(productConfig);
  const productPages = [
    "products",
    ...productPrintGroups.map((group) => pageForProductKey(group.productKey)),
  ];

  const isActive = (page) =>
    page === "products"
      ? productPages.includes(currentPage)
      : currentPage === page;

  const navigate = (page) => {
    setCurrentPage(page);
  };

  return (
    <aside
      className={`ppm-sidebar ${collapsed ? "is-collapsed" : ""}`}
      style={{
        "--sidebar-bg": "var(--clr-sidebar-bg)",
        "--sidebar-text": "var(--clr-sidebar-text)",
        "--sidebar-accent": theme?.accent || "var(--clr-green)",
      }}
    >
      <div className="sidebar-brand-row">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name="menu" />
        </button>
        <div className="sidebar-logo-mark">
          <Icon name="logo" />
        </div>
        <h2>{pumpBranding?.pumpName || "PetroSync"}</h2>
      </div>

      {user && (
        <div className="sidebar-user-card">
          <strong>{user.displayName || user.username}</strong>
          <span>{user.role}</span>
        </div>
      )}

      <nav className="sidebar-nav" aria-label="Primary">
        <button
          type="button"
          className={`sidebar-item ${isActive("home") ? "active" : ""}`}
          onClick={() => navigate("home")}
          title="Home"
        >
          <Icon name="home" />
          <span>Home</span>
        </button>

        <button
          type="button"
          className={`sidebar-item ${isActive("products") ? "active" : ""}`}
          onClick={() => {
            if (!collapsed) {
              setProductsOpen((value) => !value);
            }
            navigate("products");
          }}
          title="Products"
        >
          <Icon name="fuel" />
          <span>Products</span>
          <span className={`sidebar-chevron ${productsOpen ? "open" : ""}`}>
            <Icon name="chevron" />
          </span>
        </button>

        {productsOpen && !collapsed && (
          <div className="sidebar-subnav">
            {productPrintGroups.map((group) => {
              const page = pageForProductKey(group.productKey);

              return (
                <button
                  key={group.productKey}
                  type="button"
                  className={`sidebar-subitem ${
                    currentPage === page ? "active" : ""
                  }`}
                  onClick={() => navigate(page)}
                  title={group.title}
                >
                  <span>{group.title.slice(0, 2)}</span>
                  <strong>{group.title}</strong>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className={`sidebar-item ${isActive("dsr") ? "active" : ""}`}
          onClick={() => navigate("dsr")}
          title="Daily DSR"
        >
          <Icon name="dsr" />
          <span>Daily DSR</span>
        </button>

        {roleCanReadReports(user?.role) && (
          <button
            type="button"
            className={`sidebar-item ${isActive("reports") ? "active" : ""}`}
            onClick={() => navigate("reports")}
            title="Reports"
          >
            <Icon name="reports" />
            <span>Reports</span>
          </button>
        )}

        <button
          type="button"
          className={`sidebar-item ${isActive("configuration") ? "active" : ""}`}
          onClick={() => navigate("configuration")}
          title="Configuration"
        >
          <Icon name="settings" />
          <span>Configuration</span>
        </button>
      </nav>

      <button
        type="button"
        className="sidebar-item sidebar-logout"
        onClick={onLogout}
        title="Logout"
      >
        <Icon name="logout" />
        <span>Logout</span>
      </button>
    </aside>
  );
}
