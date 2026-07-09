const dsrRepository = require("../repositories/dsrRepository");
const validationService = require("./validationService");
const auditService = require("./auditService");
const activityLogService = require("./activityLogService");
const numberingService = require("./numberingService");

const createDsr = async (payload, user = null) => {
  const validation = await validationService.validateDsrPayloadAsync(payload);
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message,
      errors: validation.errors,
    };
  }

  const existing = await dsrRepository.getDsrByDate(payload.dsrDate);
  if (existing) {
    return {
      ok: false,
      status: 409,
      message: "A DSR record already exists for this date.",
    };
  }

  const dsrNumber = await numberingService.nextDsrNumber();
  const record = await dsrRepository.createDsr(payload, dsrNumber);

  await auditService.logAudit({
    actionType: "created",
    moduleName: "dsr",
    entityType: "dsr_record",
    entityId: String(record.id),
    user,
    newValue: record,
    details: {
      dsrDate: payload.dsrDate,
      dsrNumber,
    },
  });
  await activityLogService.logActivity({
    activityType: "dsr_creation",
    moduleName: "dsr",
    status: "success",
    message: "DSR created.",
    details: {
      dsrDate: payload.dsrDate,
      dsrNumber,
      userId: user?.id || null,
      username: user?.username || null,
      role: user?.role || null,
    },
  });

  return {
    ok: true,
    dsrNumber,
    record,
  };
};

const updateDsr = async (dsrDate, payload, user = null) => {
  const validation = await validationService.validateDsrPayloadAsync({
    ...payload,
    dsrDate,
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message,
      errors: validation.errors,
    };
  }

  const existing = await dsrRepository.getDsrByDate(dsrDate);
  const record = await dsrRepository.updateDsr(dsrDate, {
    ...payload,
    dsrDate,
  });
  if (!record) {
    return {
      ok: false,
      status: 404,
      message: "DSR record not found.",
    };
  }

  await auditService.logAudit({
    actionType: "updated",
    moduleName: "dsr",
    entityType: "dsr_record",
    entityId: String(record.id),
    user,
    oldValue: existing,
    newValue: record,
    details: { dsrDate },
  });
  await activityLogService.logActivity({
    activityType: "dsr_update",
    moduleName: "dsr",
    status: "success",
    message: "DSR updated.",
    details: { dsrDate },
  });

  return {
    ok: true,
    record,
  };
};

const deleteDsr = async (dsrDate, user = null) => {
  const record = await dsrRepository.deleteDsr(dsrDate);

  if (!record) {
    return {
      ok: false,
      status: 404,
      message: "DSR record not found.",
    };
  }

  await auditService.logAudit({
    actionType: "deleted",
    moduleName: "dsr",
    entityType: "dsr_record",
    entityId: String(record.id),
    user,
    oldValue: record,
    details: {
      dsrDate,
    },
  });
  await activityLogService.logActivity({
    activityType: "dsr_delete",
    moduleName: "dsr",
    status: "success",
    message: "DSR deleted.",
    details: {
      dsrDate,
      userId: user?.id || null,
      username: user?.username || null,
      role: user?.role || null,
    },
  });

  return {
    ok: true,
    record,
  };
};

const getDsr = async (dsrDate) => {
  const record = await dsrRepository.getDsrByDate(dsrDate);

  if (!record) {
    return {
      ok: false,
      status: 404,
      message: "DSR record not found.",
    };
  }

  return {
    ok: true,
    record,
  };
};

const listDsrHistory = async ({ fromDate, toDate, productKey = "overall" }) => {
  const validation = await validationService.validateReportRequestAsync({
    fromDate,
    toDate,
    productKey,
  });

  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      message: validation.message,
    };
  }

  const rows = await dsrRepository.getHistoryRecords({
    fromDate: validation.fromDate,
    toDate: validation.toDate,
    productCodes: validation.productGroup.productCodes,
  });

  return {
    ok: true,
    fromDate: validation.fromDate,
    toDate: validation.toDate,
    productKey: validation.productKey,
    records: rows.map((row) => {
      const products = row.products || {};

      return {
        dsrDate:
          row.dsr_date instanceof Date
            ? row.dsr_date.toISOString().slice(0, 10)
            : String(row.dsr_date).slice(0, 10),
        dsrNumber: row.dsr_number,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : row.created_at || null,
        updatedAt:
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : row.updated_at || null,
        createdBy: row.created_by || null,
        productCount: Number(row.product_count || 0),
        totalLiters: Number(row.total_liters || 0),
        totalAmount: Number(row.total_amount || 0),
        products: Object.keys(validation.productGroups)
          .filter((key) => key !== "overall")
          .map((key) => {
            const group = validation.productGroups[key];
            const groupedRows = (group.productCodes || []).map((code) => products[code] || {});

            return {
              productKey: key,
              fuelType: group.title,
              tankNames: groupedRows
                .map((item) => item.product_label)
                .filter(Boolean),
              salesLiters: groupedRows.reduce(
                (sum, item) => sum + Number(item.sales_liters || 0),
                0
              ),
              amount: groupedRows.reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0
              ),
            };
          }),
      };
    }),
  };
};

module.exports = {
  createDsr,
  updateDsr,
  deleteDsr,
  getDsr,
  listDsrHistory,
};
