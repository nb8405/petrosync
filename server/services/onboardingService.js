const db = require("../db");
const onboardingRepository = require("../repositories/onboardingRepository");
const activityLogService = require("./activityLogService");
const auditService = require("./auditService");
const logger = require("./loggerService");
const userAccountService = require("./userAccountService");
const { roles } = require("../security/roles");
const { isArgon2Hash } = require("../utils/passwordHashing");

const text = (value) => String(value || "").trim();

const json = (value) => JSON.stringify(value ?? {});

const arrayJson = (value) => JSON.stringify(Array.isArray(value) ? value : []);

const parseJson = (value, fallback) => {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.display_name,
  role: user.role,
});

const workspaceDto = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    pumpName: row.pump_name,
    dealerName: row.dealer_name,
    company: row.company,
    outletType: row.outlet_type,
    state: row.state,
    district: row.district,
    address: row.address,
    contactNumber: row.contact_number,
    email: row.email,
    logoDataUrl: row.logo_data_url,
    themeKey: row.theme_key,
    financialYear: row.financial_year,
    gstConfiguration: parseJson(row.gst_configuration, {}),
    taxSettings: parseJson(row.tax_settings, {}),
    currency: row.currency,
    language: row.language,
    dateFormat: row.date_format,
    backupSettings: parseJson(row.backup_settings, {}),
    products: parseJson(row.products, []),
    staffRoles: parseJson(row.staff_roles, []),
    integrations: parseJson(row.integrations, {}),
    healthCheck: parseJson(row.health_check, {}),
    launchedAt: row.launched_at,
  };
};

const slugFuelCode = (value) =>
  text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const parseProducts = (products = [], fuelMasterProducts = []) => {
  const masterByCode = new Map(
    fuelMasterProducts.map((product) => [
      product.fuel_code,
      {
        id: product.id,
        code: product.fuel_code,
        name: product.fuel_name,
        custom: Boolean(product.custom),
      },
    ])
  );
  const selected = products
    .map((product) => (typeof product === "string" ? { code: product } : product))
    .map((product) => {
      const code = slugFuelCode(product.code || product.product || product.name);
      const masterProduct = masterByCode.get(code);
      return {
        code,
        name: text(product.name || product.label || masterProduct?.name || product.code) || code,
        custom: Boolean(product.custom || !masterProduct),
        fuelMasterProductId: masterProduct?.id || null,
      };
    })
    .filter((product) => product.code);

  const defaults = fuelMasterProducts
    .filter((product) => product.default_enabled !== false)
    .map((product) => ({
      code: product.fuel_code,
      name: product.fuel_name,
      custom: Boolean(product.custom),
      fuelMasterProductId: product.id,
    }));
  const merged = selected.length > 0 ? selected : defaults;
  const byCode = new Map();
  merged.forEach((product, index) => {
    byCode.set(product.code, {
      code: product.code,
      name: product.name || product.code,
      custom: Boolean(product.custom),
      fuelMasterProductId: product.fuelMasterProductId || null,
      sortOrder: index + 1,
    });
  });

  return [...byCode.values()];
};

const normalizeTank = (tank, index) => ({
  tankId: text(tank.tankId || tank.id || `T-${index + 1}`),
  capacity: Math.max(Number(tank.capacity || 0), 0),
  product: text(tank.product || tank.productType).toUpperCase(),
  automationId: text(tank.automationId),
  atgId: text(tank.atgId),
  atosId: text(tank.atosId),
});

const normalizeDispenser = (dispenser, index) => ({
  dispenserId: text(dispenser.dispenserId || dispenser.id || `D-${index + 1}`),
  manufacturer: text(dispenser.manufacturer) || "Other",
  model: text(dispenser.model),
  automationId: text(dispenser.automationId),
  atgId: text(dispenser.atgId),
  atosId: text(dispenser.atosId),
});

const normalizeNozzle = (nozzle, index) => ({
  nozzleId: text(nozzle.nozzleId || nozzle.id || `N-${index + 1}`),
  dispenserId: text(nozzle.dispenserId),
  product: text(nozzle.product || nozzle.mappedProduct).toUpperCase(),
  tankId: text(nozzle.tankId || nozzle.mappedTank),
  automationId: text(nozzle.automationId),
  atgId: text(nozzle.atgId),
  atosId: text(nozzle.atosId),
});

const defaultShiftTimes = {
  1: [["Shift 1", "06:00", "06:00"]],
  2: [
    ["Shift 1", "06:00", "18:00"],
    ["Shift 2", "18:00", "06:00"],
  ],
  3: [
    ["Morning Shift", "06:00", "14:00"],
    ["Evening Shift", "14:00", "22:00"],
    ["Night Shift", "22:00", "06:00"],
  ],
};

const normalizeShifts = (shiftStructure = {}) => {
  const count = Math.min(Math.max(Number(shiftStructure.count || 3), 1), 3);
  const custom = Array.isArray(shiftStructure.shifts) ? shiftStructure.shifts : [];
  const source = custom.length > 0
    ? custom
    : defaultShiftTimes[count].map(([shiftName, startTime, endTime]) => ({
        shiftName,
        startTime,
        endTime,
      }));

  return source.slice(0, count).map((shift, index) => ({
    shiftName: text(shift.shiftName || shift.name || `Shift ${index + 1}`),
    startTime: text(shift.startTime) || defaultShiftTimes[count][index]?.[1] || "06:00",
    endTime: text(shift.endTime) || defaultShiftTimes[count][index]?.[2] || "14:00",
  }));
};

const normalizeStaffRoles = (staffRoles = []) => {
  const selected = staffRoles
    .map((role) => {
      const normalized = text(role).toLowerCase();
      return roles.find((knownRole) => knownRole.toLowerCase() === normalized);
    })
    .filter(Boolean)
    .filter((role) => roles.includes(role));

  return [...new Set(["Owner", ...selected])];
};

const healthCheck = ({ products, tanks, dispensers, nozzles, staffRoles, integrations }) => {
  const checks = [
    ["Products", products.length > 0],
    ["Tanks", tanks.length > 0],
    ["Dispensers", dispensers.length > 0],
    ["Nozzles", nozzles.length > 0],
    ["Users", staffRoles.includes("Owner")],
    ["Integration", Boolean(integrations?.automationReady)],
  ];
  const completed = checks.filter(([, complete]) => complete).length;

  return {
    checks: Object.fromEntries(checks.map(([label, complete]) => [
      label,
      complete ? "Complete" : "Pending",
    ])),
    overallScore: Math.round((completed / checks.length) * 100),
  };
};

const validateSetup = ({ pump, owner, structure }) => {
  const missingPumpFields = [
    "pumpName",
    "dealerName",
    "company",
    "state",
    "district",
    "address",
    "contactNumber",
    "email",
  ].filter((field) => !text(pump?.[field]));

  if (missingPumpFields.length > 0) {
    return {
      ok: false,
      status: 400,
      message: `Pump registration is incomplete: ${missingPumpFields.join(", ")}.`,
    };
  }

  const missingOwnerFields = [
    "firstName",
    "lastName",
    "email",
    "username",
    "password",
    "confirmPassword",
    "securityQuestion",
    "recoveryEmail",
    "recoveryPhone",
  ].filter((field) => !text(owner?.[field]));

  if (missingOwnerFields.length > 0) {
    return {
      ok: false,
      status: 400,
      message: `Owner account is incomplete: ${missingOwnerFields.join(", ")}.`,
    };
  }

  if (owner.password !== owner.confirmPassword) {
    return {
      ok: false,
      status: 400,
      message: "Password and confirm password must match.",
    };
  }

  if (String(owner.password).length < 10) {
    return {
      ok: false,
      status: 400,
      message: "Password must be at least 10 characters.",
    };
  }

  if (!Array.isArray(structure?.tanks) || structure.tanks.length === 0) {
    return { ok: false, status: 400, message: "At least one tank is required." };
  }

  if (!Array.isArray(structure?.dispensers) || structure.dispensers.length === 0) {
    return { ok: false, status: 400, message: "At least one dispenser is required." };
  }

  if (!Array.isArray(structure?.nozzles) || structure.nozzles.length === 0) {
    return { ok: false, status: 400, message: "At least one nozzle is required." };
  }

  return { ok: true };
};

const getSetupStatus = async () => {
  const [users, workspace] = await Promise.all([
    onboardingRepository.listUsers(),
    onboardingRepository.latestWorkspace(),
  ]);
  const userCount = users.length;
  const nonArgon2Users = users.filter((user) => !isArgon2Hash(user.password_hash));
  const hasWorkspace = Boolean(workspace);
  const hasIncompleteOnboardingState =
    (userCount > 0 && !hasWorkspace) ||
    (userCount === 0 && hasWorkspace);

  return {
    ok: true,
    needsSetup:
      userCount === 0 ||
      nonArgon2Users.length > 0 ||
      hasIncompleteOnboardingState,
    userCount,
    hasWorkspace,
    blockedByLegacyPasswordHash: nonArgon2Users.length > 0,
    blockedByIncompleteOnboarding: hasIncompleteOnboardingState,
    message:
      nonArgon2Users.length > 0
        ? "Existing development owner uses a non-Argon2 password hash. Run onboarding again to recreate it."
        : hasIncompleteOnboardingState
          ? "Existing development onboarding data is incomplete. Run onboarding again to recreate the development setup."
        : undefined,
    workspace: workspaceDto(workspace),
  };
};

const getFuelMaster = async () => {
  const companies = await onboardingRepository.listFuelCompaniesWithProducts();

  return {
    ok: true,
    companies: companies.map((company) => ({
      key: company.company_key,
      label: company.display_name,
      products: (Array.isArray(company.products) ? company.products : []).map((product) => ({
        code: product.code,
        name: product.name,
        defaultEnabled: product.defaultEnabled !== false,
        custom: Boolean(product.custom),
        sortOrder: Number(product.sortOrder || 0),
      })),
    })),
  };
};

const resetDevelopmentOnboardingIfNeeded = async ({ client, users, workspace }) => {
  const nonArgon2Users = users.filter((user) => !isArgon2Hash(user.password_hash));
  const hasIncompleteOnboardingState =
    (users.length > 0 && !workspace) ||
    (users.length === 0 && workspace);

  if (nonArgon2Users.length === 0 && !hasIncompleteOnboardingState) {
    return false;
  }

  if (process.env.NODE_ENV === "production") {
    await client.query("ROLLBACK");
    return {
      ok: false,
      status: 409,
      message:
        nonArgon2Users.length > 0
          ? "Existing owner account uses a non-Argon2 password hash. Reset or migrate the database before onboarding."
          : "Existing onboarding data is incomplete. Reset or migrate the database before onboarding.",
    };
  }

  logger.warn("Resetting incomplete development onboarding data.", {
    module: "onboarding",
    nonArgon2Usernames: nonArgon2Users.map((user) => user.username),
    userCount: users.length,
    hasWorkspace: Boolean(workspace),
  });

  await onboardingRepository.resetDevelopmentOnboardingData(client);
  await activityLogService.logActivity({
    activityType: "onboarding_reset",
    moduleName: "onboarding",
    status: "success",
    message: "Development onboarding data was reset before recreating the first-run setup.",
    details: {
      userCount: users.length,
      nonArgon2Usernames: nonArgon2Users.map((user) => user.username),
      hadWorkspace: Boolean(workspace),
      reason: nonArgon2Users.length > 0 ? "non_argon2_user" : "incomplete_onboarding",
    },
  });

  return true;
};

const registerPumpWorkspace = async (payload) => {
  const pump = payload.pump || {};
  const owner = payload.owner || {};
  const structure = payload.structure || {};
  const business = payload.business || {};
  const backup = payload.backup || {};
  const validation = validateSetup({ pump, owner, structure });

  if (!validation.ok) {
    return validation;
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");
    const existingUsers = await onboardingRepository.listUsers(client);
    const existingWorkspace = await onboardingRepository.latestWorkspace(client);
    const resetResult = await resetDevelopmentOnboardingIfNeeded({
      client,
      users: existingUsers,
      workspace: existingWorkspace,
    });

    if (resetResult && resetResult.ok === false) {
      return resetResult;
    }

    const userCount = resetResult === true ? 0 : existingUsers.length;

    if (userCount > 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 409,
        message: "Pump registration is closed because an owner account already exists.",
      };
    }

    const fuelCompany = await onboardingRepository.findFuelCompany(
      client,
      text(pump.company)
    );
    const fuelMasterProducts = fuelCompany
      ? await onboardingRepository.listFuelMasterProducts(client, fuelCompany.id)
      : [];
    const products = parseProducts(structure.products, fuelMasterProducts);
    const productCodes = new Set(products.map((product) => product.code));
    const tanks = structure.tanks.map(normalizeTank);
    const dispensers = structure.dispensers.map(normalizeDispenser);
    const nozzles = structure.nozzles.map(normalizeNozzle);

    const invalidTanks = tanks.filter((tank) => !tank.tankId || !tank.product || !productCodes.has(tank.product));
    if (invalidTanks.length > 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 400,
        message: "Each tank must have a Tank ID and a configured product.",
      };
    }

    const dispenserIds = new Set(dispensers.map((dispenser) => dispenser.dispenserId));
    const tankIds = new Set(tanks.map((tank) => tank.tankId));
    const invalidNozzles = nozzles.filter(
      (nozzle) =>
        !nozzle.nozzleId ||
        !productCodes.has(nozzle.product) ||
        !tankIds.has(nozzle.tankId) ||
        !dispenserIds.has(nozzle.dispenserId)
    );

    if (invalidNozzles.length > 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 400,
        message: "Each nozzle must map to a configured dispenser, tank and product.",
      };
    }

    if (products.length === 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 400,
        message: "At least one configured fuel product is required.",
      };
    }

    const displayName = `${text(owner.firstName)} ${text(owner.lastName)}`.trim();
    const userResult = await userAccountService.createUserWithPassword({
      client,
      username: text(owner.username),
      password: owner.password,
      displayName,
      role: "Owner",
      firstName: text(owner.firstName),
      lastName: text(owner.lastName),
      email: text(owner.email),
      recoveryEmail: text(owner.recoveryEmail),
      recoveryPhone: text(owner.recoveryPhone),
      securityQuestion: text(owner.securityQuestion),
      securityAnswer: text(owner.securityAnswer),
    });
    const ownerUser = userResult.rows[0];

    await onboardingRepository.clearSeededForecourt(client);

    const tankIdMap = new Map();
    for (const tank of tanks) {
      const result = await onboardingRepository.createTank(client, tank);
      tankIdMap.set(tank.tankId, result.rows[0].id);
    }

    const dispenserIdMap = new Map();
    for (const dispenser of dispensers) {
      const result = await onboardingRepository.createDispenser(client, dispenser);
      dispenserIdMap.set(dispenser.dispenserId, result.rows[0].id);
    }

    for (const nozzle of nozzles) {
      await onboardingRepository.createNozzle(client, {
        ...nozzle,
        pumpId: dispenserIdMap.get(nozzle.dispenserId),
        tankPk: tankIdMap.get(nozzle.tankId),
      });
    }

    const shifts = normalizeShifts(structure.shiftStructure);
    for (const shift of shifts) {
      await onboardingRepository.createShift(client, shift);
    }

    const staffRoles = normalizeStaffRoles(structure.staffRoles);
    const integrations = {
      automationReady: true,
      tankIds: tanks.map((tank) => tank.tankId),
      dispenserIds: dispensers.map((dispenser) => dispenser.dispenserId),
      nozzleIds: nozzles.map((nozzle) => nozzle.nozzleId),
      automationIds: [
        ...tanks.map((tank) => tank.automationId),
        ...dispensers.map((dispenser) => dispenser.automationId),
        ...nozzles.map((nozzle) => nozzle.automationId),
      ].filter(Boolean),
      atgIds: [
        ...tanks.map((tank) => tank.atgId),
        ...dispensers.map((dispenser) => dispenser.atgId),
        ...nozzles.map((nozzle) => nozzle.atgId),
      ].filter(Boolean),
      atosIds: [
        ...tanks.map((tank) => tank.atosId),
        ...dispensers.map((dispenser) => dispenser.atosId),
        ...nozzles.map((nozzle) => nozzle.atosId),
      ].filter(Boolean),
    };
    const check = healthCheck({ products, tanks, dispensers, nozzles, staffRoles, integrations });

    const workspaceResult = await onboardingRepository.createWorkspace(client, {
      pumpName: text(pump.pumpName),
      dealerName: text(pump.dealerName),
      company: text(pump.company),
      outletType: text(pump.outletType),
      state: text(pump.state),
      district: text(pump.district),
      address: text(pump.address),
      contactNumber: text(pump.contactNumber),
      email: text(pump.email),
      logoDataUrl: text(pump.logoDataUrl),
      themeKey: text(pump.themeKey) || "indianOil",
      financialYear: text(business.financialYear),
      gstConfiguration: json({
        enabled: Boolean(business.gstEnabled),
        gstin: text(business.gstin),
      }),
      taxSettings: json({
        gstEnabled: Boolean(business.gstEnabled),
        taxMode: text(business.taxMode) || "standard",
      }),
      currency: text(business.currency) || "INR",
      language: text(business.language) || "English",
      dateFormat: text(business.dateFormat) || "DD-MM-YYYY",
      backupSettings: json({
        enabled: Boolean(backup.enabled),
        frequency: text(backup.frequency) || "daily",
        destination: text(backup.destination) || "local",
      }),
      products: arrayJson(products),
      staffRoles: arrayJson(staffRoles),
      integrations: json(integrations),
      healthCheck: json(check),
      createdBy: ownerUser.id,
    });
    const workspace = workspaceResult.rows[0];

    for (const product of products) {
      await onboardingRepository.createWorkspaceFuel(client, {
        workspaceId: workspace.id,
        companyId: fuelCompany?.id || null,
        fuelMasterProductId: product.fuelMasterProductId,
        fuelCode: product.code,
        fuelName: product.name,
        enabled: true,
        custom: product.custom,
        sortOrder: product.sortOrder,
      });
    }

    await onboardingRepository.upsertStationSetting(client, {
      key: "station",
      section: "Station Settings",
      value: json({
        stationName: text(pump.pumpName),
        pumpName: text(pump.pumpName),
        dealerName: text(pump.dealerName),
        company: text(pump.company),
        outletType: text(pump.outletType),
        state: text(pump.state),
        district: text(pump.district),
        address: text(pump.address),
        contactNumber: text(pump.contactNumber),
        email: text(pump.email),
        logoDataUrl: text(pump.logoDataUrl),
        themeKey: text(pump.themeKey) || "indianOil",
      }),
      updatedBy: ownerUser.id,
    });
    await onboardingRepository.upsertStationSetting(client, {
      key: "business",
      section: "Business Settings",
      value: json({
        financialYear: text(business.financialYear),
        currency: text(business.currency) || "INR",
        language: text(business.language) || "English",
        dateFormat: text(business.dateFormat) || "DD-MM-YYYY",
      }),
      updatedBy: ownerUser.id,
    });
    await onboardingRepository.upsertStationSetting(client, {
      key: "tax",
      section: "Tax Settings",
      value: json({
        gstEnabled: Boolean(business.gstEnabled),
        gstin: text(business.gstin),
        taxMode: text(business.taxMode) || "standard",
      }),
      updatedBy: ownerUser.id,
    });
    await onboardingRepository.upsertStationSetting(client, {
      key: "receipt",
      section: "Receipt Settings",
      value: json({
        printHeader: text(pump.pumpName),
        showGst: Boolean(business.gstEnabled),
        logoDataUrl: text(pump.logoDataUrl),
      }),
      updatedBy: ownerUser.id,
    });
    await onboardingRepository.upsertStationSetting(client, {
      key: "backup",
      section: "Backup Settings",
      value: json({
        enabled: Boolean(backup.enabled),
        frequency: text(backup.frequency) || "daily",
        destination: text(backup.destination) || "local",
      }),
      updatedBy: ownerUser.id,
    });
    await onboardingRepository.upsertStationSetting(client, {
      key: "guided_tour",
      section: "Onboarding",
      value: json({ pending: true }),
      updatedBy: ownerUser.id,
    });

    await client.query("COMMIT");

    await Promise.all([
      auditService.logAudit({
        actionType: "created",
        moduleName: "onboarding",
        entityType: "pump_workspace",
        entityId: String(workspace.id),
        details: {
          pumpName: workspace.pump_name,
          ownerId: ownerUser.id,
          healthScore: check.overallScore,
        },
      }),
      activityLogService.logActivity({
        activityType: "onboarding_launch",
        moduleName: "onboarding",
        status: "success",
        message: "Pump workspace launched.",
        details: {
          pumpName: workspace.pump_name,
          ownerId: ownerUser.id,
        },
      }),
    ]);

    return {
      ok: true,
      message: "Pump workspace launched. Sign in with your owner account.",
      workspace: workspaceDto(workspace),
      user: publicUser(ownerUser),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    if (error.code === "23505") {
      return {
        ok: false,
        status: 409,
        message: "A username, tank, dispenser or nozzle with this ID already exists.",
      };
    }

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getSetupStatus,
  getFuelMaster,
  registerPumpWorkspace,
  workspaceDto,
};
