import React from "react";
import { themes } from "../theme";
import { backendApi } from "../utils/backendApi";
import Skeleton from "../components/Skeleton";

const steps = [
  {
    key: "pump",
    label: "Pump Details",
    description: "Basic outlet information",
    icon: "store",
  },
  {
    key: "company",
    label: "Fuel Company",
    description: "Select retail company",
    icon: "building",
  },
  {
    key: "fuels",
    label: "Fuel Master",
    description: "Choose available fuels",
    icon: "droplet",
  },
  {
    key: "forecourt",
    label: "Tanks & Nozzles",
    description: "Configure forecourt",
    icon: "fuel",
  },
  {
    key: "account",
    label: "Owner Account",
    description: "Create administrator",
    icon: "user",
  },
];

const outletTypes = [
  { value: "KSK", label: "KSK (Kisan Seva Kendra)" },
  { value: "Regular RO", label: "Regular Retail Outlet" },
  { value: "COCO", label: "COCO (Company Owned Company Operated)" },
  { value: "CODO", label: "CODO (Company Owned Dealer Operated)" },
  { value: "DODO", label: "DODO (Dealer Owned Dealer Operated)" },
];

const fallbackFuelCompanies = [
  {
    key: "indianoil",
    label: "IndianOil",
    products: [],
  },
  {
    key: "bpcl",
    label: "Bharat Petroleum (BPCL)",
    products: [],
  },
  {
    key: "hpcl",
    label: "Hindustan Petroleum (HPCL)",
    products: [],
  },
  {
    key: "shell",
    label: "Shell",
    products: [],
  },
  {
    key: "nayara",
    label: "Nayara Energy",
    products: [],
  },
  {
    key: "jiobp",
    label: "Jio-bp",
    products: [],
  },
  {
    key: "custom",
    label: "Other (Custom)",
    products: [],
  },
];

const defaultPump = {
  pumpName: "",
  dealerName: "",
  outletType: "",
  company: "",
  themeKey: "indianOil",
  email: "",
  contactNumber: "",
  state: "",
  district: "",
  pinCode: "",
  address: "",
};

const defaultOwner = {
  firstName: "",
  lastName: "",
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
  securityQuestion: "What is your favorite color?",
  securityAnswer: "",
  recoveryEmail: "",
  recoveryPhone: "",
};

const wizardTokens = (theme) => ({
  "--surface": theme.card,
  "--bg": theme.bg,
  "--ink": theme.text,
  "--accent": theme.accent,
  "--accent2": theme.accent2 || theme.accent,
  "--accent-weak": theme.accentSoft || `${theme.accent}1a`,
  "--accent-strong": theme.accent,
  "--border": "rgba(148, 163, 184, 0.24)",
  "--muted": theme.muted || "rgba(100, 116, 139, 0.82)",
  "--success": "#16a34a",
  "--warning": "#f59e0b",
  "--danger": "#dc2626",
  "--info": "#2563eb",
  "--ring": theme.ring || `${theme.accent}52`,
});

const text = (value) => String(value || "").trim();

const fuelCode = (value) =>
  text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const loginLimits = {
  username: 50,
  password: 128,
};

const loginFeatures = [
  "Daily Sales Register",
  "Tank Monitoring",
  "Nozzle Management",
  "Inventory",
  "Reports & Analytics",
  "Enterprise Security",
];

const loginStatusMessages = {
  401: "Invalid username or password.",
  403: "Access denied.",
  409: "Legacy password detected.",
  429: "Too many attempts.",
  500: "Unexpected server error. Please try again later.",
};

const createNozzle = (code, tankIndex, nozzleIndex) => ({
  key: `${code}-T${tankIndex + 1}-N${nozzleIndex + 1}`,
  nozzleId: `${code}-N-${tankIndex + 1}-${nozzleIndex + 1}`,
  dispenserId: `D-${tankIndex + 1}`,
  automationId: "",
});

const createTank = (product, tankIndex) => {
  const code = fuelCode(product.code || product.name) || "FUEL";

  return {
    key: `${code}-T${tankIndex + 1}`,
    tankId: `${code}-T-${tankIndex + 1}`,
    capacity: Number(product.capacity || 10000),
    atgId: "",
    nozzles: [createNozzle(code, tankIndex, 0)],
  };
};

const createFuel = (product, index) => {
  const code = fuelCode(product.code || product.name);

  return {
    key: `${code || "FUEL"}-${index + 1}`,
    code,
    name: text(product.name || product.code),
    custom: Boolean(product.custom),
    enabled: product.enabled !== false,
    tanks: [createTank(product, index)],
  };
};

const createCompanyFuels = (companyKey, companies = fallbackFuelCompanies) => {
  const company = companies.find((item) => item.key === companyKey);
  return (company?.products || []).map((product, index) => createFuel(product, index));
};

const createInitialSetupForm = () => ({
  pump: { ...defaultPump },
  owner: { ...defaultOwner },
  fuelCompanyKey: "",
  fuels: [],
  business: {
    financialYear: "",
    gstEnabled: false,
    gstin: "",
    taxMode: "standard",
    currency: "INR",
    language: "English",
    dateFormat: "DD-MM-YYYY",
  },
  backup: {
    enabled: true,
    frequency: "daily",
    destination: "local",
  },
  shiftCount: 3,
});

const selectedProducts = (setupForm) =>
  setupForm.fuels
    .filter((fuel) => fuel.enabled)
    .map((fuel) => ({
      code: fuelCode(fuel.code || fuel.name),
      name: text(fuel.name || fuel.code),
      custom: Boolean(fuel.custom),
      tanks: Array.isArray(fuel.tanks) ? fuel.tanks : [],
    }))
    .filter((fuel) => fuel.code && fuel.name);

const stationStructure = (setupForm) => {
  const fuels = selectedProducts(setupForm);
  const products = fuels.map(({ code, name, custom }) => ({ code, name, custom }));
  const tanks = [];
  const nozzles = [];

  fuels.forEach((fuel) => {
    fuel.tanks.forEach((tank, tankIndex) => {
      const tankId = text(tank.tankId);
      if (!tankId) {
        return;
      }

      tanks.push({
        tankId,
        capacity: Number(tank.capacity || 0),
        product: fuel.code,
        productName: fuel.name,
        atgId: text(tank.atgId),
        automationId: text(tank.automationId),
      });

      const tankNozzles = Array.isArray(tank.nozzles) ? tank.nozzles : [];
      tankNozzles.forEach((nozzle, nozzleIndex) => {
        nozzles.push({
          nozzleId: text(nozzle.nozzleId) || `${fuel.code}-N-${tankIndex + 1}-${nozzleIndex + 1}`,
          dispenserId: text(nozzle.dispenserId),
          product: fuel.code,
          tankId,
          automationId: text(nozzle.automationId),
          atgId: "",
          atosId: "",
        });
      });
    });
  });

  const dispenserIds = [...new Set(nozzles.map((nozzle) => nozzle.dispenserId).filter(Boolean))];
  const dispensers = dispenserIds.map((dispenserId) => ({
    dispenserId,
    manufacturer: "Other",
    model: "",
  }));

  return {
    products,
    tanks,
    dispensers: dispensers.length > 0 ? dispensers : [{ dispenserId: "D-1", manufacturer: "Other", model: "" }],
    nozzles,
    shiftStructure: {
      count: Number(setupForm.shiftCount || 3),
    },
    staffRoles: ["Owner", "Manager", "Operator"],
  };
};

const buildSetupPayload = ({ setupForm }) => ({
  pump: {
    ...setupForm.pump,
    themeKey: "indianOil",
  },
  owner: setupForm.owner,
  structure: stationStructure(setupForm),
  business: {
    financialYear: setupForm.business.financialYear,
    gstEnabled: setupForm.business.gstEnabled,
    gstin: setupForm.business.gstin,
    taxMode: setupForm.business.taxMode,
    currency: setupForm.business.currency,
    language: setupForm.business.language,
    dateFormat: setupForm.business.dateFormat,
  },
  backup: {
    enabled: setupForm.backup.enabled,
    frequency: setupForm.backup.frequency,
    destination: setupForm.backup.destination,
  },
});

const validateLoginCredentials = (form) => {
  const username = text(form.username);
  const password = String(form.password || "");
  const errors = {};

  if (!username) {
    errors.username = "Username is required.";
  } else if (username.length < 3) {
    errors.username = "Username must be at least 3 characters.";
  } else if (username.length > loginLimits.username) {
    errors.username = "Username must be 50 characters or fewer.";
  }

  if (!password.trim()) {
    errors.password = "Password is required.";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (password.length > loginLimits.password) {
    errors.password = "Password must be 128 characters or fewer.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: {
      username,
      password,
    },
  };
};

const loginMessageForError = (error) => {
  const status = Number(error?.status || 0);

  if (loginStatusMessages[status]) {
    return loginStatusMessages[status];
  }

  if (status >= 500) {
    return loginStatusMessages[500];
  }

  if (!status) {
    return "Cannot connect to PetroSync server.";
  }

  return error?.message || "Login failed.";
};

const validatePumpDetails = (setupForm) => {
  const fields = [
    ["pumpName", "Outlet name"],
    ["dealerName", "Dealer name"],
    ["outletType", "Outlet type"],
    ["email", "Email"],
    ["contactNumber", "Contact number"],
    ["state", "State"],
    ["district", "District"],
    ["address", "Address"],
  ];

  return fields
    .filter(([field]) => !text(setupForm.pump[field]))
    .map(([, label]) => `${label} is required`);
};

const validateFuelCompany = (setupForm) =>
  setupForm.fuelCompanyKey && text(setupForm.pump.company)
    ? []
    : ["Select a fuel company"];

const validateFuelMaster = (setupForm) => {
  const selected = selectedProducts(setupForm);
  const errors = [];

  if (selected.length === 0) {
    errors.push("Select or add at least one fuel");
  }

  selected.forEach((fuel) => {
    if (!fuel.code || !fuel.name) {
      errors.push("Each fuel needs a code and name");
    }
  });

  return [...new Set(errors)];
};

const validateForecourt = (setupForm) => {
  const errors = [];
  const fuels = selectedProducts(setupForm);

  if (fuels.length === 0) {
    errors.push("Select at least one fuel before configuring tanks");
  }

  fuels.forEach((fuel) => {
    if (fuel.tanks.length === 0) {
      errors.push(`${fuel.name} needs at least one tank`);
    }

    fuel.tanks.forEach((tank, tankIndex) => {
      const label = `${fuel.name} tank ${tankIndex + 1}`;
      const nozzles = Array.isArray(tank.nozzles) ? tank.nozzles : [];

      if (!text(tank.tankId)) {
        errors.push(`${label} needs a tank number`);
      }

      if (Number(tank.capacity || 0) <= 0) {
        errors.push(`${label} needs capacity`);
      }

      if (nozzles.length === 0) {
        errors.push(`${label} needs at least one nozzle`);
      }

      nozzles.forEach((nozzle, nozzleIndex) => {
        if (!text(nozzle.nozzleId)) {
          errors.push(`${label} nozzle ${nozzleIndex + 1} needs a nozzle number`);
        }

        if (!text(nozzle.dispenserId)) {
          errors.push(`${label} nozzle ${nozzleIndex + 1} needs a dispenser number`);
        }
      });
    });
  });

  return [...new Set(errors)];
};

const validateAccount = (setupForm) => {
  const fields = [
    ["firstName", "First name"],
    ["lastName", "Last name"],
    ["email", "Email"],
    ["username", "Username"],
    ["password", "Password"],
    ["confirmPassword", "Confirm password"],
    ["recoveryEmail", "Recovery email"],
    ["recoveryPhone", "Recovery phone"],
  ];
  const errors = fields
    .filter(([field]) => !text(setupForm.owner[field]))
    .map(([, label]) => `${label} is required`);

  if (setupForm.owner.password && setupForm.owner.password.length < 10) {
    errors.push("Password must be at least 10 characters");
  }

  if (
    setupForm.owner.password &&
    setupForm.owner.confirmPassword &&
    setupForm.owner.password !== setupForm.owner.confirmPassword
  ) {
    errors.push("Passwords do not match");
  }

  return errors;
};

const stepErrors = (activeStepKey, setupForm) => {
  if (activeStepKey === "pump") return validatePumpDetails(setupForm);
  if (activeStepKey === "company") return validateFuelCompany(setupForm);
  if (activeStepKey === "fuels") return validateFuelMaster(setupForm);
  if (activeStepKey === "forecourt") return validateForecourt(setupForm);
  if (activeStepKey === "account") return validateAccount(setupForm);
  return [];
};

function WizardIcon({ name, className = "" }) {
  const paths = {
    alert: (
      <>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 4.3 2.6 17.6A1.6 1.6 0 0 0 4 20h16a1.6 1.6 0 0 0 1.4-2.4L13.7 4.3a1.6 1.6 0 0 0-2.8 0Z" />
      </>
    ),
    building: (
      <>
        <path d="M4 20h16" />
        <path d="M6 20V8l6-4 6 4v12" />
        <path d="M9 20v-6h6v6" />
        <path d="M9 10h.01" />
        <path d="M15 10h.01" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 4 4 10-10" />
      </>
    ),
    droplet: (
      <>
        <path d="M12 3s6 6.1 6 10a6 6 0 0 1-12 0c0-3.9 6-10 6-10Z" />
      </>
    ),
    fuel: (
      <>
        <path d="M5 20V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15" />
        <path d="M8 9h5" />
        <path d="M16 8h2l2 2v7a2 2 0 0 1-4 0v-3" />
        <path d="M4 20h13" />
      </>
    ),
    hash: (
      <>
        <path d="M5 9h14" />
        <path d="M5 15h14" />
        <path d="M10 4 8 20" />
        <path d="m16 4-2 16" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    id: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M8 10h4" />
        <path d="M8 14h8" />
        <path d="M16 10h.01" />
      </>
    ),
    info: (
      <>
        <path d="M12 8h.01" />
        <path d="M11 12h1v5h1" />
        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </>
    ),
    lock: (
      <>
        <path d="M6 11h12v9H6z" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    mail: (
      <>
        <path d="M4 6h16v12H4z" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    mapPin: (
      <>
        <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
        <path d="M12 10h.01" />
      </>
    ),
    palette: (
      <>
        <path d="M12 3a9 9 0 0 0 0 18h1.2a1.8 1.8 0 0 0 1.1-3.2 1.7 1.7 0 0 1 1-3.1H17a4 4 0 0 0 0-8h-1.4A8.7 8.7 0 0 0 12 3Z" />
        <path d="M7.5 11h.01" />
        <path d="M9.5 7.5h.01" />
        <path d="M14 7.5h.01" />
      </>
    ),
    phone: (
      <>
        <path d="M6.6 4h3l1.4 4-2 1.2a12 12 0 0 0 5.8 5.8l1.2-2 4 1.4v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4Z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 4.6 2.9 8.4 7 10 4.1-1.6 7-5.4 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    store: (
      <>
        <path d="M4 10h16l-1.6-5H5.6L4 10Z" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-5h6v5" />
        <path d="M8 10v2" />
        <path d="M12 10v2" />
        <path d="M16 10v2" />
      </>
    ),
    tag: (
      <>
        <path d="M20 13 13 20 4 11V4h7l9 9Z" />
        <path d="M8 8h.01" />
      </>
    ),
    user: (
      <>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
      </>
    ),
  };

  return (
    <svg
      className={`wizard-svg-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name] || paths.info}
      </g>
    </svg>
  );
}

function PetroSyncLogo({ logoDataUrl, compact = false }) {
  return (
    <div className={`petrosync-logo ${compact ? "compact" : ""}`} aria-label="PetroSync">
      <span
        className={`petrosync-logo-icon ${logoDataUrl ? "has-image" : "mark-only"}`}
        aria-hidden="true"
      >
        {logoDataUrl ? <img src={logoDataUrl} alt="" /> : <span />}
      </span>
      <span className="petrosync-logo-text">
        <strong>PetroSync</strong>
        {!compact && <small>FuelOps Suite</small>}
      </span>
    </div>
  );
}

function FuelStationIllustration() {
  return (
    <div className="fuel-station-illustration" aria-hidden="true">
      <div className="fuel-station-skyline">
        <span />
        <span />
        <span />
      </div>
      <div className="fuel-canopy">
        <span />
      </div>
      <div className="fuel-station-body">
        <div className="fuel-storefront">
          <span />
          <span />
          <span />
        </div>
        <div className="fuel-dispenser primary">
          <span />
        </div>
        <div className="fuel-dispenser secondary">
          <span />
        </div>
      </div>
      <div className="fuel-forecourt">
        <span />
        <span />
      </div>
    </div>
  );
}

function FieldFeedback({ id, helper, errorText }) {
  if (!helper && !errorText) return null;

  return (
    <small id={id} className="wizard-field-feedback">
      {errorText || helper}
    </small>
  );
}

function TextField({
  label,
  name,
  value,
  onChange,
  type = "text",
  disabled,
  placeholder,
  icon = "info",
  helper,
  required = false,
  errorText = "",
  className = "",
  inputMode,
  min,
  max,
  autoComplete,
}) {
  const feedbackId = `wizard-${name}-feedback`;
  const hasError = Boolean(errorText);
  const hasSuccess = !hasError && text(value);

  return (
    <label
      className={`wizard-field ${className} ${hasError ? "is-error" : ""} ${
        hasSuccess ? "is-success" : ""
      }`}
    >
      <span className="wizard-field-label">
        {label}
        {required && <em aria-hidden="true">*</em>}
      </span>
      <span className="wizard-input-shell">
        <WizardIcon name={icon} />
        <input
          className="ppm-input"
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={inputMode}
          min={min}
          max={max}
          autoComplete={autoComplete}
          aria-invalid={hasError}
          aria-describedby={helper || hasError ? feedbackId : undefined}
          required={required}
        />
        <span className="wizard-field-state" aria-hidden="true">
          {hasError ? <WizardIcon name="alert" /> : hasSuccess ? <WizardIcon name="check" /> : null}
        </span>
      </span>
      <FieldFeedback id={feedbackId} helper={helper} errorText={errorText} />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  disabled,
  icon = "info",
  helper,
  required = false,
  errorText = "",
  className = "",
}) {
  const feedbackId = `wizard-${name}-feedback`;
  const hasError = Boolean(errorText);
  const hasSuccess = !hasError && text(value);

  return (
    <label
      className={`wizard-field ${className} ${hasError ? "is-error" : ""} ${
        hasSuccess ? "is-success" : ""
      }`}
    >
      <span className="wizard-field-label">
        {label}
        {required && <em aria-hidden="true">*</em>}
      </span>
      <span className="wizard-input-shell">
        <WizardIcon name={icon} />
        <select
          className="ppm-theme-select"
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={helper || hasError ? feedbackId : undefined}
          required={required}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="wizard-field-state" aria-hidden="true">
          {hasError ? <WizardIcon name="alert" /> : hasSuccess ? <WizardIcon name="check" /> : null}
        </span>
      </span>
      <FieldFeedback id={feedbackId} helper={helper} errorText={errorText} />
    </label>
  );
}

function TextareaField({
  label,
  name,
  value,
  onChange,
  disabled,
  placeholder,
  icon = "info",
  helper,
  required = false,
  errorText = "",
  className = "",
}) {
  const feedbackId = `wizard-${name}-feedback`;
  const hasError = Boolean(errorText);
  const hasSuccess = !hasError && text(value);

  return (
    <label
      className={`wizard-field ${className} ${hasError ? "is-error" : ""} ${
        hasSuccess ? "is-success" : ""
      }`}
    >
      <span className="wizard-field-label">
        {label}
        {required && <em aria-hidden="true">*</em>}
      </span>
      <span className="wizard-input-shell textarea">
        <WizardIcon name={icon} />
        <textarea
          className="ppm-input"
          name={name}
          rows="3"
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={hasError}
          aria-describedby={helper || hasError ? feedbackId : undefined}
          required={required}
        />
        <span className="wizard-field-state" aria-hidden="true">
          {hasError ? <WizardIcon name="alert" /> : hasSuccess ? <WizardIcon name="check" /> : null}
        </span>
      </span>
      <FieldFeedback id={feedbackId} helper={helper} errorText={errorText} />
    </label>
  );
}

function ValidationCard({ errors }) {
  if (errors.length === 0) return null;
  const labels = errors.map((error) => error.replace(/\s+is required\.?$/i, ""));

  return (
    <section className="wizard-validation-card" role="alert" aria-live="polite">
      <div className="wizard-validation-icon">
        <WizardIcon name="alert" />
      </div>
      <div>
        <strong>Please complete the following required fields before continuing.</strong>
        <ul>
          {labels.map((label, idx) => (
            <li key={`${label}-${idx}`}>{label}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Stepper({ steps, activeStep, onStepClick, stepErrors }) {
  return (
    <nav className="wizard-stepper" aria-label="Onboarding progress">
      {steps.map((step, idx) => {
        const isActive = idx === activeStep;
        const isComplete = idx < activeStep;
        const stateLabel = isComplete ? "Complete" : isActive ? "Current" : "Locked";

        return (
          <button
            key={step.key}
            type="button"
            className={`wizard-step-row ${isActive ? "active" : ""} ${
              isComplete ? "complete" : ""
            }`}
            onClick={() => onStepClick(idx)}
            disabled={idx > activeStep}
            aria-current={isActive ? "step" : undefined}
            aria-label={`${step.label}. ${step.description}. ${stateLabel}.`}
          >
            <span className="wizard-step-status" aria-hidden="true">
              <span className="wizard-step-number">
                {isComplete ? <WizardIcon name="check" /> : idx + 1}
              </span>
              <span className="wizard-step-icon">
                <WizardIcon name={step.icon} />
              </span>
            </span>
            <span className="wizard-step-copy">
              <strong>{step.label}</strong>
              <small>{step.description}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PreviewCard({ setupForm, pumpBranding, progressPercent }) {
  const structure = stationStructure(setupForm);
  const products = selectedProducts(setupForm);
  const configuredRows = [
    text(setupForm.pump.pumpName) && ["Outlet Name", text(setupForm.pump.pumpName)],
    text(setupForm.pump.company) && ["Fuel Company", text(setupForm.pump.company)],
    structure.tanks.length > 0 && ["Tank Count", structure.tanks.length],
    structure.nozzles.length > 0 && ["Nozzle Count", structure.nozzles.length],
  ].filter(Boolean);

  return (
    <article className="wizard-preview-card">
      <div className="wizard-summary-head">
        <span
          className={`petrosync-logo-icon ${pumpBranding?.logoDataUrl ? "has-image" : "mark-only"}`}
          aria-label="Outlet logo"
        >
          {pumpBranding?.logoDataUrl ? <img src={pumpBranding.logoDataUrl} alt="" /> : <span />}
        </span>
        <div>
          <span>Setup Summary</span>
          <strong>{text(setupForm.pump.pumpName) || "PetroSync Outlet"}</strong>
          {text(setupForm.pump.company) && <small>{text(setupForm.pump.company)}</small>}
        </div>
      </div>

      {products.length > 0 && (
        <div className="wizard-summary-fuels">
          <span>Selected Fuels</span>
          <div>
            {products.map((product) => (
              <strong key={product.code}>{product.name}</strong>
            ))}
          </div>
        </div>
      )}

      {configuredRows.length > 0 && (
        <dl className="wizard-summary-list">
          {configuredRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="wizard-summary-progress">
        <div>
          <span>Progress</span>
          <strong>{progressPercent}%</strong>
        </div>
        <div className="wizard-progress-track">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <small>{progressPercent === 100 ? "Ready to finish" : "Configuration in progress"}</small>
      </div>
    </article>
  );
}

function WizardSkeleton() {
  return (
    <div className="wizard-transition">
      <Skeleton variant="block" height={28} width="60%" />
      <Skeleton variant="block" height={48} count={3} />
    </div>
  );
}

function PumpDetailsStep({ setupForm, setPumpField, setBusinessField, disabled }) {
  const handleChange = (e) => setPumpField(e.target.name, e.target.value);
  const handleBusinessChange = (e) =>
    setBusinessField(e.target.name, e.target.type === "checkbox" ? e.target.checked : e.target.value);
  const requiredPumpError = (field, label) =>
    text(setupForm.pump[field]) ? "" : `${label} is required`;
  const themeOptions = Object.keys(themes).map((key) => ({
    value: key,
    label: key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (letter) => letter.toUpperCase()),
  }));

  return (
    <div className="wizard-transition wizard-section-stack">
      <section className="wizard-section-card">
        <div className="wizard-section-head">
          <span>Section 1</span>
          <h3>Outlet Information</h3>
        </div>
        <div className="wizard-form-grid">
          <TextField
            label="Outlet Name"
            name="pumpName"
            value={setupForm.pump.pumpName}
            onChange={handleChange}
            disabled={disabled}
            placeholder="e.g., Sunrise Petroleum"
            icon="store"
            helper="Shown across receipts, dashboards, and reports."
            required
            errorText={requiredPumpError("pumpName", "Outlet name")}
          />
          <TextField
            label="Dealer Name"
            name="dealerName"
            value={setupForm.pump.dealerName}
            onChange={handleChange}
            disabled={disabled}
            placeholder="Full name"
            icon="id"
            required
            errorText={requiredPumpError("dealerName", "Dealer name")}
          />
          <SelectField
            label="Outlet Type"
            name="outletType"
            value={setupForm.pump.outletType}
            onChange={handleChange}
            options={[{ value: "", label: "Select outlet type" }, ...outletTypes]}
            disabled={disabled}
            icon="tag"
            required
            errorText={requiredPumpError("outletType", "Outlet type")}
          />
        </div>
      </section>

      <section className="wizard-section-card">
        <div className="wizard-section-head">
          <span>Section 2</span>
          <h3>Contact Information</h3>
        </div>
        <div className="wizard-form-grid">
          <TextField
            label="Email"
            name="email"
            type="email"
            value={setupForm.pump.email}
            onChange={handleChange}
            disabled={disabled}
            placeholder="outlet@example.com"
            icon="mail"
            required
            errorText={requiredPumpError("email", "Email")}
          />
          <TextField
            label="Phone"
            name="contactNumber"
            value={setupForm.pump.contactNumber}
            onChange={handleChange}
            disabled={disabled}
            placeholder="10-digit mobile"
            icon="phone"
            inputMode="tel"
            required
            errorText={requiredPumpError("contactNumber", "Contact number")}
          />
          <TextareaField
            label="Address"
            name="address"
            value={setupForm.pump.address}
            onChange={handleChange}
            disabled={disabled}
            placeholder="Complete postal address"
            icon="mapPin"
            className="span-full"
            required
            errorText={requiredPumpError("address", "Address")}
          />
        </div>
      </section>

      <section className="wizard-section-card">
        <div className="wizard-section-head">
          <span>Section 3</span>
          <h3>Location</h3>
        </div>
        <div className="wizard-form-grid">
          <TextField
            label="State"
            name="state"
            value={setupForm.pump.state}
            onChange={handleChange}
            disabled={disabled}
            placeholder="Select or enter state"
            icon="mapPin"
            required
            errorText={requiredPumpError("state", "State")}
          />
          <TextField
            label="District"
            name="district"
            value={setupForm.pump.district}
            onChange={handleChange}
            disabled={disabled}
            placeholder="District"
            icon="mapPin"
            required
            errorText={requiredPumpError("district", "District")}
          />
          <TextField
            label="PIN Code"
            name="pinCode"
            value={setupForm.pump.pinCode}
            onChange={handleChange}
            disabled={disabled}
            placeholder="e.g., 700001"
            icon="hash"
            inputMode="numeric"
            helper="Optional; add the postal PIN if available."
          />
        </div>
      </section>

      <section className="wizard-section-card">
        <div className="wizard-section-head">
          <span>Section 4</span>
          <h3>Additional Information</h3>
        </div>
        <div className="wizard-form-grid">
          <label className="wizard-check-field span-full">
            <input
              type="checkbox"
              name="gstEnabled"
              checked={setupForm.business.gstEnabled}
              onChange={handleBusinessChange}
              disabled={disabled}
            />
            <span>
              <strong>GST Enabled</strong>
              <small>Use GST details on receipts and tax settings.</small>
            </span>
          </label>
          <TextField
            label="GST"
            name="gstin"
            value={setupForm.business.gstin}
            onChange={handleBusinessChange}
            disabled={disabled || !setupForm.business.gstEnabled}
            placeholder="GSTIN"
            icon="id"
            helper="Optional unless GST is enabled for this outlet."
          />
          <TextField
            label="Company"
            name="company"
            value={setupForm.pump.company}
            onChange={handleChange}
            disabled
            placeholder="Select in Fuel Company step"
            icon="building"
            helper="Configured in the next step."
          />
          <SelectField
            label="Theme"
            name="themeKey"
            value={setupForm.pump.themeKey}
            onChange={handleChange}
            options={themeOptions}
            disabled
            icon="palette"
            helper="Locked to PetroSync branding during first-run setup."
          />
        </div>
      </section>
    </div>
  );
}

function FuelCompanyStep({ setupForm, fuelCompanies, setFuelCompany, disabled }) {
  const company = fuelCompanies.find((item) => item.key === setupForm.fuelCompanyKey);

  return (
    <div className="wizard-transition">
      <SelectField
        label="Fuel Company"
        name="fuelCompanyKey"
        value={setupForm.fuelCompanyKey}
        onChange={(e) => setFuelCompany(e.target.value)}
        options={[
          { value: "", label: "Select fuel company" },
          ...fuelCompanies.map((item) => ({ value: item.key, label: item.label })),
        ]}
        disabled={disabled}
      />

      {company && (
        <article className="wizard-preview-card" style={{ marginTop: 18 }}>
          <div className="wizard-preview-brand">
            <PetroSyncLogo compact />
            <div>
              <strong>{company.label}</strong>
              <span>{company.products.length || "Custom"} default fuels</span>
            </div>
          </div>
          {company.products.length > 0 && (
            <div className="wizard-preview-grid">
              {company.products.map((product) => (
                <span key={product.code}>{product.name}</span>
              ))}
            </div>
          )}
        </article>
      )}
    </div>
  );
}

function FuelMasterStep({ setupForm, setFuels, addCustomFuel, removeCustomFuel, disabled }) {
  const [newFuel, setNewFuel] = React.useState({ code: "", name: "" });

  const toggleFuel = (code) => {
    setFuels((prev) =>
      prev.map((fuel) =>
        fuel.code === code
          ? {
              ...fuel,
              enabled: !fuel.enabled,
              tanks: fuel.tanks.length > 0 ? fuel.tanks : [createTank(fuel, 0)],
            }
          : fuel
      )
    );
  };

  const handleAddCustom = () => {
    const code = fuelCode(newFuel.code || newFuel.name);
    const name = text(newFuel.name);
    if (!code || !name) return;
    if (setupForm.fuels.some((fuel) => fuel.code === code)) return;

    addCustomFuel({ code, name, custom: true, capacity: 10000 });
    setNewFuel({ code: "", name: "" });
  };

  if (!setupForm.fuelCompanyKey) {
    return (
      <div className="wizard-transition">
        <p className="login-message">Select a fuel company before loading the fuel master.</p>
      </div>
    );
  }

  return (
    <div className="wizard-transition">
      <h3 style={{ marginTop: 0 }}>Available Fuels</h3>
      {setupForm.fuels.length > 0 ? (
        <div className="wizard-product-grid">
          {setupForm.fuels.map((fuel) => (
            <label key={fuel.key} className="wizard-product-card">
              <input
                type="checkbox"
                checked={fuel.enabled}
                onChange={() => toggleFuel(fuel.code)}
                disabled={disabled}
              />
              <div>
                <strong>{fuel.name}</strong>
                <span>{fuel.code}</span>
              </div>
              {fuel.custom && (
                <button
                  type="button"
                  className="wizard-btn-remove"
                  onClick={(event) => {
                    event.preventDefault();
                    removeCustomFuel(fuel.code);
                  }}
                  disabled={disabled}
                >
                  Remove
                </button>
              )}
            </label>
          ))}
        </div>
      ) : (
        <p className="login-message">Add custom fuels for this company.</p>
      )}

      <h3>Custom Fuel</h3>
      <div className="wizard-custom-product-form">
        <input
          className="ppm-input"
          placeholder="Code, e.g. BIO_DIESEL"
          value={newFuel.code}
          onChange={(e) => setNewFuel((fuel) => ({ ...fuel, code: e.target.value }))}
          disabled={disabled}
        />
        <input
          className="ppm-input"
          placeholder="Name, e.g. Custom Fuel"
          value={newFuel.name}
          onChange={(e) => setNewFuel((fuel) => ({ ...fuel, name: e.target.value }))}
          disabled={disabled}
        />
        <button
          type="button"
          className="ppm-btn ppm-btn-secondary"
          onClick={handleAddCustom}
          disabled={disabled}
        >
          Add Fuel
        </button>
      </div>
    </div>
  );
}

function ForecourtStep({ setupForm, setFuels, disabled }) {
  const fuels = selectedProducts(setupForm);

  const updateFuel = (code, updater) => {
    setFuels((prev) =>
      prev.map((fuel) => (fuel.code === code ? updater(fuel) : fuel))
    );
  };

  const setTankCount = (fuel, count) => {
    const nextCount = Math.min(Math.max(Number(count) || 1, 1), 40);
    updateFuel(fuel.code, (current) => {
      const tanks = [...current.tanks];
      while (tanks.length < nextCount) {
        tanks.push(createTank(current, tanks.length));
      }
      return { ...current, tanks: tanks.slice(0, nextCount) };
    });
  };

  const updateTank = (fuelCodeValue, tankIndex, field, value) => {
    updateFuel(fuelCodeValue, (current) => ({
      ...current,
      tanks: current.tanks.map((tank, index) =>
        index === tankIndex ? { ...tank, [field]: value } : tank
      ),
    }));
  };

  const setNozzleCount = (fuel, tankIndex, count) => {
    const nextCount = Math.min(Math.max(Number(count) || 1, 1), 32);
    updateFuel(fuel.code, (current) => ({
      ...current,
      tanks: current.tanks.map((tank, index) => {
        if (index !== tankIndex) return tank;
        const nozzles = [...tank.nozzles];
        while (nozzles.length < nextCount) {
          nozzles.push(createNozzle(fuel.code, tankIndex, nozzles.length));
        }
        return { ...tank, nozzles: nozzles.slice(0, nextCount) };
      }),
    }));
  };

  const updateNozzle = (fuelCodeValue, tankIndex, nozzleIndex, field, value) => {
    updateFuel(fuelCodeValue, (current) => ({
      ...current,
      tanks: current.tanks.map((tank, index) =>
        index === tankIndex
          ? {
              ...tank,
              nozzles: tank.nozzles.map((nozzle, innerIndex) =>
                innerIndex === nozzleIndex ? { ...nozzle, [field]: value } : nozzle
              ),
            }
          : tank
      ),
    }));
  };

  if (fuels.length === 0) {
    return (
      <div className="wizard-transition">
        <p className="login-message">Select at least one fuel before configuring tanks and nozzles.</p>
      </div>
    );
  }

  return (
    <div className="wizard-transition">
      {fuels.map((fuel) => (
        <section key={fuel.code} className="wizard-preview-card" style={{ marginBottom: 18 }}>
          <div className="wizard-preview-brand">
            <PetroSyncLogo compact />
            <div>
              <strong>{fuel.name}</strong>
              <span>{fuel.code}</span>
            </div>
          </div>

          <label className="wizard-field" style={{ maxWidth: 240 }}>
            <span>Number of Tanks</span>
            <input
              className="ppm-input"
              type="number"
              min="1"
              max="40"
              value={fuel.tanks.length}
              onChange={(e) => setTankCount(fuel, e.target.value)}
              disabled={disabled}
            />
          </label>

          {fuel.tanks.map((tank, tankIndex) => (
            <div key={tank.key} style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 14 }}>
              <div className="wizard-forecourt-row">
                <input
                  className="ppm-input"
                  placeholder="Tank Number"
                  value={tank.tankId}
                  onChange={(e) => updateTank(fuel.code, tankIndex, "tankId", e.target.value)}
                  disabled={disabled}
                />
                <input
                  className="ppm-input"
                  type="number"
                  min="1"
                  placeholder="Tank Capacity"
                  value={tank.capacity}
                  onChange={(e) => updateTank(fuel.code, tankIndex, "capacity", e.target.value)}
                  disabled={disabled}
                />
                <input
                  className="ppm-input"
                  placeholder="ATG ID (optional)"
                  value={tank.atgId}
                  onChange={(e) => updateTank(fuel.code, tankIndex, "atgId", e.target.value)}
                  disabled={disabled}
                />
              </div>

              <label className="wizard-field" style={{ maxWidth: 240, marginTop: 12 }}>
                <span>Number of Nozzles</span>
                <input
                  className="ppm-input"
                  type="number"
                  min="1"
                  max="32"
                  value={tank.nozzles.length}
                  onChange={(e) => setNozzleCount(fuel, tankIndex, e.target.value)}
                  disabled={disabled}
                />
              </label>

              {tank.nozzles.map((nozzle, nozzleIndex) => (
                <div key={nozzle.key} className="wizard-forecourt-row">
                  <input
                    className="ppm-input"
                    placeholder="Nozzle Number"
                    value={nozzle.nozzleId}
                    onChange={(e) =>
                      updateNozzle(fuel.code, tankIndex, nozzleIndex, "nozzleId", e.target.value)
                    }
                    disabled={disabled}
                  />
                  <input
                    className="ppm-input"
                    placeholder="Dispenser Number"
                    value={nozzle.dispenserId}
                    onChange={(e) =>
                      updateNozzle(fuel.code, tankIndex, nozzleIndex, "dispenserId", e.target.value)
                    }
                    disabled={disabled}
                  />
                  <input
                    className="ppm-input"
                    placeholder="Automation Mapping (optional)"
                    value={nozzle.automationId}
                    onChange={(e) =>
                      updateNozzle(fuel.code, tankIndex, nozzleIndex, "automationId", e.target.value)
                    }
                    disabled={disabled}
                  />
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function AccountStep({ setupForm, setOwnerField, disabled }) {
  const handleChange = (e) => setOwnerField(e.target.name, e.target.value);

  return (
    <div className="wizard-transition wizard-form-grid">
      <TextField
        label="First Name"
        name="firstName"
        value={setupForm.owner.firstName}
        onChange={handleChange}
        disabled={disabled}
      />
      <TextField
        label="Last Name"
        name="lastName"
        value={setupForm.owner.lastName}
        onChange={handleChange}
        disabled={disabled}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        value={setupForm.owner.email}
        onChange={handleChange}
        disabled={disabled}
      />
      <TextField
        label="Username"
        name="username"
        value={setupForm.owner.username}
        onChange={handleChange}
        disabled={disabled}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        value={setupForm.owner.password}
        onChange={handleChange}
        disabled={disabled}
      />
      <TextField
        label="Confirm Password"
        name="confirmPassword"
        type="password"
        value={setupForm.owner.confirmPassword}
        onChange={handleChange}
        disabled={disabled}
      />
      <label className="wizard-field" style={{ gridColumn: "1 / -1" }}>
        <span>Security Question</span>
        <input
          className="ppm-input"
          name="securityQuestion"
          value={setupForm.owner.securityQuestion}
          onChange={handleChange}
          disabled={disabled}
        />
      </label>
      <TextField
        label="Security Answer"
        name="securityAnswer"
        value={setupForm.owner.securityAnswer}
        onChange={handleChange}
        disabled={disabled}
      />
      <TextField
        label="Recovery Email"
        name="recoveryEmail"
        type="email"
        value={setupForm.owner.recoveryEmail}
        onChange={handleChange}
        disabled={disabled}
      />
      <TextField
        label="Recovery Phone"
        name="recoveryPhone"
        value={setupForm.owner.recoveryPhone}
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}

export default function LoginPage({
  setupStatus,
  onSetupComplete,
  onLogin,
  authMessage = "",
  pumpBranding,
}) {
  const isSetup = setupStatus.needsSetup;
  const [setupForm, setSetupForm] = React.useState(createInitialSetupForm);
  const [fuelMasterCompanies, setFuelMasterCompanies] = React.useState(fallbackFuelCompanies);
  const [activeStep, setActiveStep] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [messageTone, setMessageTone] = React.useState("info");
  const [loginForm, setLoginForm] = React.useState({ username: "", password: "" });
  const [loginTouched, setLoginTouched] = React.useState({
    username: false,
    password: false,
  });
  const [loginAttempted, setLoginAttempted] = React.useState(false);
  const [loginInteracted, setLoginInteracted] = React.useState(false);

  const theme = themes.indianOil;
  const activeStepKey = steps[activeStep]?.key;
  const activeStepMeta = steps[activeStep] || steps[0];
  const progressPercent = Math.round(((activeStep + 1) / steps.length) * 100);
  const errors = React.useMemo(() => stepErrors(activeStepKey, setupForm), [activeStepKey, setupForm]);
  const loginValidation = React.useMemo(
    () => validateLoginCredentials(loginForm),
    [loginForm]
  );
  const loginCardMessage = message || (!loginInteracted ? authMessage : "");
  const loginCardMessageTone = message
    ? "danger"
    : authMessage && /expired/i.test(authMessage)
      ? "warning"
      : "info";

  React.useEffect(() => {
    if (isSetup && setupStatus.message) {
      setMessage(setupStatus.message);
      setMessageTone("warning");
    }
  }, [isSetup, setupStatus.message]);

  React.useEffect(() => {
    setLoginInteracted(false);
  }, [authMessage]);

  React.useEffect(() => {
    let cancelled = false;

    if (!isSetup) {
      return () => {
        cancelled = true;
      };
    }

    backendApi
      .fuelMaster()
      .then((result) => {
        if (
          !cancelled &&
          result?.ok &&
          Array.isArray(result.companies) &&
          result.companies.length > 0
        ) {
          setFuelMasterCompanies(result.companies);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFuelMasterCompanies(fallbackFuelCompanies);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSetup]);

  const setPumpField = (name, value) => {
    setSetupForm((prev) => ({ ...prev, pump: { ...prev.pump, [name]: value } }));
  };

  const setOwnerField = (name, value) => {
    setSetupForm((prev) => ({ ...prev, owner: { ...prev.owner, [name]: value } }));
  };

  const setBusinessField = (name, value) => {
    setSetupForm((prev) => ({ ...prev, business: { ...prev.business, [name]: value } }));
  };

  const setFuelCompany = (companyKey) => {
    const company = fuelMasterCompanies.find((item) => item.key === companyKey);

    setSetupForm((prev) => ({
      ...prev,
      fuelCompanyKey: companyKey,
      pump: {
        ...prev.pump,
        company: company?.label || "",
      },
      fuels: company ? createCompanyFuels(company.key, fuelMasterCompanies) : [],
    }));
  };

  const setFuels = (updater) => {
    setSetupForm((prev) => ({
      ...prev,
      fuels: typeof updater === "function" ? updater(prev.fuels) : updater,
    }));
  };

  const addCustomFuel = (product) => {
    setSetupForm((prev) => ({
      ...prev,
      fuels: [...prev.fuels, createFuel(product, prev.fuels.length)],
    }));
  };

  const removeCustomFuel = (code) => {
    setSetupForm((prev) => ({
      ...prev,
      fuels: prev.fuels.filter((fuel) => fuel.code !== code || !fuel.custom),
    }));
  };

  const handleNext = () => {
    if (errors.length > 0) {
      setMessage("");
      return;
    }
    setMessage("");
    if (activeStep < steps.length - 1) {
      setActiveStep(activeStep + 1);
    }
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
      setMessage("");
    }
  };

  const handleSaveDraft = () => {
    setMessage("Draft retained in this browser session. No server changes are made until Finish.");
    setMessageTone("info");
  };

  const handleSetupSubmit = async (e) => {
    e.preventDefault();
    if (errors.length > 0) {
      setMessage("");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const payload = buildSetupPayload({ setupForm });
      const result = await backendApi.registerPump(payload);
      if (result.ok) {
        onSetupComplete(result);
      } else {
        setMessage(result.message || "Setup failed");
        setMessageTone("danger");
      }
    } catch (err) {
      setMessage(err.message || "Setup failed");
      setMessageTone("danger");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginInputChange = (e) => {
    const { name, value } = e.target;
    const limit = loginLimits[name] || 128;

    setLoginForm((prev) => ({
      ...prev,
      [name]: value.slice(0, limit),
    }));
    setLoginTouched((prev) => ({ ...prev, [name]: true }));
    setLoginInteracted(true);
    setMessage("");
    setMessageTone("info");
  };

  const handleLoginBlur = (e) => {
    const { name } = e.target;

    setLoginTouched((prev) => ({ ...prev, [name]: true }));

    if (name === "username") {
      setLoginForm((prev) => ({
        ...prev,
        username: text(prev.username).slice(0, loginLimits.username),
      }));
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginAttempted(true);
    setLoginInteracted(true);

    const normalizedLogin = {
      username: text(loginForm.username).slice(0, loginLimits.username),
      password: String(loginForm.password || "").slice(0, loginLimits.password),
    };
    const validation = validateLoginCredentials(normalizedLogin);
    setLoginForm(normalizedLogin);

    if (!validation.ok) {
      setMessage("Enter a valid username and password.");
      setMessageTone("danger");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const result = await backendApi.login(validation.values);
      if (result.ok) {
        onLogin(result);
      } else {
        setMessage(loginMessageForError(result));
        setMessageTone("danger");
      }
    } catch (err) {
      setMessage(loginMessageForError(err));
      setMessageTone("danger");
    } finally {
      setLoading(false);
    }
  };

  if (setupStatus.loading) {
    return (
      <main className="login-page" style={wizardTokens(theme)}>
        <WizardSkeleton />
      </main>
    );
  }

  if (!isSetup) {
    const showUsernameError =
      (loginTouched.username || loginAttempted) && loginValidation.errors.username;
    const showPasswordError =
      (loginTouched.password || loginAttempted) && loginValidation.errors.password;

    return (
      <main className="login-page split-hero-page login-enterprise-page" style={wizardTokens(theme)}>
        <div className="enterprise-login-shell">
          <aside className="enterprise-login-left" aria-label="PetroSync platform overview">
            <div className="enterprise-login-brand">
              <PetroSyncLogo logoDataUrl={pumpBranding?.logoDataUrl} />
              <div className="enterprise-login-heading">
                <span>PetroSync</span>
                <h1>Welcome to PetroSync</h1>
                <p>Enterprise Petrol Pump Management Platform</p>
              </div>
            </div>

            <FuelStationIllustration />

            <div className="enterprise-feature-grid" aria-label="PetroSync feature highlights">
              {loginFeatures.map((feature) => (
                <span key={feature}>{feature}</span>
              ))}
            </div>

            <footer className="enterprise-login-credit">
              <span>Developed by</span>
              <strong>Nairit Bhattacharya</strong>
            </footer>
          </aside>

          <section className="enterprise-login-right" aria-label="PetroSync sign in">
            <form className="login-card enterprise-login-card" onSubmit={handleLoginSubmit} noValidate>
              <div className="login-card-header">
                <PetroSyncLogo logoDataUrl={pumpBranding?.logoDataUrl} compact />
                <div>
                  <span>PetroSync</span>
                  <h2>Sign In</h2>
                  <p>Use your PetroSync account credentials.</p>
                </div>
              </div>

              {loginCardMessage && (
                <p className={`login-message ${loginCardMessageTone}`} role="status" aria-live="polite">
                  {loginCardMessage}
                </p>
              )}

              <label className={`login-field ${showUsernameError ? "invalid" : ""}`}>
                <span>Username</span>
                <input
                  id="login-username"
                  type="text"
                  name="username"
                  value={loginForm.username}
                  onChange={handleLoginInputChange}
                  onBlur={handleLoginBlur}
                  disabled={loading}
                  autoComplete="username"
                  minLength={3}
                  maxLength={loginLimits.username}
                  aria-label="Username"
                  aria-invalid={Boolean(showUsernameError)}
                  aria-describedby={showUsernameError ? "login-username-error" : undefined}
                  placeholder="Enter username"
                />
                {showUsernameError && (
                  <small id="login-username-error">{loginValidation.errors.username}</small>
                )}
              </label>

              <label className={`login-field ${showPasswordError ? "invalid" : ""}`}>
                <span>Password</span>
                <input
                  id="login-password"
                  type="password"
                  name="password"
                  value={loginForm.password}
                  onChange={handleLoginInputChange}
                  onBlur={handleLoginBlur}
                  disabled={loading}
                  autoComplete="current-password"
                  minLength={8}
                  maxLength={loginLimits.password}
                  aria-label="Password"
                  aria-invalid={Boolean(showPasswordError)}
                  aria-describedby={showPasswordError ? "login-password-error" : undefined}
                  placeholder="Enter password"
                />
                {showPasswordError && (
                  <small id="login-password-error">{loginValidation.errors.password}</small>
                )}
              </label>

              <button
                type="submit"
                className="enterprise-login-button"
                disabled={loading || !loginValidation.ok}
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="login-page onboarding-wizard" style={wizardTokens(theme)}>
      <header className="wizard-topbar">
        <div className="wizard-brand-lockup">
          <PetroSyncLogo logoDataUrl={pumpBranding?.logoDataUrl} />
          <div>
            <strong>PetroSync</strong>
            <span>Enterprise Petrol Pump Management Platform</span>
          </div>
        </div>
        <div className="wizard-progress-block" aria-label={`Step ${activeStep + 1} of ${steps.length}, ${progressPercent}% complete`}>
          <div>
            <strong>Step {activeStep + 1} of {steps.length}</strong>
            <span>{progressPercent}%</span>
          </div>
          <div className="wizard-progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin="0" aria-valuemax="100">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </header>

      <form className="wizard-shell" onSubmit={handleSetupSubmit}>
        <aside className="wizard-side">
          <div className="wizard-side-head">
            <h2>Onboarding Progress</h2>
            <span>{progressPercent}% complete</span>
          </div>
          <Stepper
            steps={steps}
            activeStep={activeStep}
            onStepClick={(idx) => setActiveStep(idx)}
            stepErrors={(key) => stepErrors(key, setupForm)}
          />
          <PreviewCard
            setupForm={setupForm}
            pumpBranding={pumpBranding}
            progressPercent={progressPercent}
          />
        </aside>

        <section className="wizard-panel">
          <header className="wizard-panel-head">
            <span className="wizard-panel-icon">
              <WizardIcon name={activeStepMeta.icon} />
            </span>
            <div>
              <span>Step {activeStep + 1} of {steps.length}</span>
              <h2>{activeStepMeta.label}</h2>
              <p>{activeStepMeta.description}</p>
            </div>
          </header>

          {message && (
            <p className={`login-message ${messageTone}`} role="status" aria-live="polite">
              {message}
            </p>
          )}

          <ValidationCard errors={errors} />

          <div className="wizard-step-body">
            {activeStepKey === "pump" && (
              <PumpDetailsStep
                setupForm={setupForm}
                setPumpField={setPumpField}
                setBusinessField={setBusinessField}
                disabled={loading}
              />
            )}
            {activeStepKey === "company" && (
              <FuelCompanyStep
                setupForm={setupForm}
                fuelCompanies={fuelMasterCompanies}
                setFuelCompany={setFuelCompany}
                disabled={loading}
              />
            )}
            {activeStepKey === "fuels" && (
              <FuelMasterStep
                setupForm={setupForm}
                setFuels={setFuels}
                addCustomFuel={addCustomFuel}
                removeCustomFuel={removeCustomFuel}
                disabled={loading}
              />
            )}
            {activeStepKey === "forecourt" && (
              <ForecourtStep
                setupForm={setupForm}
                setFuels={setFuels}
                disabled={loading}
              />
            )}
            {activeStepKey === "account" && (
              <AccountStep
                setupForm={setupForm}
                setOwnerField={setOwnerField}
                disabled={loading}
              />
            )}
          </div>

          <footer className="wizard-footer">
            <div className="wizard-footer-left">
              <button type="button" className="ppm-button neutral" onClick={handleBack} disabled={loading || activeStep === 0}>
                Back
              </button>
              <button type="button" className="ppm-button neutral" onClick={handleSaveDraft} disabled={loading}>
                Save Draft
              </button>
            </div>
            <div className="wizard-footer-right">
              {activeStep < steps.length - 1 ? (
                <button type="button" className="ppm-button primary" onClick={handleNext} disabled={loading}>
                  Save & Continue
                </button>
              ) : (
                <button type="submit" className="ppm-button primary" disabled={loading}>
                  {loading ? "Finishing..." : "Finish"}
                </button>
              )}
            </div>
          </footer>
        </section>
      </form>
    </main>
  );
}
