const assert = require("node:assert/strict");
const { buildMedicalDocumentProfilePreview } = require("../services/medicalDocument/medicalDocumentProfileChanges");

const baseInput = {
  reviewId: 7,
  requestId: "request-contract",
  acceptedFindings: {
    medications: [{ id: "med-1", name: "Medicamento" }],
    conditions: [{ id: "condition-1", name: "Hipertension posible", catalogCode: "hypertension", evidence: "Lectura elevada" }],
    dietaryInstructions: [{ id: "diet-1", instruction: "Reducir sodio" }],
    nutritionTargets: [{ id: "target-1", field: "sodium_max_mg", value: 1800, unit: "mg", period: "per_day" }]
  },
  conditionCatalog: [{
    code: "hypertension",
    nombre: "Hipertension",
    risk_level: "high",
    requires_professional_guidance: true
  }],
  existingConditionCodes: [],
  currentTargets: { sodium_max_mg: "2300.00" }
};

const preview = buildMedicalDocumentProfilePreview(baseInput);
assert.equal(preview.changeCount, 2);
assert.equal(preview.changes.conditions[0].action, "add");
assert.equal(preview.changes.targets[0].previousValue, 2300);
assert.equal(preview.changes.targets[0].nextValue, 1800);
assert.equal(preview.changes.excludedFindings.length, 2);
assert.match(preview.previewHash, /^[a-f0-9]{64}$/);
assert.equal(
  buildMedicalDocumentProfilePreview(baseInput).previewHash,
  preview.previewHash,
  "The same preview must produce the same confirmation hash"
);

assert.throws(
  () => buildMedicalDocumentProfilePreview({
    ...baseInput,
    acceptedFindings: {
      ...baseInput.acceptedFindings,
      conditions: [{ ...baseInput.acceptedFindings.conditions[0], catalogCode: "unknown" }]
    }
  }),
  (error) => error.code === "INVALID_CONDITION_CATALOG_CODE"
);

assert.throws(
  () => buildMedicalDocumentProfilePreview({
    ...baseInput,
    acceptedFindings: {
      ...baseInput.acceptedFindings,
      nutritionTargets: [{ ...baseInput.acceptedFindings.nutritionTargets[0], period: "per_meal" }]
    }
  }),
  (error) => error.code === "UNSUPPORTED_TARGET_PERIOD"
);

console.log(JSON.stringify({
  ok: true,
  changeCount: preview.changeCount,
  excludedCount: preview.changes.excludedFindings.length,
  invalidCatalogRejected: true,
  perMealTargetRejected: true,
  deterministicHash: true
}, null, 2));
