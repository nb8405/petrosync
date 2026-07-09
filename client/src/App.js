import React from "react";
import { themes } from "./theme";
import Sidebar from "./Sidebar";
import DSRPage from "./pages/DSRPage";
import FuelEntryPage from "./pages/FuelEntryPage";
import HomePage from "./pages/HomePage";
import ProductsPage from "./pages/ProductsPage";
import ReportsPage from "./pages/ReportsPage";
import LoginPage from "./pages/LoginPage";
import ConfigurationPage from "./pages/ConfigurationPage";
import {
  emptyFuelPrices,
  dateInputValue,
  initialForm,
  initialFormFromProductConfig,
  productConfigFromWorkspace,
  productPrintGroupForKey,
  validateDsrForm,
  formFromBackendRecord,
} from "./utils/dsrData";
import { backendApi } from "./utils/backendApi";
import {
  clearAuthSession,
  getRefreshToken,
  onUnauthorized,
  setAuthSession,
} from "./utils/authSession";

const DEFAULT_THEME_KEY = "indianOil";
const THEME_STORAGE_KEY = "ppm-theme";

const storedThemeKey = () => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return themes[stored] ? stored : "";
  } catch {
    return "";
  }
};

const initialThemeKey = () => storedThemeKey() || DEFAULT_THEME_KEY;

function App() {
  const [currentTheme, setCurrentTheme] =
    React.useState(initialThemeKey);
  const [currentPage, setCurrentPage] = React.useState("home");
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [form, setForm] = React.useState(initialForm);
  const [user, setUser] = React.useState(null);
  const [authMessage, setAuthMessage] = React.useState("");
  const [recordStatus, setRecordStatus] = React.useState("idle");
  const [fuelPrices, setFuelPrices] = React.useState(emptyFuelPrices);
  const [savedSnapshot, setSavedSnapshot] = React.useState(JSON.stringify(initialForm));
  const [savedForm, setSavedForm] = React.useState(initialForm);
  const [saveState, setSaveState] = React.useState("saved");
  const [workflowModal, setWorkflowModal] = React.useState(null);
  const [dashboardRefreshKey, setDashboardRefreshKey] = React.useState(0);
  const [forecourtConfig, setForecourtConfig] = React.useState({
    tanks: [],
    nozzles: [],
  });
  const [setupStatus, setSetupStatus] = React.useState({
    loading: true,
    needsSetup: true,
    workspace: null,
    message: "",
  });

  const theme = themes[currentTheme] || themes.indianOil;
  const pumpWorkspace = setupStatus.workspace;
  const configuredProductConfig = React.useMemo(
    () => productConfigFromWorkspace(pumpWorkspace, forecourtConfig),
    [pumpWorkspace, forecourtConfig]
  );
  const activeInitialForm = React.useMemo(
    () => initialFormFromProductConfig(configuredProductConfig),
    [configuredProductConfig]
  );
  const pumpName = pumpWorkspace?.pumpName || "PetroSync";
  const pumpBranding = React.useMemo(
    () => ({
      pumpName,
      logoDataUrl: pumpWorkspace?.logoDataUrl || "",
      company: pumpWorkspace?.company || "",
      dealerName: pumpWorkspace?.dealerName || "",
      themeKey: pumpWorkspace?.themeKey || currentTheme,
    }),
    [currentTheme, pumpName, pumpWorkspace]
  );
  const formSnapshot = React.useMemo(() => JSON.stringify(form), [form]);
  const hasUnsavedChanges = user && formSnapshot !== savedSnapshot;
  const normalizedDateKey = (date) =>
    date instanceof Date ? dateInputValue(date) : String(date || "").slice(0, 10);

  React.useEffect(() => {
    onUnauthorized(() => {
      clearAuthSession();
      setUser(null);
      setAuthMessage("Your session expired. Please sign in again.");
    });
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
    } catch {
      // Theme persistence is a non-critical preference.
    }
  }, [currentTheme]);

  React.useEffect(() => {
    let active = true;

    backendApi
      .setupStatus()
      .then((result) => {
        if (!active) {
          return;
        }

        setSetupStatus({
          loading: false,
          needsSetup: Boolean(result.needsSetup),
          workspace: result.workspace || null,
          message: result.message || "",
          userCount: result.userCount || 0,
          hasWorkspace: Boolean(result.hasWorkspace),
          blockedByLegacyPasswordHash: Boolean(result.blockedByLegacyPasswordHash),
          blockedByIncompleteOnboarding: Boolean(result.blockedByIncompleteOnboarding),
        });

        if (
          !storedThemeKey() &&
          result.workspace?.themeKey &&
          themes[result.workspace.themeKey]
        ) {
          setCurrentTheme(result.workspace.themeKey);
        }
      })
      .catch(() => {
        if (active) {
          setSetupStatus((previous) => ({
            ...previous,
            loading: false,
          }));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;

    backendApi
      .getFuelPrices()
      .then((result) => {
        if (active) {
          setFuelPrices(result.prices || emptyFuelPrices);
        }
      })
      .catch(() => {
        if (active) {
          setFuelPrices(emptyFuelPrices);
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  React.useEffect(() => {
    if (!user) {
      setForecourtConfig({ tanks: [], nozzles: [] });
      return undefined;
    }

    let active = true;

    Promise.all([
      backendApi.listTanks(),
      backendApi.listNozzles(),
    ])
      .then(([tanksResult, nozzlesResult]) => {
        if (active) {
          setForecourtConfig({
            tanks: tanksResult?.rows || [],
            nozzles: nozzlesResult?.rows || [],
          });
        }
      })
      .catch(() => {
        if (active) {
          setForecourtConfig({ tanks: [], nozzles: [] });
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  React.useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;
    setRecordStatus("loading");

    backendApi
      .getDsr(selectedDate)
      .then((result) => {
        if (active) {
          const nextForm = formFromBackendRecord(result.record, configuredProductConfig);
          setForm(nextForm);
          setSavedForm(nextForm);
          setSavedSnapshot(JSON.stringify(nextForm));
          setSaveState("saved");
          setRecordStatus("loaded");
        }
      })
      .catch((error) => {
        if (active) {
          const nextForm = { ...activeInitialForm };
          setForm(nextForm);
          setSavedForm(nextForm);
          setSavedSnapshot(JSON.stringify(nextForm));
          setSaveState("saved");
          setRecordStatus(
            error.message === "DSR record not found." ? "new" : "error"
          );
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDate, user, configuredProductConfig, activeInitialForm]);

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      return next;
    });
    setSaveState("unsaved");
  };

  const saveCurrentRecord = async () => {
    setSaveState("saving");
    const validation = validateDsrForm(form, configuredProductConfig);

    if (!validation.ok) {
      setSaveState("failed");
      return validation;
    }

    try {
      const result =
        recordStatus === "new"
          ? await backendApi.createDsr(selectedDate, form, fuelPrices, configuredProductConfig)
          : await backendApi.updateDsr(selectedDate, form, fuelPrices, configuredProductConfig);

      setRecordStatus("loaded");
      setSavedForm(form);
      setSavedSnapshot(JSON.stringify(form));
      setSaveState("saved");
      setDashboardRefreshKey((value) => value + 1);

      return {
        ok: true,
        message: result.dsrNumber
          ? `DSR saved successfully. ${result.dsrNumber}`
          : "DSR saved successfully.",
      };
    } catch (error) {
      if (error.message === "DSR record not found.") {
        const result = await backendApi.createDsr(
          selectedDate,
          form,
          fuelPrices,
          configuredProductConfig
        );
        setRecordStatus("loaded");
        setSavedForm(form);
        setSavedSnapshot(JSON.stringify(form));
        setSaveState("saved");
        setDashboardRefreshKey((value) => value + 1);
        return {
          ok: true,
          message: `DSR saved successfully. ${result.dsrNumber || ""}`,
        };
      }

      setSaveState("failed");
      return {
        ok: false,
        message: error.message || "Unable to save DSR.",
      };
    }
  };

  const handleLogin = (result) => {
    if (result.workspace) {
      setSetupStatus({
        loading: false,
        needsSetup: false,
        workspace: result.workspace,
      });
      if (
        !storedThemeKey() &&
        result.workspace.themeKey &&
        themes[result.workspace.themeKey]
      ) {
        setCurrentTheme(result.workspace.themeKey);
      }
    }

    setAuthSession({
      token: result.token,
      refreshToken: result.refreshToken,
      csrfToken: result.csrfToken,
      user: result.user,
    });
    setUser(result.user);
    setAuthMessage("");
  };

  const handleSetupComplete = (result) => {
    setSetupStatus({
      loading: false,
      needsSetup: false,
      workspace: result.workspace || null,
      message: "",
    });
    if (result.workspace?.themeKey && themes[result.workspace.themeKey]) {
      setCurrentTheme(result.workspace.themeKey);
    }
    setAuthMessage(result.message || "Pump workspace launched. Please sign in.");
  };

  const completeLogout = async () => {
    try {
      await backendApi.logout(getRefreshToken());
    } catch {
      // The local session should still be cleared when backend logout fails.
    }

    clearAuthSession();
    setUser(null);
    setFuelPrices(emptyFuelPrices);
    setForecourtConfig({ tanks: [], nozzles: [] });
    setForm({ ...activeInitialForm });
    setSavedForm(activeInitialForm);
    setSavedSnapshot(JSON.stringify(activeInitialForm));
    setSaveState("saved");
  };

  const requestWorkflowDecision = ({
    title,
    message,
    saveLabel,
    discardLabel,
    primaryLabel,
    primaryChoice = "save",
    primaryVariant = "primary",
    secondaryLabel,
    secondaryChoice = "discard",
    secondaryVariant = "secondary",
    neutralLabel = "Cancel",
  }) =>
    new Promise((resolve) => {
      setWorkflowModal({
        title,
        message,
        primaryLabel: primaryLabel || saveLabel,
        primaryChoice,
        primaryVariant,
        secondaryLabel:
          secondaryLabel === undefined ? discardLabel : secondaryLabel,
        secondaryChoice,
        secondaryVariant,
        neutralLabel,
        resolve,
      });
    });

  const closeWorkflowModal = (choice) => {
    const modal = workflowModal;
    setWorkflowModal(null);
    if (modal?.resolve) {
      modal.resolve(choice);
    }
  };

  const confirmUnsavedNavigation = async () => {
    if (!hasUnsavedChanges) {
      return true;
    }

    const choice = await requestWorkflowDecision({
      title: "Unsaved changes",
      message:
        "You have unsaved changes.\n\nWould you like to save before leaving?",
      saveLabel: "Save & Continue",
      discardLabel: "Leave Without Saving",
    });

    if (choice === "cancel") {
      return false;
    }

    if (choice === "save") {
      const result = await saveCurrentRecord();
      if (!result.ok) {
        alert(result.message);
        return false;
      }
    }

    if (choice === "discard") {
      setForm(savedForm);
      setSavedSnapshot(JSON.stringify(savedForm));
      setSaveState("saved");
    }

    return true;
  };

  const navigateWithGuard = async (page) => {
    if (page === currentPage) {
      return true;
    }

    if (await confirmUnsavedNavigation()) {
      setCurrentPage(page);
      return true;
    }

    return false;
  };

  const setSelectedDateWithGuard = async (date) => {
    if (await confirmUnsavedNavigation()) {
      setSelectedDate(date);
      return true;
    }

    return false;
  };

  const saveBeforePrint = async () => {
    if (!hasUnsavedChanges) {
      return true;
    }

    const choice = await requestWorkflowDecision({
      title: "Save required before printing",
      message: "This record has not been saved.\n\nSave before printing?",
      saveLabel: "Save & Print",
      discardLabel: "Cancel",
    });

    if (choice !== "save") {
      return false;
    }

    const result = await saveCurrentRecord();
    if (!result.ok) {
      alert(result.message);
      return false;
    }

    return true;
  };

  const handleLogout = async () => {
    if (hasUnsavedChanges) {
      const choice = await requestWorkflowDecision({
        title: "Unsaved changes",
        message:
          "You have unsaved changes.\n\nWould you like to save before logout?",
        saveLabel: "Save & Logout",
        discardLabel: "Logout Without Saving",
      });

      if (choice === "cancel") {
        return;
      }

      if (choice === "save") {
        const result = await saveCurrentRecord();
        if (!result.ok) {
          alert(result.message);
          return;
        }
      }

      if (choice === "discard") {
        setForm(savedForm);
        setSavedSnapshot(JSON.stringify(savedForm));
        setSaveState("saved");
      }
    }

    await completeLogout();
  };

  const deleteDsrRecord = async (date = selectedDate) => {
    const choice = await requestWorkflowDecision({
      title: "Delete saved DSR record",
      message:
        "Delete this saved DSR record?\n\nThis action will permanently remove:\n\n* DSR Record\n* Product Rows\n* Collections\n* Expenses\n* Related Summary Data",
      primaryLabel: "Delete",
      primaryChoice: "delete",
      primaryVariant: "danger",
      secondaryLabel: null,
      neutralLabel: "Cancel",
    });

    if (choice !== "delete") {
      return {
        ok: false,
        cancelled: true,
        message: "Delete cancelled.",
      };
    }

    try {
      const result = await backendApi.deleteDsr(date);
      const deletedDate = normalizedDateKey(date);

      if (deletedDate === normalizedDateKey(selectedDate)) {
        const nextForm = { ...activeInitialForm };
        setForm(nextForm);
        setSavedForm(nextForm);
        setSavedSnapshot(JSON.stringify(nextForm));
        setRecordStatus("new");
        setSaveState("saved");
      }

      setDashboardRefreshKey((value) => value + 1);

      return {
        ok: true,
        message: result.message || "DSR deleted successfully.",
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Unable to delete DSR record.",
      };
    }
  };

  React.useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) {
        return undefined;
      }

      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const pageProps = {
    theme,
    currentTheme,
    setCurrentTheme,
    selectedDate,
    setSelectedDate: setSelectedDateWithGuard,
    form,
    updateField,
    saveCurrentRecord,
    saveBeforePrint,
    setCurrentPage: navigateWithGuard,
    recordStatus,
    saveState,
    hasUnsavedChanges,
    user,
    pumpBranding,
    fuelPrices,
    setFuelPrices,
    productConfig: configuredProductConfig,
    dashboardRefreshKey,
    deleteDsrRecord,
    onSessionDeleted: completeLogout,
  };

  if (!user) {
    return (
      <div
        className="ppm-shell"
        style={{
          background: "#f8fafc",
          color: "#475569",
          minHeight: "100vh",
        }}
      >
        <style>{appStyles(theme)}</style>
        <LoginPage
          theme={theme}
          currentTheme={currentTheme}
          setCurrentTheme={setCurrentTheme}
          onLogin={handleLogin}
          onSetupComplete={handleSetupComplete}
          setupStatus={setupStatus}
          authMessage={authMessage}
          pumpBranding={pumpBranding}
        />
      </div>
    );
  }

  const renderPage = () => {
    if (currentPage === "products") {
      return <ProductsPage {...pageProps} />;
    }

    if (currentPage.startsWith("product-")) {
      const productKey = currentPage.replace("product-", "");
      const group = productPrintGroupForKey(productKey, configuredProductConfig);

      if (group) {
        return <FuelEntryPage {...pageProps} productKey={productKey} />;
      }
    }

    if (currentPage === "dsr") {
      return <DSRPage {...pageProps} />;
    }

    if (currentPage === "reports") {
      return <ReportsPage {...pageProps} />;
    }

    if (currentPage === "configuration") {
      return <ConfigurationPage {...pageProps} />;
    }

    return <HomePage {...pageProps} />;
  };

  return (
    <div
      className="ppm-shell"
      style={{
        background: "#f8fafc",
        color: "#475569",
        minHeight: "100vh",
      }}
    >
      <style>{appStyles(theme)}</style>
      <Sidebar
        theme={theme}
        currentPage={currentPage}
        setCurrentPage={navigateWithGuard}
        user={user}
        pumpBranding={pumpBranding}
        productConfig={configuredProductConfig}
        onLogout={handleLogout}
      />
      {renderPage()}
      {workflowModal && (
        <div className="ppm-modal-backdrop" role="presentation">
          <section className="ppm-modal workflow-modal" role="dialog" aria-modal="true">
            <div className="ppm-card-title">
              <h2>{workflowModal.title}</h2>
            </div>
            <p className="ppm-muted workflow-message">{workflowModal.message}</p>
            <div className="ppm-action-strip">
              <button
                type="button"
                className={`ppm-button ${workflowModal.primaryVariant}`}
                onClick={() => closeWorkflowModal(workflowModal.primaryChoice)}
              >
                {workflowModal.primaryLabel}
              </button>
              {workflowModal.secondaryLabel &&
                workflowModal.secondaryLabel !== "Cancel" && (
                <button
                  type="button"
                  className={`ppm-button ${workflowModal.secondaryVariant}`}
                  onClick={() => closeWorkflowModal(workflowModal.secondaryChoice)}
                >
                  {workflowModal.secondaryLabel}
                </button>
              )}
              <button
                type="button"
                className="ppm-button neutral"
                onClick={() => closeWorkflowModal("cancel")}
              >
                {workflowModal.neutralLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const appStyles = (theme) => {
  const selectedTheme = theme || themes[DEFAULT_THEME_KEY];
  const bg = "#f8fafc";
  const card = "#ffffff";
  const text = "#0F172A";
  const body = "#475569";
  const muted = "#64748B";
  const accent = selectedTheme.accent || themes[DEFAULT_THEME_KEY].accent;
  const accent2 = selectedTheme.accent2 || themes[DEFAULT_THEME_KEY].accent2;
  const accentSoft = selectedTheme.accentSoft || `color-mix(in srgb, ${accent} 12%, transparent)`;
  const accentRing = selectedTheme.ring || `color-mix(in srgb, ${accent} 35%, transparent)`;
  const bg2 = "#f1f5f9";
  const card2 = "#ffffff";
  const border = "rgba(15,23,42,0.10)";
  const border2 = "rgba(15,23,42,0.16)";
  const sidebarBg = `linear-gradient(180deg, ${card} 0%, color-mix(in srgb, ${accent2} 7%, ${bg}) 100%)`;
  const sidebarActive = `color-mix(in srgb, ${accent} 13%, ${card})`;
  const sidebarHover = "rgba(15,23,42,0.05)";
  const surfaceShadow = "0 4px 16px rgba(15,23,42,0.08)";

  return `
  /* ── Google Fonts ─────────────────────────────────────────── */
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  /* ── Global Design Tokens ────────────────────────────────── */
  :root {
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 10px;
    --radius-xl: 12px;
    --radius-pill: 999px;
    --shadow-xs: 0 1px 3px rgba(15,23,42,0.08);
    --shadow-sm: 0 2px 8px rgba(15,23,42,0.10);
    --shadow-md: ${surfaceShadow};
    --shadow-lg: 0 8px 30px rgba(15,23,42,0.12);
    --shadow-xl: 0 20px 50px rgba(15,23,42,0.16);
    --transition-fast: 140ms ease;
    --transition-base: 200ms ease;
    --transition-smooth: 260ms cubic-bezier(0.4, 0, 0.2, 1);
    --clr-bg: ${bg};
    --clr-bg2: ${bg2};
    --clr-card: ${card};
    --clr-card2: ${card2};
    --clr-border: ${border};
    --clr-border2: ${border2};
    --clr-text: ${text};
    --clr-body: ${body};
    --clr-muted: ${muted};
    --clr-green: ${accent};
    --clr-green-dim: ${accentSoft};
    --clr-green-glow: ${accentRing};
    --clr-blue: ${accent2};
    --clr-blue-dim: color-mix(in srgb, ${accent2} 15%, transparent);
    --clr-amber: #F59E0B;
    --clr-amber-dim: rgba(245,158,11,0.15);
    --clr-red: #EF4444;
    --clr-red-dim: rgba(239,68,68,0.15);
    --clr-sidebar-bg: ${sidebarBg};
    --clr-sidebar-active: ${sidebarActive};
    --clr-sidebar-hover: ${sidebarHover};
    --clr-sidebar-text: ${muted};
    --clr-sidebar-strong: ${text};
    --clr-sidebar-accent: ${accent};
  }

  /* ── Shell ────────────────────────────────────────────────── */
  .ppm-shell {
    display: flex;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    letter-spacing: -0.01em;
    background: var(--clr-bg);
    min-height: 100vh;
  }

  .ppm-shell,
  .ppm-shell * {
    box-sizing: border-box;
  }

  .ppm-main {
    flex: 1;
    min-width: 0;
    padding: 24px 28px 40px;
    overflow-y: auto;
    background: var(--clr-bg);
  }

  .login-page {
    width: 100%;
    min-height: 100vh;
    display: grid;
    align-content: start;
    gap: 18px;
    background:
      linear-gradient(135deg, var(--accent-weak), transparent 34%),
      var(--bg);
  }

  .onboarding-wizard {
    --wizard-radius: 16px;
    --wizard-card-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
    --wizard-soft-shadow: 0 10px 24px rgba(15, 23, 42, 0.07);
    --wizard-blue: #0b5cab;
    --wizard-blue-strong: #0752ad;
    --wizard-blue-soft: #eaf3ff;
    --wizard-green: #16a34a;
    --wizard-green-soft: #eaf8ef;
    --wizard-gray: #f3f6fb;
    --wizard-line: #d9e2ef;
    --wizard-warning-bg: #fff8e7;
    --wizard-warning-border: #f6cf71;
    --wizard-warning-text: #8a5800;
    min-height: 100vh;
    align-content: start;
    gap: 22px;
    padding: 22px;
    background:
      linear-gradient(180deg, #f8fbff 0%, #eef3f9 100%),
      #f3f6fb;
    color: #10203f;
    letter-spacing: 0;
  }

  .wizard-topbar {
    position: sticky;
    top: 0;
    z-index: 8;
    width: min(1500px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 430px);
    gap: 28px;
    align-items: center;
    padding: 20px 22px;
    border-radius: var(--wizard-radius);
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: rgba(255, 255, 255, 0.96);
    box-shadow: var(--wizard-card-shadow);
    backdrop-filter: blur(14px);
  }

  .wizard-brand-lockup {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .wizard-brand-lockup .petrosync-logo {
    flex: 0 0 auto;
  }

  .wizard-brand-lockup .petrosync-logo-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
  }

  .wizard-brand-lockup .petrosync-logo-text {
    display: none;
  }

  .wizard-brand-lockup > div:last-child {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .wizard-brand-lockup strong {
    color: #101a33;
    font-size: 25px;
    font-weight: 850;
    line-height: 1.05;
  }

  .wizard-brand-lockup span {
    color: #52627a;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
  }

  .wizard-progress-block {
    min-width: 0;
    display: grid;
    gap: 10px;
  }

  .wizard-progress-block > div:first-child,
  .wizard-summary-progress > div:first-child {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .wizard-progress-block strong,
  .wizard-summary-progress strong {
    color: #10203f;
    font-size: 14px;
    font-weight: 850;
  }

  .wizard-progress-block span,
  .wizard-summary-progress span,
  .wizard-summary-head span,
  .wizard-summary-fuels > span,
  .wizard-summary-list dt,
  .wizard-section-head span,
  .wizard-panel-head > div > span {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.35;
    text-transform: uppercase;
  }

  .wizard-progress-block > div:first-child span {
    color: var(--wizard-blue);
    font-size: 17px;
    font-weight: 850;
    text-transform: none;
  }

  .wizard-progress-track {
    width: 100%;
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: #e5ebf3;
  }

  .wizard-progress-track span {
    display: grid;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--wizard-blue-strong), #1d6fe8);
    transition: width 260ms ease;
  }

  .wizard-shell {
    width: min(1500px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(310px, 390px) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
  }

  .wizard-side,
  .wizard-panel,
  .wizard-preview-card,
  .wizard-section-card {
    min-width: 0;
    border: 1px solid rgba(15, 23, 42, 0.08);
    overflow: hidden;
    border-radius: var(--wizard-radius);
    background: #ffffff;
    color: #10203f;
    box-shadow: var(--wizard-card-shadow);
  }

  .wizard-side {
    position: sticky;
    top: 112px;
    display: grid;
    gap: 18px;
    padding: 22px;
  }

  .wizard-side-head {
    display: grid;
    gap: 4px;
  }

  .wizard-side-head h2 {
    margin: 0;
    color: #10203f;
    font-size: 18px;
    font-weight: 850;
    line-height: 1.2;
  }

  .wizard-side-head span {
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .wizard-panel {
    display: grid;
    gap: 18px;
    padding: 0;
    overflow: visible;
  }

  .wizard-stepper {
    position: relative;
    display: grid;
    gap: 12px;
  }

  .wizard-svg-icon {
    width: 20px;
    height: 20px;
    display: block;
    flex: 0 0 auto;
  }

  .wizard-step-row {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    min-height: 76px;
    border: 1px solid #e1e8f2;
    border-radius: 14px;
    padding: 12px;
    background: #f8fafd;
    color: #10203f;
    font: inherit;
    cursor: pointer;
    text-align: left;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      border-color 160ms ease,
      background 160ms ease,
      color 160ms ease;
  }

  .wizard-step-row:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: #bfd4ef;
    box-shadow: var(--wizard-soft-shadow);
  }

  .wizard-step-row:disabled {
    cursor: not-allowed;
    opacity: 1;
  }

  .wizard-step-status {
    display: grid;
    grid-template-columns: 32px 36px;
    gap: 8px;
    align-items: center;
  }

  .wizard-step-number,
  .wizard-step-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }

  .wizard-step-number {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    color: #64748b;
    background: #edf2f8;
    border: 1px solid #d8e2ef;
    font-size: 14px;
    font-weight: 850;
  }

  .wizard-step-icon {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    color: #64748b;
    background: #ffffff;
    border: 1px solid #e1e8f2;
  }

  .wizard-step-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .wizard-step-copy strong {
    color: inherit;
    font-size: 14px;
    font-weight: 850;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .wizard-step-copy small {
    color: inherit;
    opacity: 0.68;
    font-size: 12.5px;
    font-weight: 650;
    line-height: 1.35;
  }

  .wizard-step-row.active {
    border-color: var(--wizard-blue);
    background: linear-gradient(135deg, var(--wizard-blue), #1971df);
    color: #ffffff;
    box-shadow: 0 18px 36px rgba(11, 92, 171, 0.22);
  }

  .wizard-step-row.active .wizard-step-number,
  .wizard-step-row.active .wizard-step-icon {
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.17);
  }

  .wizard-step-row.complete {
    border-color: #bde7cc;
    background: var(--wizard-green-soft);
  }

  .wizard-step-row.complete .wizard-step-number {
    color: #ffffff;
    border-color: var(--wizard-green);
    background: var(--wizard-green);
  }

  .wizard-step-row.complete .wizard-step-icon {
    color: var(--wizard-green);
    border-color: #bde7cc;
    background: #ffffff;
  }

  .wizard-preview-card {
    display: grid;
    gap: 16px;
    padding: 18px;
    box-shadow: var(--wizard-soft-shadow);
  }

  .wizard-summary-head,
  .wizard-preview-brand {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
  }

  .wizard-summary-head .petrosync-logo-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
  }

  .wizard-summary-head > div,
  .wizard-preview-brand > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .wizard-summary-head strong,
  .wizard-preview-brand strong,
  .wizard-summary-list dd,
  .wizard-summary-fuels strong {
    display: block;
    min-width: 0;
    margin: 0;
    color: #10203f;
    font-weight: 850;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .wizard-summary-head small,
  .wizard-preview-brand span,
  .wizard-summary-progress small {
    min-width: 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
  }

  .wizard-summary-fuels {
    display: grid;
    gap: 8px;
  }

  .wizard-summary-fuels > div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .wizard-summary-fuels strong,
  .wizard-preview-grid span,
  .wizard-review-grid article {
    border: 1px solid #dfe8f4;
    border-radius: 999px;
    padding: 7px 10px;
    background: #f7faff;
    color: #10203f;
    font-size: 12px;
    font-weight: 800;
  }

  .wizard-summary-list {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .wizard-summary-list div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid #edf2f8;
  }

  .wizard-summary-progress {
    display: grid;
    gap: 8px;
    padding: 14px;
    border: 1px solid #dfe8f4;
    border-radius: 14px;
    background: #f8fbff;
  }

  .wizard-panel-head {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    align-items: center;
    gap: 16px;
    padding: 28px 34px 22px;
    border-bottom: 1px solid #e6edf6;
  }

  .wizard-panel-icon {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: var(--wizard-blue);
    background: var(--wizard-blue-soft);
  }

  .wizard-panel-icon .wizard-svg-icon {
    width: 30px;
    height: 30px;
  }

  .wizard-panel-head h2 {
    margin: 0;
    color: #10203f;
    font-size: 26px;
    font-weight: 850;
    line-height: 1.15;
  }

  .wizard-panel-head p {
    margin: 7px 0 0;
    color: #52627a;
    font-size: 15px;
    font-weight: 650;
    line-height: 1.45;
  }

  .wizard-step-body,
  .wizard-panel > .login-message,
  .wizard-validation-card {
    margin-right: 34px;
    margin-left: 34px;
  }

  .wizard-step-body {
    min-width: 0;
    display: grid;
    gap: 18px;
  }

  .wizard-transition {
    animation: wizardStepIn 200ms ease;
  }

  @keyframes wizardStepIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .wizard-step-content,
  .wizard-subsection,
  .wizard-section-stack {
    display: grid;
    gap: 18px;
  }

  .wizard-section-card {
    display: grid;
    gap: 18px;
    padding: 20px;
    box-shadow: none;
  }

  .wizard-section-head {
    display: grid;
    gap: 4px;
  }

  .wizard-section-head h3 {
    margin: 0;
    color: #10203f;
    font-size: 17px;
    font-weight: 850;
    line-height: 1.2;
  }

  .wizard-form-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .wizard-field {
    display: grid;
    gap: 7px;
    min-width: 0;
  }

  .wizard-field.span-full,
  .wizard-check-field.span-full {
    grid-column: 1 / -1;
  }

  .wizard-field-label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #24334d;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.35;
  }

  .wizard-field-label em {
    color: #dc2626;
    font-style: normal;
  }

  .wizard-input-shell {
    position: relative;
    min-width: 0;
    display: grid;
    align-items: center;
  }

  .wizard-input-shell > .wizard-svg-icon {
    position: absolute;
    left: 13px;
    z-index: 1;
    width: 18px;
    height: 18px;
    color: #70819a;
    pointer-events: none;
  }

  .wizard-input-shell.textarea > .wizard-svg-icon {
    top: 13px;
  }

  .onboarding-wizard .ppm-input,
  .onboarding-wizard .ppm-theme-select {
    width: 100%;
    min-height: 44px;
    border: 1px solid #cbd7e6;
    border-radius: 11px;
    padding: 10px 40px 10px 42px;
    color: #10203f;
    background: #ffffff;
    font: inherit;
    font-size: 14px;
    font-weight: 650;
    letter-spacing: 0;
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease,
      background 160ms ease,
      opacity 160ms ease;
  }

  .onboarding-wizard textarea.ppm-input {
    min-height: 88px;
    resize: vertical;
    line-height: 1.45;
  }

  .onboarding-wizard .ppm-input::placeholder {
    color: #98a6ba;
    font-weight: 550;
  }

  .onboarding-wizard .ppm-input:hover,
  .onboarding-wizard .ppm-theme-select:hover {
    border-color: #9eb2ca;
  }

  .onboarding-wizard .ppm-input:focus-visible,
  .onboarding-wizard .ppm-theme-select:focus-visible,
  .wizard-step-row:focus-visible,
  .wizard-select-card:focus-visible,
  .wizard-icon-button:focus-visible {
    outline: 3px solid rgba(11, 92, 171, 0.26);
    outline-offset: 2px;
  }

  .onboarding-wizard .ppm-input:focus,
  .onboarding-wizard .ppm-theme-select:focus {
    border-color: var(--wizard-blue);
    box-shadow: 0 0 0 4px rgba(11, 92, 171, 0.12);
  }

  .onboarding-wizard .ppm-input:disabled,
  .onboarding-wizard .ppm-theme-select:disabled,
  .wizard-select-card:disabled,
  .wizard-check-field input:disabled {
    color: #7d8aa0;
    background: #f3f6fa;
    opacity: 0.74;
    cursor: not-allowed;
  }

  .wizard-field-state {
    position: absolute;
    right: 12px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    color: #94a3b8;
    pointer-events: none;
  }

  .wizard-field-state .wizard-svg-icon {
    width: 17px;
    height: 17px;
  }

  .wizard-field.is-success .ppm-input,
  .wizard-field.is-success .ppm-theme-select {
    border-color: #a6dec0;
    background: #fbfffd;
  }

  .wizard-field.is-success .wizard-field-state,
  .wizard-field.is-success .wizard-input-shell > .wizard-svg-icon {
    color: var(--wizard-green);
  }

  .wizard-field.is-error .ppm-input,
  .wizard-field.is-error .ppm-theme-select {
    border-color: #e88989;
    background: #fffafa;
  }

  .wizard-field.is-error .wizard-field-state,
  .wizard-field.is-error .wizard-input-shell > .wizard-svg-icon,
  .wizard-field.is-error .wizard-field-feedback {
    color: #b91c1c;
  }

  .wizard-field-feedback {
    min-height: 17px;
    color: #64748b;
    font-size: 12px;
    font-weight: 650;
    line-height: 1.35;
  }

  .wizard-check-field {
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid #dfe8f4;
    border-radius: 12px;
    background: #f8fbff;
  }

  .wizard-check-field input {
    width: 20px;
    height: 20px;
    accent-color: var(--wizard-blue);
  }

  .wizard-check-field span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .wizard-check-field strong {
    color: #10203f;
    font-size: 13px;
    font-weight: 850;
  }

  .wizard-check-field small {
    color: #64748b;
    font-size: 12px;
    font-weight: 650;
  }

  .login-message {
    margin: 0;
  }

  .wizard-validation-card {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 13px;
    align-items: start;
    padding: 14px;
    border: 1px solid var(--wizard-warning-border);
    border-radius: 14px;
    color: var(--wizard-warning-text);
    background: var(--wizard-warning-bg);
  }

  .wizard-validation-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: #9a6400;
    background: #ffecc1;
  }

  .wizard-validation-card strong {
    display: block;
    color: #704600;
    font-size: 13.5px;
    font-weight: 850;
    line-height: 1.4;
  }

  .wizard-validation-card ul {
    display: flex;
    flex-wrap: wrap;
    gap: 7px 18px;
    margin: 9px 0 0;
    padding-left: 18px;
  }

  .wizard-validation-card li {
    font-size: 13px;
    font-weight: 750;
    line-height: 1.35;
  }

  .wizard-message {
    padding: 11px 12px;
    border-radius: var(--wizard-radius);
    font-weight: 900;
  }

  .wizard-message.danger {
    color: #991b1b;
    border: 1px solid color-mix(in srgb, var(--danger) 36%, transparent);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }

  .wizard-subsection {
    padding: 14px;
    border: 1px solid #dfe8f4;
    border-radius: var(--wizard-radius);
    background: #f8fbff;
  }

  .wizard-subsection-head {
    display: grid;
    gap: 4px;
  }

  .wizard-subsection-head strong {
    color: #10203f;
    font-size: 17px;
  }

  .wizard-card-selector,
  .wizard-editor-grid,
  .wizard-review-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }

  .wizard-card-selector.compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .wizard-select-card,
  .wizard-editor-card {
    min-width: 0;
    display: grid;
    gap: 10px;
    border: 1px solid #dfe8f4;
    border-radius: var(--wizard-radius);
    padding: 13px;
    background: #ffffff;
    color: #10203f;
    text-align: left;
  }

  .wizard-select-card {
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }

  .wizard-select-card:hover {
    transform: translateY(-1px);
    box-shadow: var(--wizard-soft-shadow);
  }

  .wizard-select-card.active {
    border-color: var(--wizard-blue);
    color: var(--wizard-blue);
    background: var(--wizard-blue-soft);
  }

  .wizard-select-card span,
  .wizard-editor-card span {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .wizard-editor-title {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 10px;
  }

  .wizard-icon-button {
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 10px;
    color: #ffffff;
    background: var(--danger);
    cursor: pointer;
    font-size: 22px;
    font-weight: 900;
    line-height: 1;
  }

  .wizard-icon-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .wizard-add-button {
    justify-self: start;
  }

  .wizard-review-list {
    display: grid;
    gap: 10px;
  }

  .wizard-review-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid #dfe8f4;
  }

  .wizard-review-row strong,
  .wizard-review-grid strong {
    color: var(--wizard-blue);
    overflow-wrap: anywhere;
  }

  .wizard-footer {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 34px 18px;
    border-top: 1px solid #e6edf6;
    border-radius: 0 0 var(--wizard-radius) var(--wizard-radius);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(14px);
    z-index: 2;
  }

  .wizard-footer-left,
  .wizard-footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .onboarding-wizard .ppm-button {
    min-height: 44px;
    border-radius: 10px;
    padding: 10px 18px;
    font-size: 14px;
    letter-spacing: 0;
  }

  .onboarding-wizard .ppm-button.primary {
    color: #ffffff;
    background: linear-gradient(135deg, var(--wizard-blue), #126be0);
    box-shadow: 0 14px 24px rgba(11, 92, 171, 0.24);
  }

  .onboarding-wizard .ppm-button.neutral {
    color: #334155;
    background: #ffffff;
    border: 1px solid #cbd7e6;
    box-shadow: none;
  }

  .onboarding-wizard .ppm-button:hover:not(:disabled) {
    filter: none;
    transform: translateY(-1px);
    box-shadow: 0 12px 22px rgba(15, 23, 42, 0.10);
  }

  /* ── Enterprise Login ───────────────────────────────────────── */
  .login-enterprise-page {
    min-height: 100vh;
    align-content: stretch;
    padding: 20px;
    background: linear-gradient(135deg, #eef6ff 0%, #f8fbff 46%, #fff7ed 100%);
  }

  .enterprise-login-shell {
    width: min(1180px, 100%);
    min-height: calc(100vh - 40px);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(380px, 0.92fr);
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 26px 70px rgba(15, 23, 42, 0.16);
  }

  .enterprise-login-left {
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(220px, 1fr) auto auto;
    gap: 24px;
    padding: clamp(28px, 4vw, 46px);
    color: #ffffff;
    background:
      linear-gradient(145deg, rgba(2, 48, 108, 0.95), rgba(0, 92, 170, 0.94) 58%, rgba(0, 62, 125, 0.98)),
      #063b78;
  }

  .enterprise-login-brand,
  .login-card-header,
  .petrosync-logo,
  .enterprise-login-credit {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .enterprise-login-brand {
    align-items: flex-start;
    justify-content: space-between;
    gap: 28px;
  }

  .petrosync-logo {
    flex: 0 0 auto;
    gap: 12px;
  }

  .petrosync-logo-icon {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 10px;
    background: linear-gradient(145deg, #ffffff, #eff6ff);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16);
  }

  .petrosync-logo.compact .petrosync-logo-icon {
    width: 40px;
    height: 40px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.10);
  }

  .petrosync-logo-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .petrosync-logo-icon.mark-only > span {
    width: 24px;
    height: 28px;
    position: relative;
    display: block;
    border-radius: 12px 12px 8px 8px;
    background: linear-gradient(180deg, #0b5cab 0 50%, #f58220 50% 100%);
  }

  .petrosync-logo-icon.mark-only > span::after {
    content: "";
    position: absolute;
    right: -7px;
    top: 8px;
    width: 8px;
    height: 13px;
    border: 3px solid #0b5cab;
    border-left: 0;
    border-radius: 0 7px 7px 0;
  }

  .petrosync-logo-text {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .petrosync-logo-text strong {
    color: inherit;
    font-size: 21px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .petrosync-logo-text small {
    color: rgba(255, 255, 255, 0.72);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .login-card-header .petrosync-logo-text strong {
    color: #0f172a;
  }

  .enterprise-login-heading {
    max-width: 560px;
    display: grid;
    gap: 10px;
    align-self: end;
    padding-top: 34px;
  }

  .enterprise-login-heading span,
  .login-card-header span,
  .enterprise-login-credit span,
  .login-field span {
    color: inherit;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .enterprise-login-heading span {
    color: rgba(255, 255, 255, 0.72);
  }

  .enterprise-login-heading h1 {
    margin: 0;
    color: #ffffff;
    font-size: clamp(38px, 5vw, 60px);
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0;
  }

  .enterprise-login-heading p {
    max-width: 460px;
    margin: 0;
    color: rgba(255, 255, 255, 0.86);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.45;
  }

  .fuel-station-illustration {
    align-self: center;
    min-height: 260px;
    position: relative;
    display: grid;
    align-items: end;
    padding: 22px 18px 28px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.04)),
      rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .fuel-station-skyline {
    position: absolute;
    inset: 22px 24px auto auto;
    display: flex;
    gap: 8px;
    align-items: end;
  }

  .fuel-station-skyline span {
    width: 34px;
    height: 76px;
    border-radius: 6px 6px 0 0;
    background: rgba(255, 255, 255, 0.10);
  }

  .fuel-station-skyline span:nth-child(2) { height: 116px; }
  .fuel-station-skyline span:nth-child(3) { height: 92px; }

  .fuel-canopy {
    width: min(430px, 92%);
    height: 58px;
    position: relative;
    z-index: 2;
    margin: 0 auto 0;
    border-radius: 12px 12px 8px 8px;
    background: linear-gradient(90deg, #f58220, #ffb15d);
    box-shadow: 0 16px 30px rgba(2, 8, 23, 0.22);
  }

  .fuel-canopy span {
    position: absolute;
    inset: auto 24px -22px;
    height: 22px;
    border-radius: 0 0 10px 10px;
    background: #ffffff;
  }

  .fuel-station-body {
    width: min(400px, 88%);
    min-height: 118px;
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr 76px 76px;
    gap: 16px;
    align-items: end;
    margin: 0 auto;
    padding: 34px 24px 0;
  }

  .fuel-storefront {
    height: 92px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding: 14px;
    border-radius: 10px 10px 6px 6px;
    background: #f8fafc;
    box-shadow: 0 16px 28px rgba(2, 8, 23, 0.18);
  }

  .fuel-storefront span {
    border-radius: 6px;
    background: linear-gradient(180deg, #dbeafe, #93c5fd);
  }

  .fuel-dispenser {
    height: 100px;
    display: grid;
    align-items: start;
    padding: 11px;
    border-radius: 10px 10px 6px 6px;
    background: #ffffff;
    box-shadow: 0 16px 28px rgba(2, 8, 23, 0.18);
  }

  .fuel-dispenser span {
    height: 30px;
    border-radius: 6px;
    background: #0b5cab;
    box-shadow: inset 0 -6px 0 rgba(255, 255, 255, 0.18);
  }

  .fuel-dispenser.secondary span {
    background: #f58220;
  }

  .fuel-forecourt {
    width: min(500px, 96%);
    height: 44px;
    position: relative;
    z-index: 0;
    display: grid;
    gap: 8px;
    margin: -10px auto 0;
    padding: 12px 28px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.26);
  }

  .fuel-forecourt span {
    height: 2px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.24);
  }

  .enterprise-feature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .enterprise-feature-grid span {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.91);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.25;
  }

  .enterprise-feature-grid span::before {
    content: "";
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background:
      linear-gradient(135deg, transparent 44%, #ffffff 45% 55%, transparent 56%),
      #f58220;
    box-shadow: 0 0 0 3px rgba(245, 130, 32, 0.16);
  }

  .enterprise-login-credit {
    justify-content: space-between;
    gap: 16px;
    padding-top: 6px;
    color: rgba(255, 255, 255, 0.72);
  }

  .enterprise-login-credit strong {
    color: #ffffff;
    font-size: 14px;
    font-weight: 800;
    text-align: right;
  }

  .enterprise-login-right {
    min-width: 0;
    display: grid;
    place-items: center;
    padding: clamp(26px, 5vw, 58px);
    background:
      linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.98));
  }

  .login-card.enterprise-login-card {
    width: min(430px, 100%);
    display: grid;
    gap: 20px;
    padding: clamp(26px, 4vw, 36px);
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 20px 48px rgba(15, 23, 42, 0.12);
  }

  .login-card-header {
    align-items: flex-start;
    gap: 14px;
  }

  .login-card-header > div {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  .login-card-header span,
  .login-field span {
    color: #64748b;
  }

  .login-card-header h2 {
    margin: 0;
    color: #0f172a;
    font-size: 28px;
    font-weight: 850;
    line-height: 1.15;
    letter-spacing: 0;
  }

  .login-card-header p {
    margin: 0;
    color: #64748b;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.45;
  }

  .login-field {
    display: grid;
    gap: 7px;
    min-width: 0;
  }

  .login-field input {
    width: 100%;
    min-height: 46px;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 11px 13px;
    color: #0f172a;
    background: #ffffff;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0;
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease, opacity 160ms ease;
  }

  .login-field input::placeholder {
    color: #94a3b8;
    font-weight: 500;
  }

  .login-field input:hover {
    border-color: #94a3b8;
  }

  .login-field input:focus-visible,
  .enterprise-login-button:focus-visible {
    outline: 3px solid rgba(245, 130, 32, 0.32);
    outline-offset: 2px;
  }

  .login-field input:focus {
    border-color: #f58220;
    box-shadow: 0 0 0 4px rgba(245, 130, 32, 0.14);
  }

  .login-field input:disabled {
    color: #94a3b8;
    background: #f8fafc;
    cursor: not-allowed;
    opacity: 0.72;
  }

  .login-field.invalid input {
    border-color: #dc2626;
    background: #fff7f7;
  }

  .login-field small {
    color: #b91c1c;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }

  .enterprise-login-button {
    min-height: 48px;
    border: none;
    border-radius: 10px;
    color: #ffffff;
    background: linear-gradient(135deg, #f58220, #e45f10);
    box-shadow: 0 14px 28px rgba(245, 130, 32, 0.28);
    cursor: pointer;
    font: inherit;
    font-size: 15px;
    font-weight: 850;
    letter-spacing: 0;
    transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease, opacity 160ms ease;
  }

  .enterprise-login-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 18px 34px rgba(245, 130, 32, 0.34);
    filter: saturate(1.05);
  }

  .enterprise-login-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .enterprise-login-button:disabled {
    cursor: not-allowed;
    opacity: 0.56;
    box-shadow: none;
    filter: grayscale(0.2);
  }

  .login-message {
    margin: 0;
    padding: 12px 13px;
    border-radius: 10px;
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.45;
  }

  .login-message.danger {
    color: #991b1b;
    border: 1px solid rgba(220, 38, 38, 0.18);
    background: #fef2f2;
  }

  .login-message.warning {
    color: #92400e;
    border: 1px solid rgba(245, 158, 11, 0.24);
    background: #fffbeb;
  }

  .login-message.info {
    color: #0b5cab;
    border: 1px solid rgba(11, 92, 171, 0.18);
    background: #eff6ff;
  }

  /* ── Wizard Product Grid ────────────────────────────────────── */
  .wizard-product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
  }

  .wizard-product-card {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 72px;
    padding: 14px;
    border: 1px solid #dfe8f4;
    border-radius: 14px;
    background: #ffffff;
    cursor: pointer;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      border-color 160ms ease,
      background 160ms ease;
  }

  .wizard-product-card:hover,
  .wizard-product-card:has(input:checked) {
    border-color: var(--wizard-blue);
    background: var(--wizard-blue-soft);
    box-shadow: var(--wizard-soft-shadow);
  }

  .wizard-product-card:hover {
    transform: translateY(-1px);
  }

  .wizard-product-card input[type="checkbox"] {
    width: 20px;
    height: 20px;
    accent-color: var(--wizard-blue);
  }

  .wizard-product-card strong {
    display: block;
    color: #10203f;
    font-weight: 850;
    line-height: 1.25;
  }

  .wizard-product-card span {
    display: block;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .wizard-custom-product-form {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.35fr) auto;
    gap: 12px;
    align-items: center;
    margin-top: 10px;
  }

  .wizard-custom-product-list {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }

  .wizard-custom-product-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid #dfe8f4;
    border-radius: var(--wizard-radius);
    background: #f8fbff;
  }

  .wizard-custom-product-item strong {
    color: var(--wizard-blue);
  }

  .wizard-btn-remove {
    min-width: 74px;
    min-height: 34px;
    border: 1px solid rgba(220, 38, 38, 0.22);
    border-radius: 9px;
    background: #fff1f1;
    color: #b91c1c;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  }

  .wizard-btn-remove:hover {
    border-color: #dc2626;
    background: #dc2626;
    color: #ffffff;
  }

  .wizard-forecourt-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }

  .wizard-nozzle-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }

  .ppm-btn {
    min-height: 42px;
    padding: 10px 18px;
    border: none;
    border-radius: 10px;
    background: var(--wizard-blue);
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
    transition: all 140ms ease;
  }

  .ppm-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 22px rgba(11, 92, 171, 0.18);
  }

  .ppm-btn-secondary {
    background: var(--wizard-blue-soft);
    color: var(--wizard-blue);
  }

  .ppm-btn-secondary:hover {
    background: #dcecff;
  }

  .wizard-preview-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .wizard-step-body h3 {
    margin: 0 0 12px;
    color: #10203f;
    font-size: 16px;
    font-weight: 850;
  }

  .wizard-step-body > .wizard-transition > h3:not(:first-child) {
    margin-top: 20px;
  }

  .wizard-submit-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    align-content: start;
    gap: 16px;
    padding: 22px;
    background: color-mix(in srgb, var(--surface) 86%, transparent);
    backdrop-filter: blur(2px);
  }

  .ppm-skeleton {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 72%, #94a3b8);
  }

  .ppm-skeleton::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--surface) 82%, #ffffff),
      transparent
    );
    animation: ppmSkeletonShimmer 1.3s ease-in-out infinite;
  }

  .ppm-skeleton-text {
    height: 24px;
    width: 180px;
  }

  .ppm-skeleton-line {
    height: 14px;
    width: 100%;
  }

  .ppm-skeleton-block {
    height: 72px;
    width: 100%;
  }

  .ppm-skeleton-circle {
    border-radius: 999px;
  }

  .ppm-skeleton-card {
    height: 140px;
    width: 100%;
    border-radius: var(--wizard-radius, 12px);
  }

  .ppm-skeleton-input {
    height: 44px;
    width: 100%;
    border-radius: var(--wizard-radius, 12px);
  }

  .ppm-skeleton-button {
    height: 42px;
    width: 120px;
    border-radius: 8px;
  }

  @keyframes ppmSkeletonShimmer {
    100% {
      transform: translateX(100%);
    }
  }

  /* ── Sidebar ─────────────────────────────────────────────── */
  .ppm-sidebar {
    position: sticky;
    top: 0;
    width: 220px;
    min-width: 220px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    color: var(--clr-sidebar-text);
    background: var(--clr-sidebar-bg);
    border-right: 1px solid var(--clr-border);
    overflow: hidden;
    overflow-y: auto;
    transition: width var(--transition-smooth), min-width var(--transition-smooth);
    z-index: 20;
    scrollbar-width: none;
  }

  .ppm-sidebar::-webkit-scrollbar { display: none; }

  .ppm-sidebar.is-collapsed {
    width: 60px;
    min-width: 60px;
  }

  /* Brand row */
  .sidebar-brand-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 14px 12px;
    border-bottom: 1px solid var(--clr-border);
    min-height: 58px;
  }

  .ppm-sidebar.is-collapsed .sidebar-brand-row {
    padding: 16px 10px 12px;
    justify-content: center;
  }

  .sidebar-brand-row h2 {
    margin: 0;
    overflow: hidden;
    color: var(--clr-sidebar-strong);
    font-size: 15px;
    font-weight: 800;
    white-space: nowrap;
    letter-spacing: -0.02em;
  }

  .ppm-sidebar.is-collapsed .sidebar-brand-row h2 { display: none; }

  .sidebar-logo-mark,
  .sidebar-toggle,
  .sidebar-item svg,
  .sidebar-subitem > span,
  .tank-icon-shell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-logo-mark {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-md);
    color: #000;
    background: var(--clr-green);
    flex-shrink: 0;
    box-shadow: 0 0 10px var(--clr-green-glow);
  }

  .sidebar-toggle {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--clr-border2);
    color: var(--clr-sidebar-text);
    background: transparent;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: auto;
    transition: all var(--transition-fast);
  }

  .ppm-sidebar.is-collapsed .sidebar-toggle { margin-left: 0; }

  .sidebar-toggle:hover {
    color: var(--clr-green);
    border-color: var(--clr-green);
  }

  .sidebar-toggle svg,
  .sidebar-logo-mark svg,
  .sidebar-item svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .ppm-sidebar.is-collapsed .sidebar-brand-row h2,
  .ppm-sidebar.is-collapsed .sidebar-user-card,
  .ppm-sidebar.is-collapsed .sidebar-item span,
  .ppm-sidebar.is-collapsed .sidebar-chevron,
  .ppm-sidebar.is-collapsed .sidebar-subitem strong {
    display: none;
  }

  /* User card */
  .sidebar-user-card {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 14px;
    margin: 8px;
    border-radius: var(--radius-md);
    background: var(--clr-card2);
    border: 1px solid var(--clr-border);
  }

  .sidebar-user-card strong,
  .sidebar-user-card span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-user-card strong {
    display: block;
    color: var(--clr-sidebar-strong);
    font-size: 13px;
    font-weight: 700;
  }

  .sidebar-user-card span {
    display: block;
    color: var(--clr-green);
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Navigation */
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px;
    flex: 1;
  }

  .sidebar-section-label {
    padding: 10px 10px 3px;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--clr-sidebar-text);
    opacity: 0.4;
  }

  .ppm-sidebar.is-collapsed .sidebar-section-label { display: none; }

  .sidebar-item,
  .sidebar-subitem {
    width: 100%;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    transition: background var(--transition-fast), color var(--transition-fast);
    text-align: left;
  }

  .sidebar-item {
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    color: var(--clr-sidebar-text);
    background: transparent;
    font-size: 13px;
  }

  .ppm-sidebar.is-collapsed .sidebar-item {
    justify-content: center;
    padding: 10px 8px;
  }

  .sidebar-item span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .sidebar-item:hover {
    color: var(--clr-sidebar-strong);
    background: var(--clr-sidebar-hover);
  }

  .sidebar-item.active {
    color: var(--clr-green);
    background: var(--clr-sidebar-active);
    font-weight: 700;
  }

  .sidebar-item.active svg { color: var(--clr-green); }

  .sidebar-subitem.active {
    color: var(--clr-green);
    background: var(--clr-green-dim);
    font-weight: 700;
  }

  .sidebar-chevron {
    display: inline-flex;
    transform: rotate(0deg);
    transition: transform var(--transition-base);
    opacity: 0.4;
  }

  .sidebar-chevron.open { transform: rotate(90deg); }
  .sidebar-chevron svg { width: 13px; height: 13px; }

  /* Sub-nav */
  .sidebar-subnav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 2px 8px 2px 30px;
  }

  .ppm-sidebar.is-collapsed .sidebar-subnav { padding-left: 8px; }

  .sidebar-subitem {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 5px 10px;
    color: var(--clr-sidebar-text);
    background: transparent;
    font-size: 12.5px;
  }

  .ppm-sidebar.is-collapsed .sidebar-subitem { justify-content: center; }

  .sidebar-subitem > span {
    width: 24px;
    height: 22px;
    border-radius: var(--radius-sm);
    color: var(--clr-green);
    background: var(--clr-green-dim);
    font-size: 10px;
    font-weight: 900;
    flex-shrink: 0;
  }

  .sidebar-subitem:hover {
    color: var(--clr-sidebar-strong);
    background: var(--clr-sidebar-hover);
  }

  .sidebar-subitem strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Logout */
  .sidebar-logout {
    margin-top: auto;
    padding: 8px;
    border-top: 1px solid var(--clr-border);
  }

  .sidebar-logout .sidebar-item { color: #f87171; }
  .sidebar-logout .sidebar-item:hover { background: rgba(239,68,68,0.10); color: #fca5a5; }

  /* ── Headers & Typography ───────────────────────────────── */
  .ppm-header,
  .ppm-card-title,
  .ppm-actions-card,
  .ppm-actions,
  .ppm-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .ppm-header { margin-bottom: 20px; }

  .ops-header {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) auto;
    gap: 16px;
    align-items: stretch;
    margin-bottom: 16px;
    padding: 16px 20px;
    border: 1px solid var(--clr-border2);
    border-radius: var(--radius-lg);
    background: var(--clr-card2);
    box-shadow: var(--shadow-md);
  }

  .ops-brand-block {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    min-width: 0;
  }

  .ops-brand-mark {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--radius-md);
    color: #000;
    background: var(--clr-green);
    font-size: 14px;
    font-weight: 900;
    box-shadow: 0 0 14px var(--clr-green-glow);
  }

  .ops-brand-mark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: transparent;
  }

  .ops-header h1 {
    margin: 0;
    color: var(--clr-text);
    font-size: 22px;
    line-height: 1.14;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .ops-status-cluster {
    display: grid;
    grid-template-columns: repeat(4, minmax(105px, auto));
    gap: 8px;
    align-items: stretch;
  }

  .ops-status-cell {
    min-width: 0;
    display: grid;
    align-content: center;
    gap: 3px;
    padding: 10px 13px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: var(--clr-bg);
    transition: border-color var(--transition-fast);
  }

  .ops-status-cell:hover { border-color: var(--clr-green); }

  .ops-status-cell span,
  .ops-ticker strong,
  .ops-ticker span,
  .dashboard-day-card span,
  .fuel-rail-card span {
    color: var(--clr-muted);
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .ops-status-cell strong,
  .ops-status-cell em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ops-status-cell strong {
    color: var(--clr-text);
    font-size: 13px;
    font-weight: 600;
  }

  .ops-status-cell em {
    color: var(--clr-green);
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
  }

  .ops-status-cell.dsr-state { border-left: 2px solid var(--clr-green); }
  .ops-status-cell.dsr-state.warning {
    border-left-color: var(--clr-amber);
    background: var(--clr-amber-dim);
  }

  .ops-header-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  /* ── Status Ticker ───────────────────────────────────────── */
  .ops-ticker {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    margin-bottom: 18px;
    padding: 8px 14px;
    border: 1px solid color-mix(in srgb, var(--clr-green) 22%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--clr-green) 7%, transparent);
  }

  .ops-ticker strong {
    color: var(--clr-green);
    opacity: 1;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .ops-ticker > div {
    display: flex;
    min-width: 0;
    gap: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .ops-ticker > div::-webkit-scrollbar { display: none; }

  .ops-ticker span {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 12px;
    border-right: 1px solid var(--clr-border);
    color: var(--clr-muted);
    font-size: 12px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }

  /* ── Typography Primitives ──────────────────────────────── */
  .ppm-kicker {
    margin: 0 0 4px;
    color: var(--clr-green);
    font-weight: 700;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.07em;
  }

  .ppm-header h1, .ppm-card h2, .ppm-welcome-card h2 { margin: 0; }

  .ppm-header h1 {
    color: var(--clr-text);
    font-size: 26px;
    line-height: 1.1;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .ppm-muted, .ppm-card-title span {
    margin: 4px 0 0;
    color: var(--clr-muted);
    font-weight: 500;
    font-size: 13px;
  }

  /* ── Inputs & Selects ────────────────────────────────────── */
  .ppm-theme-select,
  .ppm-input {
    border: 1px solid var(--clr-border2);
    background: var(--clr-bg2);
    color: var(--clr-text);
    border-radius: var(--radius-md);
    outline: none;
    font-size: 13.5px;
    font-family: inherit;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .ppm-theme-select {
    min-width: 190px;
    padding: 9px 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .ppm-input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 12px;
  }

  .ppm-input:hover, .ppm-theme-select:hover { border-color: var(--clr-green); }
  .ppm-input:focus, .ppm-theme-select:focus, .ppm-input:focus-visible, .ppm-theme-select:focus-visible {
    border-color: var(--clr-green);
    box-shadow: 0 0 0 3px var(--clr-green-dim);
    outline: none;
  }

  .ppm-input,
  .ppm-theme-select,
  .ppm-action-menu summary,
  .ppm-action-menu > div {
    background: var(--clr-bg2);
    color: var(--clr-text);
  }

  /* ── Cards ──────────────────────────────────────────────── */
  .ppm-card,
  .ppm-welcome-card,
  .ppm-stat,
  .ppm-total-row {
    background: var(--clr-card);
    color: var(--clr-text);
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
  }

  .ppm-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    margin-bottom: 16px;
  }

  .ppm-card h2 {
    color: var(--clr-text);
    font-size: 16px;
    line-height: 1.3;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .ppm-welcome-card {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    padding: 20px;
  }

  .ppm-welcome-card div, .ppm-stat {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ppm-welcome-card span, .ppm-stat span {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--clr-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ppm-welcome-card strong, .ppm-stat strong {
    font-size: 20px;
    font-weight: 800;
    color: var(--clr-text);
    letter-spacing: -0.02em;
  }

  /* ── Grid systems ──────────────────────────────────────── */
  .ppm-summary-grid,
  .ppm-product-grid,
  .ppm-field-grid,
  .ppm-money-grid,
  .ppm-closing-grid,
  .ppm-date-range-grid,
  .ppm-print-grid {
    display: grid;
    gap: 14px;
  }

  .ppm-summary-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 18px;
  }

  .ppm-top-grid,
  .ppm-money-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.8fr) minmax(320px, 1.2fr);
    gap: 16px;
    margin-bottom: 18px;
  }

  .ppm-product-grid {
    grid-template-columns: repeat(2, minmax(280px, 1fr));
    margin-bottom: 18px;
  }

  .ppm-field-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .automation-form-grid,
  .fuel-price-grid,
  .automation-mapping-grid,
  .automation-map-list,
  .automation-map-row {
    display: grid;
    gap: 14px;
  }

  .automation-form-grid,
  .fuel-price-grid {
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }

  .automation-form-grid label,
  .fuel-price-grid label,
  .automation-map-row label {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .automation-form-grid span,
  .fuel-price-grid span,
  .automation-map-row span,
  .automation-toggle span {
    color: var(--clr-text);
    opacity: 0.58;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .fuel-price-grid em {
    color: var(--clr-text);
    opacity: 0.65;
    font-style: normal;
    font-weight: 700;
    font-size: 12px;
  }

  .automation-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
  }

  .automation-toggle input {
    width: 18px;
    height: 18px;
    accent-color: var(--clr-green);
  }

  .automation-mapping-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .automation-panel {
    min-width: 0;
  }

  .automation-map-row {
    grid-template-columns: minmax(120px, 0.9fr) minmax(140px, 1fr) minmax(150px, 1fr) minmax(100px, 0.7fr) minmax(100px, auto);
    align-items: end;
    padding: 14px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: rgba(255,255,255,0.03);
    overflow: hidden;
  }

  .automation-message {
    border-color: color-mix(in srgb, var(--clr-green) 28%, transparent);
    background: color-mix(in srgb, var(--clr-green) 8%, transparent);
    font-weight: 700;
  }

  .ppm-summary-grid.compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 0;
  }

  /* ── Fuel Closing Cards ──────────────────────────────────── */
  .fuel-closing-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .fuel-closing-card {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-lg);
    background: var(--clr-card2);
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--transition-base);
  }

  .fuel-closing-card:hover {
    box-shadow: var(--shadow-md);
  }

  .fuel-closing-card h3 {
    margin: 0;
    color: var(--clr-green);
    font-size: 16px;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .fuel-closing-card div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    min-width: 0;
    padding-top: 8px;
    border-top: 1px solid rgba(148, 163, 184, 0.13);
  }

  .fuel-closing-card span {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .fuel-closing-card strong {
    min-width: 0;
    color: var(--clr-text);
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dsr-date-picker {
    width: 190px;
    box-shadow: var(--shadow-xs);
  }

  .ppm-closing-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ppm-date-range-grid {
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }

  .ppm-date-range-grid label {
    display: grid;
    gap: 6px;
  }

  .ppm-date-range-grid span {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ppm-print-grid {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }

  .ppm-stat,
  .ppm-total-row {
    padding: 16px;
  }

  .ppm-stat.primary {
    border-color: color-mix(in srgb, var(--clr-green) 30%, transparent);
    background: color-mix(in srgb, var(--clr-green) 8%, transparent);
  }

  .ppm-stat.success {
    border-color: color-mix(in srgb, var(--clr-green) 25%, transparent);
    background: color-mix(in srgb, var(--clr-green) 7%, transparent);
  }

  .ppm-total-row {
    font-weight: 700;
  }

  .ppm-total-row strong {
    color: var(--clr-green);
  }

  /* ── Tables ──────────────────────────────────────────────── */
  .ppm-table-scroll {
    overflow-x: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--clr-border);
  }

  .ppm-table {
    width: 100%;
    min-width: 820px;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 13.5px;
  }

  .ppm-table th,
  .ppm-table td {
    border-bottom: 1px solid var(--clr-border);
    padding: 11px 12px;
    text-align: right;
    vertical-align: middle;
  }

  .ppm-table th:first-child,
  .ppm-table td:first-child {
    text-align: left;
    font-weight: 700;
  }

  .ppm-table th {
    background: var(--clr-bg);
    color: var(--clr-muted);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ppm-table tr:last-child td {
    border-bottom: none;
  }

  .ppm-grand-total-row td {
    background: color-mix(in srgb, var(--clr-green) 8%, transparent);
    color: var(--clr-text);
    font-weight: 800;
  }

  .ppm-grand-total-row td:last-child {
    color: var(--clr-green);
    font-size: 15px;
  }

  /* ── Buttons ────────────────────────────────────────────── */
  .ppm-button {
    border: none;
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 700;
    border-radius: var(--radius-md);
    cursor: pointer;
    color: var(--clr-text);
    min-height: 38px;
    line-height: 1.2;
    white-space: nowrap;
    font-family: inherit;
    letter-spacing: 0.01em;
    transition: filter var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
  }

  .ppm-button.primary {
    background: var(--clr-green);
    color: #000000;
    font-weight: 800;
    box-shadow: 0 0 14px var(--clr-green-glow);
  }

  .ppm-button.secondary {
    background: var(--clr-card2);
    color: var(--clr-text);
    border: 1px solid var(--clr-border2);
    box-shadow: none;
  }

  .ppm-button.danger {
    background: rgba(239,68,68,0.15);
    color: #f87171;
    border: 1px solid rgba(239,68,68,0.30);
  }

  .ppm-button.neutral {
    background: var(--clr-card2);
    color: var(--clr-muted);
    border: 1px solid var(--clr-border);
  }

  .ppm-button:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .ppm-button:active { transform: translateY(0); }

  .ppm-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    filter: none;
  }

  .ppm-button:focus-visible,
  .ppm-menu-button:focus-visible,
  .ppm-input:focus-visible,
  .ppm-theme-select:focus-visible,
  .ppm-action-menu summary:focus-visible {
    outline: 2px solid var(--clr-green);
    outline-offset: 2px;
  }

  .ppm-action-strip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .icon-action-button {
    width: 38px;
    min-width: 38px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-action-button svg { width: 16px; height: 16px; }

  /* ── State pills ─────────────────────────────────────────── */
  .save-state-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .save-state-pill.saved {
    color: var(--clr-green);
    background: var(--clr-green-dim);
    border: 1px solid color-mix(in srgb, var(--clr-green) 25%, transparent);
  }

  .save-state-pill.unsaved,
  .save-state-pill.saving {
    color: var(--clr-amber);
    background: var(--clr-amber-dim);
    border: 1px solid rgba(245,158,11,0.28);
  }

  .save-state-pill.failed {
    color: var(--clr-red);
    background: var(--clr-red-dim);
    border: 1px solid rgba(239,68,68,0.28);
  }

  /* ── Workflow modal ──────────────────────────────────────── */
  .workflow-modal {
    max-width: 520px;
  }

  .workflow-message {
    white-space: pre-line;
  }

  /* ── Dropdown menu ───────────────────────────────────────── */
  .ppm-action-menu {
    position: relative;
  }

  .ppm-action-menu summary {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--clr-border2);
    padding: 0 16px;
    background: var(--clr-card);
    color: var(--clr-text);
    cursor: pointer;
    font-weight: 700;
    font-family: inherit;
    font-size: 13.5px;
    list-style: none;
    box-shadow: var(--shadow-xs);
    transition: border-color var(--transition-fast);
  }

  .ppm-action-menu summary::-webkit-details-marker {
    display: none;
  }

  .ppm-action-menu[open] summary {
    border-color: var(--clr-green);
  }

  .ppm-action-menu > div {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 10;
    display: grid;
    gap: 4px;
    min-width: 210px;
    padding: 8px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: var(--clr-card);
    box-shadow: var(--shadow-xl);
  }

  .ppm-menu-button {
    width: 100%;
    border: none;
    border-radius: var(--radius-sm);
    padding: 9px 12px;
    background: transparent;
    color: var(--clr-text);
    cursor: pointer;
    font: inherit;
    font-size: 13.5px;
    font-weight: 700;
    text-align: left;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .ppm-menu-button:hover {
    color: var(--clr-green);
    background: color-mix(in srgb, var(--clr-green) 8%, transparent);
  }

  /* ── Dashboard Command Panel ─────────────────────────────── */
  .dashboard-command-panel {
    display: grid;
    grid-template-columns: minmax(240px, 0.75fr) minmax(0, 1.25fr);
    gap: 14px;
    margin-bottom: 20px;
  }

  .dashboard-day-card,
  .console-action-button {
    border: 1px solid var(--clr-border2);
    border-radius: var(--radius-lg);
    background: var(--clr-card);
    color: var(--clr-text);
    box-shadow: var(--shadow-sm);
  }

  .dashboard-day-card {
    display: grid;
    align-content: center;
    gap: 8px;
    padding: 20px;
    background: linear-gradient(135deg, var(--clr-card), color-mix(in srgb, var(--clr-green) 6%, var(--clr-card)));
  }

  .dashboard-day-card strong {
    color: var(--clr-text);
    font-size: 22px;
    line-height: 1.12;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .dashboard-day-card em {
    color: var(--clr-text);
    opacity: 0.6;
    font-style: normal;
    font-weight: 600;
    font-size: 12.5px;
  }

  .dashboard-command-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .console-action-button {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-height: 88px;
    padding: 16px;
    text-align: left;
    cursor: pointer;
    font: inherit;
    transition: border-color var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base);
  }

  .console-action-button:hover,
  .console-action-button:focus-visible {
    border-color: var(--clr-green);
    box-shadow: var(--shadow-lg);
    transform: translateY(-2px);
    outline: none;
  }

  .console-action-button span {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    color: #ffffff;
    background: var(--clr-green-dim);
    color: var(--clr-green);
    font-size: 11px;
    font-weight: 900;
    box-shadow: none;
  }

  .console-action-button strong {
    min-width: 0;
    color: var(--clr-text);
    font-size: 14px;
    line-height: 1.3;
    font-weight: 700;
  }

  /* ── KPI Grids ───────────────────────────────────────────── */
  .dashboard-kpi-grid,
  .dashboard-section-grid,
  .report-product-grid,
  .product-mini-grid {
    display: grid;
    gap: 14px;
  }

  .dashboard-kpi-grid {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    margin-bottom: 20px;
    align-items: stretch;
  }

  .erp-kpi-grid {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .dashboard-section-grid {
    grid-template-columns: 0.9fr 1.1fr;
    align-items: stretch;
    margin-bottom: 16px;
  }

  .dashboard-section-grid > .ppm-card {
    height: 100%;
    min-height: 100%;
    margin-bottom: 0;
  }

  .reports-dashboard-grid,
  .reports-chart-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    align-items: stretch;
  }

  .sales-chart-card {
    min-width: 0;
    min-height: 320px;
    height: 100%;
  }

  .sales-chart-bars {
    grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  }

  .sales-chart-bar-cell {
    min-width: 0;
  }

  .sales-chart-bar-cell strong,
  .sales-chart-bar-cell span,
  .sales-chart-bar-cell em,
  .sales-chart-bar-cell small {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .report-filter-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .report-product-grid {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    align-items: stretch;
  }

  .report-mini-card {
    min-width: 0;
    min-height: 190px;
  }

  .product-mini-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    align-items: stretch;
  }

  .product-mini-grid > div {
    min-width: 0;
    min-height: 118px;
    display: grid;
    align-content: space-between;
  }

  .product-mini-grid strong,
  .product-mini-grid em {
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
    line-height: 1.18;
  }

  /* ── Modals ──────────────────────────────────────────────── */
  .ppm-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0,0,0,0.70);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .ppm-modal {
    width: min(960px, 100%);
    max-height: min(84vh, 800px);
    display: grid;
    gap: 16px;
    overflow-y: auto;
    padding: 24px;
    border: 1px solid var(--clr-border2);
    border-radius: var(--radius-xl);
    background: var(--clr-card2);
    color: var(--clr-text);
    box-shadow: var(--shadow-xl);
    scrollbar-width: thin;
  }

  /* ── History Tables ──────────────────────────────────────── */
  .monthly-history-list,
  .product-history-list,
  .monthly-history-records,
  .reports-history-list {
    display: grid;
    gap: 10px;
  }

  .history-table {
    --history-columns: 1fr;
  }

  .history-table-head,
  .history-table-row {
    display: grid;
    grid-template-columns: var(--history-columns);
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .history-table-head {
    padding: 0 14px;
  }

  .history-table-head span {
    color: var(--clr-text);
    opacity: 0.52;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .history-table-head.compact {
    padding: 0;
  }

  .history-table-row {
    padding: 12px 14px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: rgba(255,255,255,0.02);
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .history-table-row:hover {
    background: color-mix(in srgb, var(--clr-green) 5%, var(--clr-card));
    border-color: color-mix(in srgb, var(--clr-green) 22%, transparent);
  }

  .history-table-row strong,
  .history-table-row span,
  .history-table-row em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-table-row strong {
    color: var(--clr-green);
    font-weight: 700;
  }

  .history-table-row span,
  .history-table-row em {
    color: var(--clr-text);
    font-size: 13px;
    font-style: normal;
    font-weight: 600;
  }

  .history-product-cell {
    display: grid;
    gap: 3px;
  }

  .history-product-cell em {
    opacity: 0.62;
    font-size: 11.5px;
  }

  .history-table-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
  }

  .monthly-history-card,
  .product-history-row,
  .reports-history-row {
    min-width: 0;
  }

  .monthly-history-head > div {
    min-width: 0;
  }

  .monthly-history-head h3,
  .monthly-history-head strong {
    margin: 0;
    min-width: 0;
    color: var(--clr-green);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .monthly-history-head span,
  .monthly-history-products span {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .monthly-history-actions,
  .product-history-actions,
  .reports-history-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
  }

  .monthly-history-products {
    display: grid;
    grid-template-columns: repeat(4, minmax(120px, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  .monthly-history-products div {
    display: grid;
    gap: 5px;
    min-width: 0;
    min-height: 78px;
    align-content: space-between;
    padding: 12px;
    border-radius: var(--radius-md);
    background: var(--clr-bg2);
  }

  .monthly-history-products strong,
  .monthly-history-products em,
  .monthly-history-record-row em {
    min-width: 0;
    color: var(--clr-text);
    font-style: normal;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .monthly-history-products strong {
    color: var(--clr-green);
  }

  .monthly-history-records {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--clr-border);
  }

  .monthly-history-record-row {
    padding: 10px 12px;
    border-radius: var(--radius-md);
    background: var(--clr-bg2);
    border: 1px solid var(--clr-border);
  }

  /* ── Dashboard KPI Cards ─────────────────────────────────── */
  .dashboard-kpi {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 10px;
    min-width: 0;
    min-height: 132px;
    padding: 18px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-lg);
    background: var(--clr-card);
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--transition-base), transform var(--transition-base);
  }

  .dashboard-kpi:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .dashboard-kpi em {
    min-width: 0;
    color: var(--clr-text);
    opacity: 0.58;
    font-style: normal;
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .dashboard-kpi strong {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.15;
  }

  /* ── Status Banners ──────────────────────────────────────── */
  .ppm-status-banner {
    margin-bottom: 18px;
    padding: 12px 16px;
    border: 1px solid color-mix(in srgb, var(--clr-green) 26%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--clr-green) 8%, transparent);
    color: var(--clr-text);
    font-weight: 700;
    font-size: 13.5px;
  }

  /* ── Backup & Restore Page ───────────────────────────────── */
  .backup-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    margin-bottom: 20px;
  }

  .backup-status-grid,
  .backup-form-grid,
  .backup-dr-grid {
    display: grid;
    gap: 12px;
  }

  .backup-status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .backup-status-grid > div,
  .backup-dr-grid > div {
    min-width: 0;
    padding: 14px;
    border-radius: var(--radius-md);
    background: var(--clr-bg2);
    border: 1px solid var(--clr-border);
  }

  .backup-status-grid span,
  .backup-form-grid span,
  .backup-history-head span {
    color: var(--clr-text);
    opacity: 0.52;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .backup-status-grid strong,
  .backup-history-row strong {
    color: var(--clr-green);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }

  .backup-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 12px;
  }

  .backup-form-grid label {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .ppm-danger-note {
    margin: 0;
    padding: 11px 14px;
    border: 1px solid rgba(185, 28, 28, 0.22);
    border-radius: var(--radius-md);
    background: rgba(185, 28, 28, 0.06);
    color: #991b1b;
    font-weight: 700;
    font-size: 13px;
  }

  .backup-history-table {
    display: grid;
    gap: 8px;
  }

  .backup-history-head,
  .backup-history-row {
    display: grid;
    grid-template-columns: minmax(110px, 0.9fr) minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(80px, 0.6fr) minmax(170px, 1.2fr) minmax(80px, 0.6fr) minmax(230px, auto);
    align-items: center;
    gap: 10px;
  }

  .backup-history-head {
    padding: 0 14px;
  }

  .backup-history-row {
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: rgba(255,255,255,0.02);
    transition: background var(--transition-fast);
  }

  .backup-history-row:hover {
    background: color-mix(in srgb, var(--clr-green) 4%, var(--clr-card));
  }

  .backup-history-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 13px;
  }

  .backup-history-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
  }

  .backup-dr-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .backup-dr-grid strong,
  .backup-dr-grid p {
    margin: 0;
  }

  .backup-dr-grid p {
    margin-top: 6px;
    color: var(--clr-text);
    opacity: 0.68;
    font-weight: 500;
    line-height: 1.5;
    font-size: 13px;
  }

  /* ── Tab Systems ──────────────────────────────────────────── */
  .enterprise-tabs {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    margin-bottom: 16px;
    padding: 5px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-lg);
    background: var(--clr-card2);
    box-shadow: var(--shadow-xs);
  }

  .configuration-tabs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 18px;
    position: sticky;
    top: 0;
    z-index: 20;
    padding: 5px;
    overflow-x: auto;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-lg);
    background: var(--clr-card2);
    box-shadow: var(--shadow-sm);
  }

  .configuration-tabs button,
  .enterprise-tabs button {
    flex: 1 1 126px;
    min-width: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 9px 16px;
    background: transparent;
    color: var(--clr-text);
    cursor: pointer;
    font: inherit;
    font-size: 13.5px;
    font-weight: 700;
    white-space: normal;
    line-height: 1.18;
    transition: all var(--transition-fast);
    opacity: 0.7;
  }

  .configuration-tabs button:hover,
  .enterprise-tabs button:hover {
    opacity: 0.9;
    background: color-mix(in srgb, var(--clr-green) 8%, var(--clr-card));
  }

  .configuration-tabs button.active,
  .enterprise-tabs button.active {
    opacity: 1;
    border-color: color-mix(in srgb, var(--clr-green) 45%, var(--clr-border));
    color: var(--clr-text);
    background: var(--clr-card);
    box-shadow: inset 0 -3px 0 var(--clr-green), var(--shadow-xs);
  }

  .configuration-tab-panel > .ppm-main {
    padding: 0;
    overflow: visible;
  }

  .configuration-tab-panel > .ppm-main > .ppm-header {
    margin-top: 4px;
  }

  .configuration-tab-panel {
    display: grid;
    gap: 16px;
  }

  .dsr-tab-panel,
  .reports-tab-panel {
    animation: ppm-tab-fade 180ms ease;
  }

  .dsr-tab-content {
    min-width: 0;
  }

  .operation-dashboard-card .dashboard-kpi-grid {
    margin-bottom: 14px;
  }

  .dashboard-product-kpis {
    margin-top: 2px;
  }

  .user-danger-card {
    border-color: color-mix(in srgb, var(--clr-red) 22%, var(--clr-border));
  }

  .delete-user-notice,
  .delete-user-impact {
    display: grid;
    gap: 6px;
    padding: 13px 14px;
    border: 1px solid rgba(239, 68, 68, 0.28);
    border-radius: var(--radius-md);
    background: rgba(239, 68, 68, 0.10);
    color: var(--clr-text);
  }

  .delete-user-notice strong,
  .delete-user-impact strong {
    color: var(--clr-red);
    font-weight: 850;
  }

  .delete-user-notice span,
  .delete-user-impact p {
    margin: 0;
    color: var(--clr-text);
    opacity: 0.78;
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.5;
  }

  .delete-user-dialog {
    width: min(560px, 100%);
    position: relative;
  }

  .delete-user-warning {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #ffffff;
    background: var(--clr-red);
    box-shadow: 0 0 0 8px var(--clr-red-dim);
    font-size: 26px;
    font-weight: 900;
  }

  .delete-user-confirm-field {
    display: grid;
    gap: 8px;
  }

  .delete-user-confirm-field span {
    color: var(--clr-text);
    opacity: 0.7;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── Enterprise Section ──────────────────────────────────── */
  .enterprise-kpi-grid,
  .enterprise-panel-grid,
  .enterprise-report-grid {
    display: grid;
    gap: 16px;
  }

  .enterprise-kpi-grid {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    margin-bottom: 20px;
    align-items: stretch;
  }

  .enterprise-kpi {
    gap: 8px;
    min-width: 0;
    min-height: 112px;
  }

  .enterprise-kpi span,
  .enterprise-form-grid span,
  .enterprise-row span,
  .enterprise-report-card span {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .enterprise-kpi strong {
    color: var(--clr-green);
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
    line-height: 1.15;
  }

  .enterprise-panel-grid {
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  }

  .enterprise-widget {
    min-width: 0;
  }

  .enterprise-form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .enterprise-form-grid label {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .enterprise-table {
    display: grid;
    gap: 8px;
    margin-top: 12px;
    min-width: 0;
  }

  .enterprise-row,
  .enterprise-list-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: var(--clr-bg2);
  }

  .enterprise-row > div,
  .enterprise-list-row > div {
    min-width: 0;
  }

  .enterprise-row strong,
  .enterprise-list-row strong,
  .enterprise-row em,
  .enterprise-list-row em,
  .enterprise-report-card strong {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.18;
  }

  .enterprise-row-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
  }

  .enterprise-report-grid {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    align-items: stretch;
  }

  .enterprise-report-card {
    min-width: 0;
    min-height: 150px;
  }

  .ppm-loading-state span {
    width: 26px;
    height: 26px;
    border: 2.5px solid var(--clr-border2);
    border-top-color: var(--clr-green);
    border-radius: var(--radius-pill);
    animation: ppm-spin 800ms linear infinite;
  }

  .ppm-empty-state span {
    color: var(--clr-muted);
    opacity: 0.58;
    font-weight: 600;
    font-size: 13px;
  }

  .ppm-empty-state.compact {
    min-height: 80px;
  }

  @keyframes ppm-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes ppm-tab-fade {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Tank Capacity Cards ─────────────────────────────────── */
  .monthly-fuel-grid,
  .tank-capacity-grid-layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    align-items: stretch;
  }

  .monthly-fuel-card,
  .tank-capacity-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100%;
    padding: 18px;
    color: var(--clr-text);
    background: var(--clr-card);
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--transition-base), transform var(--transition-base);
  }

  .monthly-fuel-card:hover,
  .tank-capacity-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .monthly-fuel-head,
  .tank-capacity-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .monthly-fuel-head h3,
  .tank-capacity-head h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--clr-text);
    letter-spacing: -0.01em;
  }

  .monthly-fuel-head span,
  .tank-capacity-head span {
    display: block;
    margin-top: 4px;
    color: var(--clr-text);
    opacity: 0.58;
    font-size: 11.5px;
    font-weight: 700;
  }

  .tank-icon-shell {
    width: 46px;
    height: 46px;
    flex: 0 0 46px;
    color: var(--clr-green);
    background: color-mix(in srgb, var(--clr-green) 12%, transparent);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 6px color-mix(in srgb, var(--clr-green) 15%, transparent);
  }

  .tank-icon {
    width: 32px;
    height: 26px;
  }

  .monthly-fuel-metrics,
  .tank-capacity-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .monthly-fuel-metrics div,
  .tank-capacity-grid div {
    display: grid;
    gap: 5px;
    padding: 11px;
    border-radius: var(--radius-md);
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
  }

  .monthly-fuel-metrics span,
  .tank-capacity-grid span,
  .monthly-capacity-panel span {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .monthly-fuel-metrics strong,
  .tank-capacity-grid strong {
    color: var(--clr-text);
    font-size: 14.5px;
    font-weight: 700;
  }

  .monthly-capacity-panel {
    margin-top: auto;
    display: grid;
    gap: 5px;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--clr-green) 28%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--clr-green) 8%, transparent);
  }

  .monthly-capacity-panel strong {
    color: var(--clr-green);
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .monthly-capacity-panel em {
    color: var(--clr-text);
    opacity: 0.7;
    font-style: normal;
    font-weight: 600;
    font-size: 13px;
  }

  .tank-capacity-meter {
    height: 8px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--clr-border);
  }

  .tank-capacity-meter div {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #1e40af, var(--clr-green));
    transition: width 0.6s ease;
  }

  .tank-capacity-card.compact {
    box-shadow: none;
  }

  .tank-capacity-card.compact .tank-capacity-grid {
    grid-template-columns: 1fr;
  }

  .tank-capacity-percent strong {
    color: var(--clr-green);
  }

  /* ── Products Page ───────────────────────────────────────── */
  .report-mini-card {
    justify-content: space-between;
  }

  .products-page {
    padding-top: 22px;
  }

  .products-header {
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .product-toolbar {
    display: flex;
    align-items: stretch;
    gap: 10px;
  }

  .product-date-card {
    display: grid;
    gap: 5px;
    min-width: 180px;
    padding: 10px 12px;
    background: var(--clr-card);
    border: 1.5px solid var(--clr-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-xs);
  }

  .product-date-card span,
  .fuel-meta-grid span,
  .nozzle-input-grid label span,
  .tank-entry-grid label span,
  .fuel-total-panel span {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .shift-summary-strip {
    display: grid;
    grid-template-columns: 1fr 1fr 0.7fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .shift-summary-strip .ppm-stat {
    min-height: auto;
    padding: 12px 16px;
  }

  .fuel-product-tabs {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    margin-bottom: 16px;
    padding: 5px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-lg);
    background: var(--clr-card2);
    box-shadow: var(--shadow-xs);
    scrollbar-width: none;
  }

  .fuel-product-tabs::-webkit-scrollbar { display: none; }

  .fuel-product-tabs button {
    flex: 0 0 auto;
    min-height: 36px;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 7px 14px;
    color: var(--clr-text);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    opacity: 0.7;
    transition: all var(--transition-fast);
  }

  .fuel-product-tabs button.active,
  .fuel-product-tabs button:hover {
    opacity: 1;
    color: var(--clr-text);
    background: var(--clr-card);
    border-color: color-mix(in srgb, var(--clr-green) 45%, var(--clr-border));
    box-shadow: inset 0 -3px 0 var(--clr-green), var(--shadow-xs);
    outline: none;
  }

  /* ── Fuel Workbench ──────────────────────────────────────── */
  .fuel-workbench-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 270px;
    gap: 16px;
    align-items: start;
  }

  .fuel-workbench-main {
    display: grid;
    grid-template-columns: repeat(2, minmax(360px, 1fr));
    gap: 14px;
    align-items: stretch;
    min-width: 0;
  }

  .fuel-workbench-rail {
    position: sticky;
    top: 18px;
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .fuel-rail-card {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: var(--clr-card);
    color: var(--clr-text);
    box-shadow: var(--shadow-xs);
  }

  .fuel-rail-card strong {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--clr-text);
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .fuel-rail-card.total {
    border-color: color-mix(in srgb, var(--clr-green) 22%, transparent);
    background: color-mix(in srgb, var(--clr-green) 7%, transparent);
  }

  .fuel-rail-card.total strong {
    color: var(--clr-green);
    font-size: 24px;
  }

  .fuel-rail-card em {
    color: var(--clr-text);
    opacity: 0.65;
    font-style: normal;
    font-weight: 600;
    font-size: 13px;
  }

  .fuel-rail-actions {
    display: grid;
    gap: 8px;
  }

  .fuel-rail-actions .ppm-button { width: 100%; }

  .fuel-dashboard-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(360px, 1fr));
    gap: 14px;
    align-items: stretch;
  }

  /* ── Fuel Product Cards ──────────────────────────────────── */
  .fuel-product-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100%;
    padding: 18px;
    background: var(--clr-card2);
    color: var(--clr-text);
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--transition-base);
  }

  .fuel-product-card:hover { box-shadow: var(--shadow-md); }

  .fuel-card-head,
  .nozzle-card-head,
  .fuel-total-panel {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .fuel-card-head h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .fuel-card-head p {
    margin: 3px 0 0;
    opacity: 0.6;
    font-weight: 500;
    font-size: 13px;
  }

  .fuel-rate-pill {
    white-space: nowrap;
    border-radius: var(--radius-pill);
    padding: 6px 12px;
    color: var(--clr-text);
    background: color-mix(in srgb, var(--clr-green) 12%, var(--clr-card));
    font-size: 12.5px;
    font-weight: 800;
    box-shadow: 0 3px 8px color-mix(in srgb, var(--clr-green) 30%, transparent);
  }

  .fuel-meta-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .fuel-meta-grid div,
  .nozzle-card,
  .fuel-total-panel,
  .tank-entry-grid label {
    background: rgba(148, 163, 184, 0.05);
    border: 1px solid rgba(148, 163, 184, 0.13);
    border-radius: var(--radius-md);
  }

  .fuel-meta-grid div {
    display: grid;
    gap: 5px;
    padding: 10px;
    min-width: 0;
  }

  .fuel-meta-grid strong {
    overflow-wrap: anywhere;
    font-size: 14px;
    font-weight: 700;
  }

  .nozzle-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 10px;
  }

  .nozzle-card {
    display: grid;
    gap: 9px;
    padding: 12px;
  }

  .nozzle-card-head strong {
    font-size: 14px;
    font-weight: 700;
  }

  .nozzle-card-head span {
    color: var(--clr-green);
    font-weight: 800;
  }

  .nozzle-input-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }

  .nozzle-input-grid label,
  .tank-entry-grid label {
    display: grid;
    gap: 5px;
  }

  .ppm-compact-input {
    height: 34px;
    padding: 6px 8px;
    font-weight: 700;
  }

  .tank-entry-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
  }

  .tank-entry-grid label { padding: 9px; }

  .fuel-total-panel {
    margin-top: auto;
    padding: 13px;
    background: color-mix(in srgb, var(--clr-green) 5%, var(--clr-card));
    border-color: color-mix(in srgb, var(--clr-green) 20%, transparent);
  }

  .fuel-total-panel div { display: grid; gap: 4px; }

  .fuel-total-panel strong {
    color: var(--clr-green);
    font-size: 15px;
    font-weight: 800;
  }

  .product-summary-card { margin-top: 14px; }

  /* ── Product Selection Cards ─────────────────────────────── */
  .product-selection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 20px;
    align-items: stretch;
  }

  .product-selection-card {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 18px;
    min-height: 100%;
    padding: 24px;
    text-align: left;
    color: var(--clr-text);
    background: var(--clr-card2);
    border: 1.5px solid var(--clr-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-md);
    cursor: pointer;
    font: inherit;
    min-width: 0;
    transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base);
  }

  .product-selection-card:hover,
  .product-selection-card:focus-visible {
    border-color: var(--clr-green);
    box-shadow: var(--shadow-lg);
    transform: translateY(-2px);
  }

  .product-selection-card:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--clr-green) 40%, transparent);
    outline-offset: 2px;
  }

  .product-selection-head,
  .product-selection-metrics,
  .product-selection-metric-row {
    display: grid;
    gap: 16px;
  }

  .product-selection-head {
    grid-template-columns: minmax(110px, 0.8fr) minmax(160px, 1.4fr) minmax(96px, auto);
    align-items: start;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--clr-border);
  }

  .product-selection-head span,
  .product-selection-metrics span,
  .product-fill-label span,
  .ppm-breadcrumb {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .product-selection-head > div { min-width: 0; }

  .product-selection-head h2 {
    display: block;
    margin: 0;
    color: var(--clr-text);
    font-size: clamp(20px, 2vw, 28px);
    font-weight: 800;
    line-height: 1.12;
    white-space: normal;
    overflow-wrap: anywhere;
    letter-spacing: -0.03em;
  }

  .product-selection-head p {
    margin: 5px 0 0;
    opacity: 0.65;
    font-weight: 500;
    font-size: 13px;
    line-height: 1.3;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .product-selection-head strong {
    display: inline-flex;
    justify-self: end;
    width: max-content;
    max-width: 100%;
    white-space: normal;
    text-align: center;
    line-height: 1.15;
    border-radius: var(--radius-pill);
    padding: 7px 12px;
    color: var(--clr-text);
    background: color-mix(in srgb, var(--clr-green) 12%, var(--clr-card));
    font-size: 12px;
    font-weight: 800;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--clr-green) 28%, transparent);
  }

  .product-selection-metrics {
    align-items: stretch;
    gap: 12px;
  }

  .product-selection-metric-row.two {
    grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
  }

  .product-selection-metric-row.three {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  }

  .product-selection-metric-row > div {
    display: grid;
    align-content: space-between;
    gap: 10px;
    min-height: 100px;
    padding: 16px;
    border-radius: var(--radius-md);
    background: rgba(148, 163, 184, 0.05);
    min-width: 0;
    border: 1px solid var(--clr-border);
    transition: background var(--transition-fast);
  }

  .product-selection-card:hover .product-selection-metric-row > div {
    background: color-mix(in srgb, var(--clr-green) 5%, var(--clr-card));
  }

  .product-selection-metrics span {
    line-height: 1.1;
    white-space: normal;
    overflow-wrap: anywhere;
    letter-spacing: 0;
  }

  .product-selection-metrics strong {
    color: var(--clr-green);
    font-size: 18px;
    font-weight: 800;
    line-height: 1.15;
    white-space: normal;
    overflow-wrap: anywhere;
    letter-spacing: -0.02em;
  }

  .product-report-toolbar { margin-bottom: 20px; }

  .product-range-grid {
    grid-template-columns: repeat(2, minmax(180px, 1fr)) auto;
    align-items: end;
  }

  .product-fill-section {
    display: grid;
    gap: 10px;
    padding-top: 4px;
  }

  .product-fill-label {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
  }

  .product-fill-label strong {
    color: var(--clr-green);
    font-size: 17px;
    font-weight: 800;
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: right;
    letter-spacing: -0.02em;
  }

  .product-fill-track {
    position: relative;
    height: 10px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--clr-border);
  }

  .product-fill-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--clr-green), var(--clr-blue));
    transition: width 0.6s ease;
  }

  .product-card-print-button { width: 100%; margin-top: auto; }

  .product-card-report-panel {
    display: grid;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--clr-border);
  }

  .product-card-section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .product-card-section-title span {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .product-card-section-title strong {
    color: var(--clr-green);
    font-size: 12px;
  }

  .product-card-action-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }

  .product-card-action-row.quick-action-row {
    grid-template-columns: minmax(0, 1fr) auto;
    margin-top: auto;
  }

  .ppm-date-range-grid.compact {
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    gap: 8px;
  }

  .product-card-menu { justify-self: end; }
  .product-card-menu > div { right: 0; }

  .report-card-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .ppm-breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .ppm-breadcrumb button {
    border: none;
    padding: 0;
    color: var(--clr-green);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 11.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition: opacity var(--transition-fast);
  }

  .ppm-breadcrumb button:hover { opacity: 0.75; }

  .ppm-breadcrumb strong {
    color: var(--clr-text);
    opacity: 0.8;
    font-size: 11.5px;
  }

  .single-product-grid {
    grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  }

  /* ── DSR Page ────────────────────────────────────────────── */
  .dsr-entry-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 18px;
  }

  .dsr-section { overflow: hidden; }

  .dsr-section > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    cursor: pointer;
    list-style: none;
    padding: 2px 0;
  }

  .dsr-section > summary::-webkit-details-marker { display: none; }

  .dsr-section > summary::after {
    content: "+";
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    color: var(--clr-text);
    background: color-mix(in srgb, var(--clr-green) 12%, var(--clr-card));
    font-weight: 800;
    font-size: 17px;
    line-height: 1;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--clr-green) 28%, transparent);
  }

  .dsr-section[open] > summary::after { content: "−"; }

  .dsr-section > summary h2,
  .dsr-section > summary p { margin: 0; }

  .dsr-section > summary span {
    color: var(--clr-text);
    opacity: 0.6;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .basic-info-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .basic-info-grid > div {
    min-width: 0;
    display: grid;
    gap: 6px;
    padding: 13px;
    border-radius: var(--radius-md);
    background: var(--clr-bg2);
    border: 1px solid var(--clr-border);
  }

  .basic-info-grid strong {
    min-width: 0;
    color: var(--clr-green);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }

  .dsr-sticky-actions {
    position: sticky;
    bottom: 18px;
    z-index: 10;
    border-color: rgba(0,211,130,0.25);
    box-shadow: 0 0 30px rgba(0,0,0,0.60);
  }

  .dsr-closing-card { margin-bottom: 0; }

  .dsr-page .ppm-header { align-items: flex-start; }
  .dsr-page .ppm-header > select,
  .dsr-date-picker { flex: 0 0 auto; }

  .selected-date-card,
  .closing-summary-section {
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: var(--clr-bg2);
  }

  .selected-date-card {
    display: grid;
    gap: 5px;
    padding: 14px;
  }

  .selected-date-card span,
  .closing-summary-head span {
    color: var(--clr-text);
    opacity: 0.55;
    font-size: 11.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .selected-date-card strong {
    color: var(--clr-green);
    font-size: 19px;
    font-weight: 800;
  }

  .closing-summary-section {
    display: grid;
    gap: 12px;
    padding: 14px;
  }

  .closing-summary-section.all-products {
    border-color: color-mix(in srgb, var(--clr-green) 24%, transparent);
    background: color-mix(in srgb, var(--clr-green) 6%, transparent);
  }

  .closing-summary-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }

  .closing-summary-head h3 {
    margin: 0;
    color: var(--clr-text);
    font-size: 15px;
    font-weight: 700;
  }

  /* ── Tank Status Overview ────────────────────────────────── */
  .tank-status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 12px;
  }

  .tank-status-grid article {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--clr-border);
    border-radius: var(--radius-md);
    background: rgba(255,255,255,0.03);
    transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  }

  .tank-status-grid article:hover {
    border-color: color-mix(in srgb, var(--clr-green) 22%, transparent);
    box-shadow: var(--shadow-sm);
  }

  .tank-status-grid article div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .tank-status-grid strong,
  .tank-status-grid span,
  .tank-status-grid em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tank-status-grid strong {
    color: var(--clr-green);
    font-weight: 700;
  }

  .tank-status-grid span,
  .tank-status-grid em {
    color: var(--clr-text);
    opacity: 0.68;
    font-style: normal;
    font-weight: 600;
    font-size: 12.5px;
  }

  /* ── Responsive ──────────────────────────────────────────── */
  @media (max-width: 1100px) {
    .ppm-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .wizard-topbar {
      position: static;
      grid-template-columns: 1fr;
    }

    .wizard-shell {
      grid-template-columns: 1fr;
    }

    .wizard-side {
      position: static;
    }

    .wizard-stepper {
      grid-template-columns: repeat(5, minmax(178px, 1fr));
      overflow-x: auto;
      padding-bottom: 3px;
    }

    .wizard-step-row {
      min-width: 178px;
    }

    .wizard-form-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .enterprise-login-shell {
      grid-template-columns: 1fr;
    }

    .enterprise-login-left {
      min-height: auto;
      grid-template-rows: auto auto auto auto;
    }

    .enterprise-login-brand {
      display: grid;
      gap: 18px;
    }

    .enterprise-login-heading {
      max-width: 720px;
      padding-top: 0;
    }

    .fuel-station-illustration {
      min-height: 220px;
    }

    .enterprise-login-right {
      padding: 34px 28px;
    }

    .wizard-custom-product-form {
      grid-template-columns: 1fr;
    }

    .wizard-forecourt-row {
      grid-template-columns: 1fr;
    }

    .ppm-top-grid,
    .ppm-money-grid,
    .ppm-product-grid,
    .ppm-actions-card,
    .automation-form-grid,
    .automation-mapping-grid,
    .automation-map-row {
      grid-template-columns: 1fr;
    }

    .ppm-closing-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .fuel-dashboard-grid { grid-template-columns: 1fr; }

    .dashboard-kpi-grid,
    .product-mini-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .fuel-closing-grid,
    .monthly-history-products {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }

    .report-product-grid {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    }

    .dashboard-section-grid { grid-template-columns: 1fr; }

    .ops-header,
    .dashboard-command-panel,
    .fuel-workbench-layout {
      grid-template-columns: 1fr;
    }

    .ops-status-cluster {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .fuel-workbench-rail {
      position: static;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sales-chart-grid,
    .reports-dashboard-grid,
    .reports-chart-grid,
    .report-filter-grid,
    .product-range-grid,
    .dsr-entry-grid {
      grid-template-columns: 1fr;
    }

    .monthly-fuel-metrics,
    .tank-capacity-grid,
    .backup-grid,
    .backup-dr-grid,
    .enterprise-kpi-grid,
    .erp-kpi-grid {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }

    .enterprise-panel-grid,
    .enterprise-report-grid,
    .enterprise-form-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 980px) {
    .product-selection-grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 760px) {
    .ppm-shell { flex-direction: column; }

    .login-enterprise-page {
      min-height: 100vh;
      padding: 0;
    }

    .enterprise-login-shell {
      min-height: 100vh;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }

    .enterprise-login-left {
      gap: 18px;
      padding: 24px 18px;
    }

    .enterprise-login-heading h1 {
      font-size: 34px;
    }

    .enterprise-login-heading p {
      font-size: 15px;
    }

    .fuel-station-illustration {
      min-height: 188px;
      padding: 16px 10px 20px;
    }

    .fuel-station-skyline {
      display: none;
    }

    .fuel-canopy {
      height: 44px;
    }

    .fuel-station-body {
      width: 98%;
      min-height: 96px;
      grid-template-columns: 1fr 54px 54px;
      gap: 9px;
      padding: 28px 12px 0;
    }

    .fuel-storefront {
      height: 74px;
      gap: 5px;
      padding: 10px;
    }

    .fuel-dispenser {
      height: 80px;
      padding: 8px;
    }

    .fuel-forecourt {
      height: 34px;
      margin-top: -6px;
    }

    .enterprise-feature-grid {
      grid-template-columns: 1fr;
    }

    .enterprise-login-credit {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }

    .enterprise-login-credit strong {
      text-align: left;
    }

    .enterprise-login-right {
      align-items: start;
      padding: 20px 16px 28px;
    }

    .login-card.enterprise-login-card {
      padding: 22px 18px;
      border-radius: 12px;
      box-shadow: 0 14px 34px rgba(15, 23, 42, 0.10);
    }

    .login-card-header h2 {
      font-size: 24px;
    }

    .ppm-sidebar,
    .ppm-sidebar.is-collapsed {
      position: static;
      width: 100%;
      min-width: 0;
      height: auto;
      padding: 12px;
      border-right: none;
      border-bottom: 1px solid var(--clr-border);
      align-items: stretch;
      overflow: visible;
    }

    .ppm-main { padding: 16px; }

    .sidebar-brand-row,
    .ppm-sidebar.is-collapsed .sidebar-brand-row {
      grid-template-columns: 36px 36px minmax(0, 1fr);
      justify-items: stretch;
    }

    .ppm-sidebar.is-collapsed .sidebar-brand-row h2,
    .ppm-sidebar.is-collapsed .sidebar-logo-mark {
      display: inline-flex;
    }

    .ppm-sidebar.is-collapsed .sidebar-brand-row h2 { display: block; }

    .sidebar-nav {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 4px;
    }

    .sidebar-item,
    .ppm-sidebar.is-collapsed .sidebar-item {
      grid-template-columns: 1fr;
      justify-items: center;
      min-height: 46px;
      padding: 8px;
      text-align: center;
      width: auto;
      flex: 0 0 auto;
      border-left: none !important;
    }

    .sidebar-item span,
    .ppm-sidebar.is-collapsed .sidebar-item span,
    .sidebar-user-card,
    .sidebar-chevron { display: none; }

    .sidebar-subnav,
    .ppm-sidebar.is-collapsed .sidebar-subnav {
      display: flex;
      flex-wrap: wrap;
      padding-left: 0;
      width: 100%;
    }

    .sidebar-subitem,
    .ppm-sidebar.is-collapsed .sidebar-subitem {
      grid-template-columns: 1fr;
      justify-items: center;
      padding: 6px;
    }

    .sidebar-subitem strong,
    .ppm-sidebar.is-collapsed .sidebar-subitem strong { display: none; }

    .sidebar-logout { margin-top: 0; padding-top: 0; border-top: none; }

    .onboarding-wizard {
      gap: 14px;
      padding: 12px;
    }

    .wizard-topbar {
      gap: 16px;
      padding: 16px;
      border-radius: 14px;
    }

    .wizard-brand-lockup {
      align-items: flex-start;
      gap: 12px;
    }

    .wizard-brand-lockup .petrosync-logo-icon {
      width: 48px;
      height: 48px;
    }

    .wizard-brand-lockup strong {
      font-size: 21px;
    }

    .wizard-shell {
      grid-template-columns: 1fr;
      gap: 14px;
    }

    .wizard-side {
      position: static;
      padding: 16px;
      border-radius: 14px;
    }

    .wizard-stepper {
      display: grid;
      grid-template-columns: 1fr;
      overflow: visible;
      padding-bottom: 0;
    }

    .wizard-step-row {
      min-width: 0;
      grid-template-columns: 68px minmax(0, 1fr);
      padding: 10px;
    }

    .wizard-step-row strong {
      font-size: 13px;
    }

    .wizard-panel {
      border-radius: 14px;
    }

    .wizard-panel-head {
      grid-template-columns: 52px minmax(0, 1fr);
      align-items: start;
      padding: 18px 16px;
    }

    .wizard-panel-icon {
      width: 48px;
      height: 48px;
      border-radius: 14px;
    }

    .wizard-panel-icon .wizard-svg-icon {
      width: 24px;
      height: 24px;
    }

    .wizard-panel-head h2 {
      font-size: 22px;
    }

    .wizard-step-body,
    .wizard-panel > .login-message,
    .wizard-validation-card {
      margin-right: 16px;
      margin-left: 16px;
    }

    .wizard-section-card {
      padding: 16px;
      border-radius: 14px;
    }

    .wizard-form-grid,
    .wizard-card-selector.compact {
      grid-template-columns: 1fr;
    }

    .wizard-footer {
      display: grid;
      grid-template-columns: 1fr;
      padding: 14px 16px 16px;
    }

    .wizard-footer-left,
    .wizard-footer-right {
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .wizard-validation-card {
      grid-template-columns: 1fr;
    }

    .ppm-header,
    .ppm-card-title,
    .ppm-actions-card,
    .ppm-actions,
    .ppm-total-row {
      align-items: stretch;
      flex-direction: column;
    }

    .ppm-header h1 { font-size: 24px; }

    .ppm-summary-grid,
    .ppm-summary-grid.compact,
    .ppm-field-grid,
    .ppm-closing-grid,
    .ppm-date-range-grid,
    .ppm-print-grid,
    .ppm-welcome-card,
    .reports-dashboard-grid,
    .monthly-fuel-grid,
    .tank-capacity-grid-layout,
    .monthly-fuel-metrics,
    .tank-capacity-grid,
    .backup-grid,
    .backup-status-grid,
    .backup-form-grid,
    .backup-dr-grid {
      grid-template-columns: 1fr;
    }

    .enterprise-kpi-grid,
    .enterprise-panel-grid,
    .enterprise-report-grid,
    .enterprise-form-grid,
    .enterprise-list-row,
    .enterprise-row {
      grid-template-columns: 1fr;
    }

    .enterprise-row-actions { justify-content: stretch; }
    .enterprise-row-actions .ppm-button { width: 100%; }

    .ppm-theme-select,
    .dsr-date-picker,
    .ppm-button { width: 100%; }

    .ppm-modal-backdrop {
      padding: 12px;
      align-items: stretch;
    }

    .ppm-modal {
      width: 100%;
      max-height: calc(100vh - 24px);
      padding: 18px;
      border-radius: var(--radius-lg);
    }

    .ppm-header {
      border-bottom: 2px solid #000000;
      margin-bottom: 12px;
      padding-bottom: 8px;
    }

    .ppm-card,
    .ppm-stat,
    .ppm-welcome-card {
      box-shadow: none !important;
      border: 1px solid #b8b8b8 !important;
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: 10px !important;
    }

    .ppm-table { min-width: 0; font-size: 10px; }

    .ppm-table th,
    .ppm-table td { padding: 5px; }
  }
  `;
};

export default App;
