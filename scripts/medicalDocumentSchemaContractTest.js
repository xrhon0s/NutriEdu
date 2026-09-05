const assert = require("assert");
const {
  getAcceptedFindings,
  medicalDocumentJsonSchema,
  validateAcceptedFindingIds,
  validateMedicalDocumentExtraction
} = require("../services/medicalDocument/medicalDocumentSchema");

const fixture = {
  documentType: "prescription",
  summary: "Formula medica con una indicacion alimentaria.",
  documentDate: "2026-08-20",
  professionalName: "Profesional de prueba",
  medications: [{
    id: "med-1",
    name: "Medicamento de prueba",
    dose: "10 mg",
    frequency: "Una vez al dia",
    instructions: "Tomar con alimentos",
    confidence: "high"
  }],
  conditions: [{
    id: "condition-1",
    name: "Hipertension posible",
    catalogCode: "hypertension",
    evidence: "Texto de ejemplo que debe confirmar el usuario",
    confidence: "medium"
  }],
  dietaryInstructions: [{
    id: "diet-1",
    instruction: "Reducir el consumo de sodio",
    confidence: "high"
  }],
  nutritionTargets: [{
    id: "target-1",
    field: "sodium_max_mg",
    value: 1800,
    unit: "mg",
    period: "per_day",
    confidence: "high"
  }],
  uncertainties: ["La firma no es legible"]
};

const extraction = validateMedicalDocumentExtraction(fixture);
const accepted = validateAcceptedFindingIds(["condition-1", "target-1"], extraction);
const acceptedFindings = getAcceptedFindings(extraction, accepted);

assert.equal(medicalDocumentJsonSchema.additionalProperties, false);
assert.equal(extraction.nutritionTargets[0].value, 1800);
assert.equal(acceptedFindings.conditions.length, 1);
assert.equal(acceptedFindings.nutritionTargets.length, 1);
assert.equal(acceptedFindings.medications.length, 0);
assert.throws(
  () => validateAcceptedFindingIds(["unknown-finding"], extraction),
  /hallazgo inexistente/
);
assert.throws(
  () => validateMedicalDocumentExtraction({
    ...fixture,
    nutritionTargets: [{ ...fixture.nutritionTargets[0], value: 100001 }]
  }),
  /fuera del rango permitido/
);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "1.0",
  acceptedCount: accepted.length,
  invalidFindingRejected: true,
  invalidTargetRejected: true
}, null, 2));
