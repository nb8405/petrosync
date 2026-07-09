const db = require("../db");

const buildProductFilter = (productCodes, params) => {
  if (!productCodes || productCodes.length === 0) {
    return "";
  }

  params.push(productCodes);
  return `AND p.product_code = ANY($${params.length})`;
};

const getReportRows = async ({ fromDate, toDate, productCodes = null }) => {
  const params = [fromDate, toDate];
  const productFilter = buildProductFilter(productCodes, params);

  const productRowsQuery = `
    SELECT
      p.product_code,
      p.product_label,
      MIN(r.dsr_date) AS first_record_date,
      MAX(r.dsr_date) AS last_record_date,
      (ARRAY_AGG(p.opening_reading ORDER BY r.dsr_date ASC))[1] AS opening_reading,
      (ARRAY_AGG(p.closing_reading ORDER BY r.dsr_date DESC))[1] AS closing_reading,
      SUM(p.testing_qty) AS testing_qty,
      SUM(p.receipt_qty) AS receipt_qty,
      (ARRAY_AGG(p.tank_dip ORDER BY r.dsr_date DESC))[1] AS tank_dip,
      (ARRAY_AGG(p.water_dip ORDER BY r.dsr_date DESC))[1] AS water_dip,
      SUM(p.sales_liters) AS sales_liters,
      MAX(p.rate) AS rate,
      SUM(p.amount) AS amount,
      (ARRAY_AGG(p.closing_stock ORDER BY r.dsr_date DESC))[1] AS closing_stock
    FROM dsr_records r
    JOIN dsr_product_rows p ON p.dsr_record_id = r.id
    WHERE r.dsr_date BETWEEN $1 AND $2
      ${productFilter}
    GROUP BY p.product_code, p.product_label
    ORDER BY p.product_code;
  `;

  const collectionsQuery = `
    SELECT
      c.collection_type,
      SUM(c.amount) AS amount
    FROM dsr_records r
    JOIN dsr_collections c ON c.dsr_record_id = r.id
    WHERE r.dsr_date BETWEEN $1 AND $2
    GROUP BY c.collection_type;
  `;

  const expensesQuery = `
    SELECT
      e.expense_type,
      SUM(e.amount) AS amount
    FROM dsr_records r
    JOIN dsr_expenses e ON e.dsr_record_id = r.id
    WHERE r.dsr_date BETWEEN $1 AND $2
    GROUP BY e.expense_type;
  `;

  const recordCountQuery = `
    SELECT COUNT(*)::int AS record_count
    FROM dsr_records
    WHERE dsr_date BETWEEN $1 AND $2;
  `;

  const [productRows, collections, expenses, recordCount] =
    await Promise.all([
      db.query(productRowsQuery, params),
      db.query(collectionsQuery, [fromDate, toDate]),
      db.query(expensesQuery, [fromDate, toDate]),
      db.query(recordCountQuery, [fromDate, toDate]),
    ]);

  return {
    productRows: productRows.rows,
    collections: collections.rows,
    expenses: expenses.rows,
    recordCount: recordCount.rows[0]?.record_count || 0,
  };
};

const getDailyRecords = async ({ fromDate, toDate }) => {
  const result = await db.query(
    `
      SELECT dsr_date
      FROM dsr_records
      WHERE dsr_date BETWEEN $1 AND $2
      ORDER BY dsr_date ASC;
    `,
    [fromDate, toDate]
  );

  return result.rows;
};

const getHistoryRecords = async ({ fromDate, toDate, productCodes = null }) => {
  const params = [fromDate, toDate];
  let productFilter = "";

  if (productCodes && productCodes.length > 0) {
    params.push(productCodes);
    productFilter = `AND p.product_code = ANY($${params.length})`;
  }

  const includeEmptyRecords = !productCodes || productCodes.length === 0;
  params.push(includeEmptyRecords);
  const includeEmptyRecordsPlaceholder = `$${params.length}`;

  const result = await db.query(
    `
      SELECT
        r.id,
        r.dsr_date,
        r.dsr_number,
        r.created_at,
        r.updated_at,
        COALESCE(
          (audit.details->>'username'),
          (audit.details->>'userId'),
          NULL
        ) AS created_by,
        COUNT(DISTINCT p.product_code)::int AS product_count,
        COALESCE(SUM(p.sales_liters), 0) AS total_liters,
        COALESCE(SUM(p.amount), 0) AS total_amount,
        jsonb_object_agg(
          p.product_code,
          jsonb_build_object(
            'product_label', p.product_label,
            'sales_liters', p.sales_liters,
            'amount', p.amount
          )
          ORDER BY p.product_code
        ) FILTER (WHERE p.product_code IS NOT NULL) AS products
      FROM dsr_records r
      LEFT JOIN dsr_product_rows p ON p.dsr_record_id = r.id
        ${productFilter}
      LEFT JOIN LATERAL (
        SELECT a.details
        FROM audit_logs a
        WHERE a.module_name = 'dsr'
          AND a.action_type = 'created'
          AND a.entity_type = 'dsr_record'
          AND a.entity_id = r.id::text
        ORDER BY a.created_at ASC
        LIMIT 1
      ) audit ON true
      WHERE r.dsr_date BETWEEN $1 AND $2
      GROUP BY r.id, r.dsr_date, r.dsr_number, r.created_at, r.updated_at, audit.details
      HAVING COUNT(p.product_code) > 0 OR ${includeEmptyRecordsPlaceholder}::boolean = true
      ORDER BY r.dsr_date DESC;
    `,
    params
  );

  return result.rows;
};

const getProductSalesBreakdown = async ({ fromDate, toDate, period = "day" }) => {
  const periodExpression =
    period === "month" ? "DATE_TRUNC('month', r.dsr_date)::date" : "r.dsr_date";

  const result = await db.query(
    `
      SELECT
        ${periodExpression} AS period_start,
        p.product_code,
        SUM(p.sales_liters) AS sales_liters,
        SUM(p.amount) AS amount
      FROM dsr_records r
      JOIN dsr_product_rows p ON p.dsr_record_id = r.id
      WHERE r.dsr_date BETWEEN $1 AND $2
      GROUP BY period_start, p.product_code
      ORDER BY period_start ASC, p.product_code ASC;
    `,
    [fromDate, toDate]
  );

  return result.rows;
};

const getDsrByDate = async (dsrDate) => {
  const records = await db.query(
    "SELECT * FROM dsr_records WHERE dsr_date = $1",
    [dsrDate]
  );

  if (records.rows.length === 0) {
    return null;
  }

  const record = records.rows[0];
  const [products, collections, expenses] = await Promise.all([
    db.query(
      "SELECT * FROM dsr_product_rows WHERE dsr_record_id = $1 ORDER BY product_code",
      [record.id]
    ),
    db.query(
      "SELECT * FROM dsr_collections WHERE dsr_record_id = $1 ORDER BY collection_type",
      [record.id]
    ),
    db.query(
      "SELECT * FROM dsr_expenses WHERE dsr_record_id = $1 ORDER BY expense_type",
      [record.id]
    ),
  ]);

  return {
    ...record,
    products: products.rows,
    collections: collections.rows,
    expenses: expenses.rows,
  };
};

const createDsr = async (payload, dsrNumber = null) => {
  await db.query("BEGIN");
  try {
    const recordResult = await db.query(
      `
        INSERT INTO dsr_records (dsr_date, dsr_number)
        VALUES ($1, $2)
        RETURNING *;
      `,
      [payload.dsrDate, dsrNumber]
    );
    const record = recordResult.rows[0];

    await replaceDsrChildren(record.id, payload);
    await db.query("COMMIT");

    return getDsrByDate(payload.dsrDate);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
};

const updateDsr = async (dsrDate, payload) => {
  await db.query("BEGIN");
  try {
    const recordResult = await db.query(
      `
        UPDATE dsr_records
        SET updated_at = NOW()
        WHERE dsr_date = $1
        RETURNING *;
      `,
      [dsrDate]
    );

    if (recordResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return null;
    }

    const record = recordResult.rows[0];
    await db.query("DELETE FROM dsr_product_rows WHERE dsr_record_id = $1", [
      record.id,
    ]);
    await db.query("DELETE FROM dsr_collections WHERE dsr_record_id = $1", [
      record.id,
    ]);
    await db.query("DELETE FROM dsr_expenses WHERE dsr_record_id = $1", [
      record.id,
    ]);
    await replaceDsrChildren(record.id, payload);
    await db.query("COMMIT");

    return getDsrByDate(dsrDate);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
};

const deleteDsr = async (dsrDate) => {
  const result = await db.query(
    "DELETE FROM dsr_records WHERE dsr_date = $1 RETURNING *",
    [dsrDate]
  );

  return result.rows[0] || null;
};

const replaceDsrChildren = async (recordId, payload) => {
  for (const product of payload.products || []) {
    await db.query(
      `
        INSERT INTO dsr_product_rows (
          dsr_record_id,
          product_code,
          product_label,
          opening_reading,
          closing_reading,
          testing_qty,
          receipt_qty,
          tank_dip,
          water_dip,
          sales_liters,
          rate,
          amount,
          closing_stock
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
      `,
      [
        recordId,
        product.productCode,
        product.productLabel,
        product.openingReading || 0,
        product.closingReading || 0,
        product.testingQty || 0,
        product.receiptQty || 0,
        product.tankDip || 0,
        product.waterDip || 0,
        product.salesLiters || 0,
        product.rate || 0,
        product.amount || 0,
        product.closingStock || 0,
      ]
    );
  }

  for (const collection of payload.collections || []) {
    await db.query(
      `
        INSERT INTO dsr_collections (
          dsr_record_id,
          collection_type,
          amount
        )
        VALUES ($1, $2, $3);
      `,
      [recordId, collection.collectionType, collection.amount || 0]
    );
  }

  for (const expense of payload.expenses || []) {
    await db.query(
      `
        INSERT INTO dsr_expenses (
          dsr_record_id,
          expense_type,
          amount
        )
        VALUES ($1, $2, $3);
      `,
      [recordId, expense.expenseType, expense.amount || 0]
    );
  }
};

module.exports = {
  getReportRows,
  getDailyRecords,
  getHistoryRecords,
  getProductSalesBreakdown,
  getDsrByDate,
  createDsr,
  updateDsr,
  deleteDsr,
};
