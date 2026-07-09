const db = require("../db");
const { keyForCode } = require("../utils/reportConfig");

const text = (value) => String(value || "").trim();

const fuelCode = (value) =>
  text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const latestWorkspace = async () => {
  const result = await db.query(
    `
      SELECT id
      FROM pump_workspaces
      ORDER BY created_at DESC
      LIMIT 1;
    `
  );

  return result.rows[0] || null;
};

const listWorkspaceFuels = async () => {
  const result = await db.query(
    `
      SELECT
        wf.*,
        fc.display_name AS company_name,
        fmp.fuel_name AS master_fuel_name
      FROM workspace_fuels wf
      LEFT JOIN fuel_companies fc ON fc.id = wf.company_id
      LEFT JOIN fuel_master_products fmp ON fmp.id = wf.fuel_master_product_id
      ORDER BY wf.sort_order ASC, wf.fuel_name ASC;
    `
  );

  return {
    ok: true,
    rows: result.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      companyId: row.company_id,
      companyName: row.company_name,
      fuelMasterProductId: row.fuel_master_product_id,
      code: row.fuel_code,
      priceKey: keyForCode(row.fuel_code),
      name: row.fuel_name,
      enabled: row.enabled,
      custom: row.custom,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
};

const createWorkspaceFuel = async ({ fuelCode: requestedCode, fuelName }) => {
  const workspace = await latestWorkspace();

  if (!workspace) {
    return {
      ok: false,
      status: 409,
      message: "Create a pump workspace before adding fuels.",
    };
  }

  const code = fuelCode(requestedCode || fuelName);
  const name = text(fuelName);

  if (!code || !name) {
    return {
      ok: false,
      status: 400,
      message: "Fuel code and name are required.",
    };
  }

  const orderResult = await db.query(
    "SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM workspace_fuels WHERE workspace_id = $1;",
    [workspace.id]
  );

  try {
    const result = await db.query(
      `
        INSERT INTO workspace_fuels (
          workspace_id,
          fuel_code,
          fuel_name,
          enabled,
          custom,
          sort_order
        )
        VALUES ($1, $2, $3, true, true, $4)
        RETURNING *;
      `,
      [workspace.id, code, name, orderResult.rows[0]?.next_order || 10]
    );

    return {
      ok: true,
      row: result.rows[0],
    };
  } catch (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        status: 409,
        message: "This fuel already exists for the workspace.",
      };
    }

    throw error;
  }
};

const updateWorkspaceFuel = async ({ id, fuelName, enabled }) => {
  const current = await db.query(
    "SELECT * FROM workspace_fuels WHERE id = $1;",
    [id]
  );
  const existing = current.rows[0];

  if (!existing) {
    return {
      ok: false,
      status: 404,
      message: "Fuel was not found.",
    };
  }

  const nextName = text(fuelName || existing.fuel_name);

  if (!existing.custom && nextName !== existing.fuel_name) {
    return {
      ok: false,
      status: 400,
      message: "Only custom fuels can be renamed.",
    };
  }

  const result = await db.query(
    `
      UPDATE workspace_fuels
      SET
        fuel_name = $2,
        enabled = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `,
    [
      id,
      nextName,
      enabled === undefined ? existing.enabled : Boolean(enabled),
    ]
  );

  return {
    ok: true,
    row: result.rows[0],
  };
};

module.exports = {
  listWorkspaceFuels,
  createWorkspaceFuel,
  updateWorkspaceFuel,
};
