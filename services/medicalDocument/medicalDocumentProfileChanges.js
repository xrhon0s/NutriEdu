const crypto = require("crypto");
const { MedicalDocumentValidationError } = require("./medicalDocumentSchema");

const TARGET_UNITS = {
  calories_min: "kcal",
  calories_max: "kcal",
  protein_min_g: "g",
  protein_max_g: "g",
  carbs_min_g: "g",
  carbs_max_g: "g",
  fat_min_g: "g",
  fat_max_g: "g",
  saturated_fat_max_g: "g",
  sugar_max_g: "g",
  fiber_min_g: "g",
  sodium_max_mg: "mg",
  water_min_ml: "ml"
};

const buildMedicalDocumentProfilePreview = ({
  reviewId,
  requestId,
  acceptedFindings,
  conditionCatalog,
  existingConditionCodes = [],
  currentTargets = null
}) => {
  const conditions = resolveConditions(
    acceptedFindings.conditions || [],
    conditionCatalog || [],
    existingConditionCodes
  );
  const targets = resolveTargets(acceptedFindings.nutritionTargets || [], currentTargets);
  const excludedFindings = [
    ...(acceptedFindings.medications || []).map((item) => ({
      id: item.id,
      type: "medication",
      label: item.name,
      reason: "Los medicamentos requieren un modulo clinico dedicado y no modifican el perfil nutricional"
    })),
    ...(acceptedFindings.dietaryInstructions || []).map((item) => ({
      id: item.id,
      type: "dietary_instruction",
      label: item.instruction,
      reason: "La indicacion se conserva en la auditoria, pero no existe un campo de perfil equivalente"
    }))
  ];

  const changes = { conditions, targets, excludedFindings };
  return {
    reviewId,
    requestId,
    status: "ready_to_apply",
    changes,
    changeCount: conditions.filter((item) => item.action === "add").length
      + targets.filter((item) => item.action === "update").length,
    profileUpdated: false,
    confirmationVersion: "1.0",
    previewHash: createPreviewHash({ reviewId, requestId, changes })
  };
};

const resolveConditions = (findings, catalog, existingConditionCodes) => {
  const catalogByCode = new Map(catalog.map((item) => [item.code, item]));
  const existing = new Set(existingConditionCodes);
  const seen = new Set();

  return findings.map((finding) => {
    if (!finding.catalogCode || !catalogByCode.has(finding.catalogCode)) {
      throw validationError(
        `La condicion "${finding.name}" no coincide con una condicion clinica activa`,
        "INVALID_CONDITION_CATALOG_CODE"
      );
    }
    if (seen.has(finding.catalogCode)) {
      throw validationError(
        `La condicion ${finding.catalogCode} fue aceptada mas de una vez`,
        "DUPLICATE_CONDITION_CATALOG_CODE"
      );
    }
    seen.add(finding.catalogCode);
    const catalogItem = catalogByCode.get(finding.catalogCode);
    return {
      findingId: finding.id,
      code: catalogItem.code,
      name: catalogItem.nombre,
      riskLevel: catalogItem.risk_level,
      requiresProfessionalGuidance: Boolean(catalogItem.requires_professional_guidance),
      evidence: finding.evidence,
      action: existing.has(catalogItem.code) ? "keep" : "add"
    };
  });
};

const resolveTargets = (findings, currentTargets) => {
  const seen = new Set();
  return findings.map((finding) => {
    if (finding.period !== "per_day") {
      throw validationError(
        `La meta ${finding.field} debe expresarse por dia para aplicarse al perfil`,
        "UNSUPPORTED_TARGET_PERIOD"
      );
    }
    if (!TARGET_UNITS[finding.field] || TARGET_UNITS[finding.field] !== finding.unit) {
      throw validationError("La meta nutricional no coincide con el perfil", "INVALID_TARGET_FIELD");
    }
    if (seen.has(finding.field)) {
      throw validationError(
        `La meta ${finding.field} fue aceptada mas de una vez`,
        "DUPLICATE_TARGET_FIELD"
      );
    }
    seen.add(finding.field);
    const previousValue = numericOrNull(currentTargets?.[finding.field]);
    return {
      findingId: finding.id,
      field: finding.field,
      previousValue,
      nextValue: finding.value,
      unit: finding.unit,
      period: finding.period,
      action: previousValue === finding.value ? "keep" : "update"
    };
  });
};

const createPreviewHash = (value) => crypto
  .createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

const numericOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const validationError = (message, code) => {
  const error = new MedicalDocumentValidationError(message);
  error.code = code;
  return error;
};

module.exports = {
  TARGET_UNITS,
  buildMedicalDocumentProfilePreview,
  createPreviewHash
};
