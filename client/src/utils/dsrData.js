export const emptyFuelPrices = {};

export const productConfig = [];

const collectionDefaults = {
  cash: "",
  upi: "",
  card: "",
  fleet: "",
  credit: "",
};

const expenseDefaults = {
  generator: "",
  staff: "",
  cleaning: "",
  maintenance: "",
};

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const fieldKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const productLabel = (product) =>
  String(product?.name || product?.label || product?.fuelName || product?.code || "")
    .trim();

const productCode = (product) =>
  normalizeCode(product?.code || product?.product || product?.fuelCode || product?.name);

const rowProductType = (row) =>
  normalizeCode(row?.product_type || row?.productType || row?.product || row?.fuelType);

const rowTankId = (row) => row?.tank_id ?? row?.tankId ?? row?.tankPk;

const configForProductTank = ({ product, tank, nozzles, tankIndex }) => {
  const code = productCode(product);
  const key = fieldKey(code || productLabel(product));
  const label = productLabel(product) || code;
  const tankNumber = tank?.tank_number || tank?.tankNumber || tank?.tankId || tank?.id;
  const prefix =
    tankNumber && tankIndex > 0
      ? `${key}_tank_${tankIndex + 1}`
      : key;
  const nozzleNames = nozzles.length > 0
    ? nozzles.map((nozzle) => String(nozzle.nozzle_number || nozzle.nozzleNumber || nozzle.nozzleId || nozzle.id))
    : [`${label}-1`];

  return {
    label: tankNumber ? `${label} ${tankNumber}` : label,
    productKey: key,
    fuelType: label,
    prefix,
    tankName: tankNumber ? `Tank ${tankNumber}` : `${label} Tank`,
    tankCapacity: Number(tank?.capacity || product?.capacity || 0),
    dipField: `${prefix}TankDip`,
    dipLabel: `${label} Tank Dip`,
    waterDipField: `${prefix}WaterDip`,
    nozzles: nozzleNames,
    priceKey: key,
  };
};

export const productConfigFromWorkspace = (workspace, forecourt = {}) => {
  const products = Array.isArray(workspace?.products)
    ? workspace.products.filter((product) => product?.enabled !== false)
    : [];

  if (products.length === 0) {
    return [];
  }

  const tanks = Array.isArray(forecourt.tanks) ? forecourt.tanks : [];
  const nozzles = Array.isArray(forecourt.nozzles) ? forecourt.nozzles : [];
  const dynamicConfig = [];

  products.forEach((product, productIndex) => {
    const code = productCode(product);
    const matchingTanks = tanks.filter((tank) => rowProductType(tank) === code);

    if (matchingTanks.length > 0) {
      matchingTanks.forEach((tank, tankIndex) => {
        const tankId = tank.id ?? tank.tank_pk ?? tank.tankId;
        const tankNozzles = nozzles.filter((nozzle) => {
          const nozzleTankId = rowTankId(nozzle);
          return (
            rowProductType(nozzle) === code &&
            (String(nozzleTankId || "") === String(tankId || "") ||
              String(nozzleTankId || "") === String(tank.tank_number || ""))
          );
        });

        dynamicConfig.push(configForProductTank({
          product,
          tank,
          nozzles: tankNozzles,
          tankIndex,
        }));
      });
      return;
    }

    dynamicConfig.push(configForProductTank({
      product,
      tank: {
        tank_number: `${code || "FUEL"}-${productIndex + 1}`,
        capacity: product.capacity || 0,
      },
      nozzles: [],
      tankIndex: 0,
    }));
  });

  return dynamicConfig;
};

export const initialFormFromProductConfig = (products = productConfig) =>
  products.reduce(
    (form, product) => {
      form[`${product.prefix}Opening`] = "";
      form[`${product.prefix}Closing`] = "";
      form[`${product.prefix}Testing`] = "";
      form[`${product.prefix}Receipt`] = "";
      form[product.dipField] = "";

      if (product.waterDipField) {
        form[product.waterDipField] = "";
      }

      product.nozzles.forEach((_, index) => {
        const prefix = nozzleFieldPrefix(product.prefix, index);
        form[`${prefix}Opening`] = "";
        form[`${prefix}Closing`] = "";
        form[`${prefix}Testing`] = "";
      });

      return form;
    },
    {
      ...collectionDefaults,
      ...expenseDefaults,
    }
  );

export const initialForm = {
  ...collectionDefaults,
  ...expenseDefaults,
};

export const calcSales = (opening, closing, testing) =>
  Math.max(
    Number(closing || 0) -
      Number(opening || 0) -
      Number(testing || 0),
    0
  );

export const toAmount = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export const isEmptyValue = (value) =>
  value === "" || value === undefined || value === null;

export const nozzleFieldPrefix = (productPrefix, nozzleIndex) =>
  `${productPrefix}N${nozzleIndex + 1}`;

export const formatMoney = (value) =>
  `Rs. ${Number(value || 0).toFixed(2)}`;

export const safe = (value) =>
  value === "" || value === undefined || value === null
    ? "-"
    : String(value);

export const formatLiters = (value) =>
  `${Number(value || 0).toFixed(2)} L`;

export const dateInputValue = (date) =>
  date
    ? [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-")
    : "";

export const dateFromInput = (value) =>
  value ? new Date(`${value}T00:00:00`) : null;

export const formFromBackendRecord = (record, products = productConfig) => {
  if (!record) {
    return initialFormFromProductConfig(products);
  }

  const next = initialFormFromProductConfig(products);

  (record.products || []).forEach((product) => {
    const prefix = product.product_code;
    next[`${prefix}Opening`] = product.opening_reading ?? "";
    next[`${prefix}Closing`] = product.closing_reading ?? "";
    next[`${prefix}Testing`] = product.testing_qty ?? "";
    next[`${prefix}Receipt`] = product.receipt_qty ?? "";

    const config = products.find((item) => item.prefix === prefix);

    if (config) {
      next[config.dipField] = product.tank_dip ?? "";
      if (config.waterDipField) {
        next[config.waterDipField] = product.water_dip ?? "";
      }
    }
  });

  (record.collections || []).forEach((collection) => {
    next[collection.collection_type] = collection.amount ?? "";
  });

  (record.expenses || []).forEach((expense) => {
    next[expense.expense_type] = expense.amount ?? "";
  });

  return next;
};

export const productRowsFromForm = (form, fuelPrices = emptyFuelPrices, products = productConfig) =>
  products.map((product) => {
    const rate = Number(fuelPrices[product.priceKey] || 0);
    const nozzleRows = product.nozzles.map((name, index) => {
      const fieldPrefix = nozzleFieldPrefix(product.prefix, index);
      const opening = form[`${fieldPrefix}Opening`];
      const closing = form[`${fieldPrefix}Closing`];
      const testing = form[`${fieldPrefix}Testing`];

      return {
        name,
        fieldPrefix,
        opening,
        closing,
        testing,
        grossSales: Math.max(toAmount(closing) - toAmount(opening), 0),
        sales: calcSales(opening, closing, testing),
      };
    });
    const nozzleHasEntry = nozzleRows.some(
      (nozzle) =>
        nozzle.opening !== "" ||
        nozzle.closing !== "" ||
        nozzle.testing !== ""
    );
    const opening = nozzleHasEntry
      ? nozzleRows.reduce(
          (sum, nozzle) => sum + toAmount(nozzle.opening),
          0
        )
      : form[`${product.prefix}Opening`];
    const closing = nozzleHasEntry
      ? nozzleRows.reduce(
          (sum, nozzle) => sum + toAmount(nozzle.closing),
          0
        )
      : form[`${product.prefix}Closing`];
    const testing = nozzleHasEntry
      ? nozzleRows.reduce(
          (sum, nozzle) => sum + toAmount(nozzle.testing),
          0
        )
      : form[`${product.prefix}Testing`];
    const receipt = form[`${product.prefix}Receipt`];
    const sales = nozzleHasEntry
      ? nozzleRows.reduce((sum, nozzle) => sum + nozzle.sales, 0)
      : calcSales(opening, closing, testing);
    const tankDip = form[product.dipField];
    const hasStockData = !isEmptyValue(tankDip) || !isEmptyValue(receipt);
    const closingStock = hasStockData
      ? toAmount(tankDip) + toAmount(receipt) - sales
      : "";

    return {
      ...product,
      opening,
      closing,
      testing,
      receipt,
      nozzleRows,
      nozzleCount: product.nozzles.length,
      tankDip,
      waterDip: product.waterDipField ? form[product.waterDipField] : "",
      closingStock,
      sales,
      rate,
      amount: sales * rate,
    };
  });

export const totalsFromForm = (form, fuelPrices = emptyFuelPrices, products = productConfig) => {
  const productRows = productRowsFromForm(form, fuelPrices, products);
  const totalSales = productRows.reduce(
    (sum, product) => sum + product.amount,
    0
  );
  const totalLiters = productRows.reduce(
    (sum, product) => sum + product.sales,
    0
  );
  const totalCollection =
    totalSales;
  const paymentCollection =
    toAmount(form.cash) +
    toAmount(form.upi) +
    toAmount(form.card) +
    toAmount(form.fleet) +
    toAmount(form.credit);
  const totalExpenses =
    toAmount(form.generator) +
    toAmount(form.staff) +
    toAmount(form.cleaning) +
    toAmount(form.maintenance);

  return {
    productRows,
    totalSales,
    totalLiters,
    totalCollection,
    paymentCollection,
    totalExpenses,
    closingCash: totalCollection - totalExpenses,
  };
};

export const eachDateInRange = (fromDate, toDate) => {
  const dates = [];
  const cursor = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate()
  );
  const end = new Date(
    toDate.getFullYear(),
    toDate.getMonth(),
    toDate.getDate()
  );

  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

export const productPrintGroupsFromConfig = (products = productConfig) =>
  products.reduce((groups, product) => {
  const productKey = product.productKey || product.prefix;
  const existing = groups.find((group) => group.productKey === productKey);

  if (existing) {
    existing.prefixes.push(product.prefix);
    existing.tankNames.push(product.tankName);
    existing.tankCapacity += Number(product.tankCapacity || 0);
    return groups;
  }

  groups.push({
    title: product.fuelType || product.label,
    productKey,
    prefixes: [product.prefix],
    tankNames: [product.tankName],
    tankCapacity: Number(product.tankCapacity || 0),
  });

  return groups;
}, []);

export const productPrintGroups = productPrintGroupsFromConfig(productConfig);

const groupsFromConfigOrGroups = (configOrGroups = productPrintGroups) =>
  configOrGroups.some((item) => Array.isArray(item.prefixes))
    ? configOrGroups
    : productPrintGroupsFromConfig(configOrGroups);

export const productPrintGroupForKey = (productKey, configOrGroups = productPrintGroups) =>
  groupsFromConfigOrGroups(configOrGroups).find((group) => {
    const normalized = String(productKey || "").toLowerCase();

    return (
      group.productKey === normalized ||
      group.title.toLowerCase() === normalized
    );
  });

export const productTotalsByGroup = (productRows, configOrGroups = productPrintGroups) =>
  groupsFromConfigOrGroups(configOrGroups).map((group) => {
    const rows = productRows.filter((row) =>
      group.prefixes.includes(row.prefix)
    );

    return {
      title: group.title,
      liters: rows.reduce(
        (sum, row) => sum + Number(row.sales || 0),
        0
      ),
      amount: rows.reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      ),
      tankCapacity: group.tankCapacity,
    };
  });

export const groupProductRowsByFuel = (productRows, configOrGroups = productPrintGroups) =>
  groupsFromConfigOrGroups(configOrGroups).map((group) => {
    const rows = productRows.filter((row) =>
      group.prefixes.includes(row.prefix || row.productCode)
    );
    const openingStock = rows.reduce(
      (sum, row) => sum + toAmount(row.opening),
      0
    );
    const receipt = rows.reduce(
      (sum, row) => sum + toAmount(row.receipt),
      0
    );
    const sales = rows.reduce(
      (sum, row) => sum + toAmount(row.sales),
      0
    );
    const closingStock = rows.reduce((sum, row) => {
      if (!isEmptyValue(row.closingStock)) {
        return sum + toAmount(row.closingStock);
      }

      return sum + toAmount(row.closing);
    }, 0);
    const amount = rows.reduce(
      (sum, row) => sum + toAmount(row.amount),
      0
    );

    return {
      title: group.title,
      productKey: group.productKey,
      prefixes: group.prefixes,
      tankNames: group.tankNames,
      tankCapacity: group.tankCapacity,
      rows,
      openingStock,
      receipt,
      totalStock: openingStock + receipt,
      sales,
      closingStock,
      amount,
    };
  });

export const validateDsrForm = (form, products = productConfig) => {
  const errors = [];

  Object.keys(initialFormFromProductConfig(products)).forEach((field) => {
    const value = form[field];

    if (isEmptyValue(value)) {
      return;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      errors.push(`${field} must be a valid number.`);
      return;
    }

    if (number < 0) {
      errors.push(`${field} cannot be negative.`);
    }
  });

  products.forEach((product) => {
    product.nozzles.forEach((name, index) => {
      const fieldPrefix = nozzleFieldPrefix(product.prefix, index);
      const opening = form[`${fieldPrefix}Opening`];
      const closing = form[`${fieldPrefix}Closing`];
      const testing = form[`${fieldPrefix}Testing`];

      if (!isEmptyValue(opening) && !isEmptyValue(closing)) {
        const grossSales = toAmount(closing) - toAmount(opening);

        if (grossSales < 0) {
          errors.push(`${name} closing reading cannot be less than opening reading.`);
        }

        if (!isEmptyValue(testing) && toAmount(testing) > grossSales) {
          errors.push(`${name} testing quantity cannot exceed gross meter sales.`);
        }
      }
    });

    const productOpening = form[`${product.prefix}Opening`];
    const productClosing = form[`${product.prefix}Closing`];
    const productTesting = form[`${product.prefix}Testing`];

    if (!isEmptyValue(productOpening) && !isEmptyValue(productClosing)) {
      const grossSales = toAmount(productClosing) - toAmount(productOpening);

      if (grossSales < 0) {
        errors.push(`${product.label} closing reading cannot be less than opening reading.`);
      }

      if (!isEmptyValue(productTesting) && toAmount(productTesting) > grossSales) {
        errors.push(`${product.label} testing quantity cannot exceed gross meter sales.`);
      }
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    message:
      errors.length === 0
        ? "DSR data is valid."
        : errors.slice(0, 5).join("\n"),
  };
};

export const dateFromIso = (value) =>
  value ? new Date(`${String(value).slice(0, 10)}T00:00:00`) : null;

export const reportDataFromBackend = (report) => {
  const collections = report.collections || {};
  const expenses = report.expenses || {};
  const productRows = (report.products || []).map((product) => ({
    productCode: product.productCode,
    prefix: product.productCode,
    label: product.productLabel,
    opening: product.openingReading,
    receipt: product.receiptQty,
    closing: product.closingReading,
    testing: product.testingQty,
    tankDip: product.tankDip,
    waterDip: product.waterDip,
    closingStock: product.closingStock,
    sales: product.salesLiters,
    rate: product.rate,
    amount: product.amount,
  }));

  return {
    ok: true,
    productTitle: report.fuelType === "All Fuels" ? "Overall" : report.fuelType,
    fromDate: dateFromIso(report.fromDate),
    toDate: dateFromIso(report.toDate),
    records: [
      {
        form: {
          cash: collections.cash || 0,
          upi: collections.upi || 0,
          card: collections.card || 0,
          fleet: collections.fleet || 0,
          credit: collections.credit || 0,
          generator: expenses.generator || 0,
          staff: expenses.staff || 0,
          cleaning: expenses.cleaning || 0,
          maintenance: expenses.maintenance || 0,
        },
      },
    ],
    productRows,
    totals: {
      totalSales: report.totals?.totalSales || 0,
      totalLiters: report.totals?.totalLiters || 0,
      totalCollection: report.totals?.totalCollections || 0,
      totalExpenses: report.totals?.totalExpenses || 0,
      closingCash: report.totals?.netCash || 0,
    },
  };
};
