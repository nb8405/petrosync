const db = require("../db");
const userRepository = require("./userRepository");

const query = (client, text, params) =>
  client && client.query ? client.query(text, params) : db.query(text, params);

const listUsers = (client = db) => userRepository.listUsers(client);

const latestWorkspace = async (client = db) => {
  const result = await query(
    client,
    `
      SELECT *
      FROM pump_workspaces
      ORDER BY created_at DESC
      LIMIT 1;
    `
  );

  return result.rows[0] || null;
};

const findFuelCompany = async (client, company) => {
  const result = await query(
    client,
    `
      SELECT *
      FROM fuel_companies
      WHERE active = true
        AND (
          LOWER(company_key) = LOWER($1)
          OR LOWER(display_name) = LOWER($1)
          OR POSITION(LOWER($1) IN LOWER(display_name)) > 0
        )
      LIMIT 1;
    `,
    [company]
  );

  return result.rows[0] || null;
};

const listFuelMasterProducts = async (client, companyId) => {
  const result = await query(
    client,
    `
      SELECT *
      FROM fuel_master_products
      WHERE company_id = $1
        AND active = true
      ORDER BY sort_order ASC, fuel_name ASC;
    `,
    [companyId]
  );

  return result.rows;
};

const listFuelCompaniesWithProducts = async (client = db) => {
  const result = await query(
    client,
    `
      SELECT
        company.id,
        company.company_key,
        company.display_name,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', product.id,
              'code', product.fuel_code,
              'name', product.fuel_name,
              'defaultEnabled', product.default_enabled,
              'custom', product.custom,
              'sortOrder', product.sort_order
            )
            ORDER BY product.sort_order ASC, product.fuel_name ASC
          ) FILTER (WHERE product.id IS NOT NULL),
          '[]'::json
        ) AS products
      FROM fuel_companies company
      LEFT JOIN fuel_master_products product
        ON product.company_id = company.id
        AND product.active = true
      WHERE company.active = true
      GROUP BY company.id, company.company_key, company.display_name
      ORDER BY company.id ASC;
    `
  );

  return result.rows;
};

const resetDevelopmentOnboardingData = (client) =>
  query(
    client,
    `
      TRUNCATE TABLE
        app_users,
        pump_workspaces,
        forecourt_tanks,
        forecourt_pumps,
        forecourt_nozzles,
        shift_configs,
        station_settings
      RESTART IDENTITY CASCADE;
    `
  );

const createWorkspace = (client, workspace) =>
  query(
    client,
    `
      INSERT INTO pump_workspaces (
        pump_name,
        dealer_name,
        company,
        outlet_type,
        state,
        district,
        address,
        contact_number,
        email,
        logo_data_url,
        theme_key,
        financial_year,
        gst_configuration,
        tax_settings,
        currency,
        language,
        date_format,
        backup_settings,
        products,
        staff_roles,
        integrations,
        health_check,
        launched_at,
        created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, NOW(), $23
      )
      RETURNING *;
    `,
    [
      workspace.pumpName,
      workspace.dealerName,
      workspace.company,
      workspace.outletType || null,
      workspace.state,
      workspace.district,
      workspace.address,
      workspace.contactNumber,
      workspace.email,
      workspace.logoDataUrl || null,
      workspace.themeKey || "indianOil",
      workspace.financialYear || null,
      workspace.gstConfiguration,
      workspace.taxSettings,
      workspace.currency || "INR",
      workspace.language || "English",
      workspace.dateFormat || "DD-MM-YYYY",
      workspace.backupSettings,
      workspace.products,
      workspace.staffRoles,
      workspace.integrations,
      workspace.healthCheck,
      workspace.createdBy || null,
    ]
  );

const createWorkspaceFuel = (client, fuel) =>
  query(
    client,
    `
      INSERT INTO workspace_fuels (
        workspace_id,
        company_id,
        fuel_master_product_id,
        fuel_code,
        fuel_name,
        enabled,
        custom,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (workspace_id, fuel_code)
      DO UPDATE SET
        company_id = EXCLUDED.company_id,
        fuel_master_product_id = EXCLUDED.fuel_master_product_id,
        fuel_name = EXCLUDED.fuel_name,
        enabled = EXCLUDED.enabled,
        custom = EXCLUDED.custom,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      fuel.workspaceId,
      fuel.companyId || null,
      fuel.fuelMasterProductId || null,
      fuel.fuelCode,
      fuel.fuelName,
      fuel.enabled !== false,
      Boolean(fuel.custom),
      fuel.sortOrder || 0,
    ]
  );

const upsertStationSetting = (client, { key, section, value, updatedBy = null }) =>
  query(
    client,
    `
      INSERT INTO station_settings (setting_key, section, value, updated_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (setting_key)
      DO UPDATE SET
        section = EXCLUDED.section,
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *;
    `,
    [key, section, value, updatedBy]
  );

const clearSeededForecourt = async (client) => {
  await query(client, "DELETE FROM forecourt_nozzles;");
  await query(client, "DELETE FROM forecourt_pumps;");
  await query(client, "DELETE FROM forecourt_tanks;");
  await query(client, "DELETE FROM shift_configs;");
};

const createTank = (client, tank) =>
  query(
    client,
    `
      INSERT INTO forecourt_tanks (
        tank_number,
        product_type,
        capacity,
        current_stock,
        reorder_level,
        automation_id,
        atg_id,
        atos_id
      )
      VALUES ($1, $2, $3, 0, 0, $4, $5, $6)
      RETURNING *;
    `,
    [
      tank.tankId,
      tank.product,
      tank.capacity,
      tank.automationId || null,
      tank.atgId || null,
      tank.atosId || null,
    ]
  );

const createDispenser = (client, dispenser) =>
  query(
    client,
    `
      INSERT INTO forecourt_pumps (
        pump_number,
        manufacturer,
        model,
        status,
        automation_id,
        atg_id,
        atos_id
      )
      VALUES ($1, $2, $3, 'Offline', $4, $5, $6)
      RETURNING *;
    `,
    [
      dispenser.dispenserId,
      dispenser.manufacturer || "Other",
      dispenser.model || null,
      dispenser.automationId || null,
      dispenser.atgId || null,
      dispenser.atosId || null,
    ]
  );

const createNozzle = (client, nozzle) =>
  query(
    client,
    `
      INSERT INTO forecourt_nozzles (
        pump_id,
        nozzle_number,
        product_type,
        tank_id,
        automation_id,
        atg_id,
        atos_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `,
    [
      nozzle.pumpId,
      nozzle.nozzleId,
      nozzle.product,
      nozzle.tankPk || null,
      nozzle.automationId || null,
      nozzle.atgId || null,
      nozzle.atosId || null,
    ]
  );

const createShift = (client, shift) =>
  query(
    client,
    `
      INSERT INTO shift_configs (shift_name, start_time, end_time)
      VALUES ($1, $2, $3)
      ON CONFLICT (shift_name)
      DO UPDATE SET
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        updated_at = NOW()
      RETURNING *;
    `,
    [shift.shiftName, shift.startTime, shift.endTime]
  );

module.exports = {
  listUsers,
  latestWorkspace,
  findFuelCompany,
  listFuelMasterProducts,
  listFuelCompaniesWithProducts,
  resetDevelopmentOnboardingData,
  createWorkspace,
  createWorkspaceFuel,
  upsertStationSetting,
  clearSeededForecourt,
  createTank,
  createDispenser,
  createNozzle,
  createShift,
};
