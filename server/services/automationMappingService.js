const automationRepository = require("../repositories/automationRepository");

const normalizeTankMapping = (mapping = {}) => ({
  externalTankId: String(mapping.externalTankId || mapping.external_tank_id || "").trim(),
  externalTankName: String(mapping.externalTankName || mapping.external_tank_name || "").trim(),
  internalTankId: String(mapping.internalTankId || mapping.internal_tank_id || "").trim(),
  productType: String(mapping.productType || mapping.product_type || "").trim().toUpperCase(),
});

const normalizeNozzleMapping = (mapping = {}) => ({
  externalNozzleId: String(mapping.externalNozzleId || mapping.external_nozzle_id || "").trim(),
  externalNozzleName: String(mapping.externalNozzleName || mapping.external_nozzle_name || "").trim(),
  internalNozzleId: String(mapping.internalNozzleId || mapping.internal_nozzle_id || "").trim(),
  productType: String(mapping.productType || mapping.product_type || "").trim().toUpperCase(),
});

const publicTankMapping = (row) => ({
  id: row.id,
  connectionId: row.connection_id,
  externalTankId: row.external_tank_id,
  externalTankName: row.external_tank_name,
  internalTankId: row.internal_tank_id,
  productType: row.product_type,
  createdAt: row.created_at,
});

const publicNozzleMapping = (row) => ({
  id: row.id,
  connectionId: row.connection_id,
  externalNozzleId: row.external_nozzle_id,
  externalNozzleName: row.external_nozzle_name,
  internalNozzleId: row.internal_nozzle_id,
  productType: row.product_type,
  createdAt: row.created_at,
});

const validateMappings = (mappings, type) => {
  const missing = mappings.find((mapping) =>
    type === "tank"
      ? !mapping.externalTankId || !mapping.internalTankId || !mapping.productType
      : !mapping.externalNozzleId || !mapping.internalNozzleId || !mapping.productType
  );

  if (missing) {
    return {
      ok: false,
      status: 400,
      message:
        type === "tank"
          ? "Tank mappings require externalTankId, internalTankId, and productType."
          : "Nozzle mappings require externalNozzleId, internalNozzleId, and productType.",
    };
  }

  return { ok: true };
};

const listTankMappings = async (connectionId) => {
  const result = await automationRepository.listTankMappings(connectionId);

  return {
    ok: true,
    mappings: result.rows.map(publicTankMapping),
  };
};

const saveTankMappings = async (connectionId, mappings = []) => {
  const normalized = mappings.map(normalizeTankMapping);
  const validation = validateMappings(normalized, "tank");

  if (!validation.ok) {
    return validation;
  }

  const result = await automationRepository.upsertTankMappings(
    connectionId,
    normalized
  );

  return {
    ok: true,
    mappings: result.rows.map(publicTankMapping),
  };
};

const listNozzleMappings = async (connectionId) => {
  const result = await automationRepository.listNozzleMappings(connectionId);

  return {
    ok: true,
    mappings: result.rows.map(publicNozzleMapping),
  };
};

const saveNozzleMappings = async (connectionId, mappings = []) => {
  const normalized = mappings.map(normalizeNozzleMapping);
  const validation = validateMappings(normalized, "nozzle");

  if (!validation.ok) {
    return validation;
  }

  const result = await automationRepository.upsertNozzleMappings(
    connectionId,
    normalized
  );

  return {
    ok: true,
    mappings: result.rows.map(publicNozzleMapping),
  };
};

module.exports = {
  listTankMappings,
  saveTankMappings,
  listNozzleMappings,
  saveNozzleMappings,
  publicTankMapping,
  publicNozzleMapping,
};
