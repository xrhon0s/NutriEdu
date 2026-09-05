const CONFIDENCE_LEVELS = ["low", "medium", "high"];
const DOCUMENT_TYPES = ["prescription", "lab_result", "nutrition_order", "medical_summary", "other"];
const TARGET_DEFINITIONS = {
  calories_min: { unit: "kcal", maximum: 20000 },
  calories_max: { unit: "kcal", maximum: 20000 },
  protein_min_g: { unit: "g", maximum: 5000 },
  protein_max_g: { unit: "g", maximum: 5000 },
  carbs_min_g: { unit: "g", maximum: 5000 },
  carbs_max_g: { unit: "g", maximum: 5000 },
  fat_min_g: { unit: "g", maximum: 5000 },
  fat_max_g: { unit: "g", maximum: 5000 },
  saturated_fat_max_g: { unit: "g", maximum: 5000 },
  sugar_max_g: { unit: "g", maximum: 5000 },
  fiber_min_g: { unit: "g", maximum: 5000 },
  sodium_max_mg: { unit: "mg", maximum: 100000 },
  water_min_ml: { unit: "ml", maximum: 20000 }
};

const confidenceSchema = { type: "string", enum: CONFIDENCE_LEVELS };
const findingIdSchema = { type: "string", minLength: 1, maxLength: 80 };

const medicalDocumentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentType",
    "summary",
    "documentDate",
    "professionalName",
    "medications",
    "conditions",
    "dietaryInstructions",
    "nutritionTargets",
    "uncertainties"
  ],
  properties: {
    documentType: { type: "string", enum: DOCUMENT_TYPES },
    summary: { type: "string" },
    documentDate: { type: ["string", "null"] },
    professionalName: { type: ["string", "null"] },
    medications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "dose", "frequency", "instructions", "confidence"],
        properties: {
          id: findingIdSchema,
          name: { type: "string" },
          dose: { type: ["string", "null"] },
          frequency: { type: ["string", "null"] },
          instructions: { type: ["string", "null"] },
          confidence: confidenceSchema
        }
      }
    },
    conditions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "catalogCode", "evidence", "confidence"],
        properties: {
          id: findingIdSchema,
          name: { type: "string" },
          catalogCode: { type: ["string", "null"] },
          evidence: { type: "string" },
          confidence: confidenceSchema
        }
      }
    },
    dietaryInstructions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "instruction", "confidence"],
        properties: {
          id: findingIdSchema,
          instruction: { type: "string" },
          confidence: confidenceSchema
        }
      }
    },
    nutritionTargets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "field", "value", "unit", "period", "confidence"],
        properties: {
          id: findingIdSchema,
          field: { type: "string", enum: Object.keys(TARGET_DEFINITIONS) },
          value: { type: "number", minimum: 0 },
          unit: { type: "string", enum: ["kcal", "g", "mg", "ml"] },
          period: { type: "string", enum: ["per_day", "per_meal"] },
          confidence: confidenceSchema
        }
      }
    },
    uncertainties: { type: "array", items: { type: "string" } }
  }
};

class MedicalDocumentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MedicalDocumentValidationError";
    this.code = "INVALID_MEDICAL_DOCUMENT_EXTRACTION";
  }
}

const validateMedicalDocumentExtraction = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MedicalDocumentValidationError("La extraccion debe ser un objeto");
  }

  const normalized = {
    documentType: enumValue(value.documentType, DOCUMENT_TYPES, "Tipo de documento"),
    summary: text(value.summary, "Resumen", 800, true),
    documentDate: nullableDate(value.documentDate),
    professionalName: nullableText(value.professionalName, "Profesional", 160),
    medications: limitedArray(value.medications, "Medicamentos", 30).map((item, index) => ({
      id: findingId(item?.id, `medication-${index + 1}`),
      name: text(item?.name, "Nombre del medicamento", 160),
      dose: nullableText(item?.dose, "Dosis", 120),
      frequency: nullableText(item?.frequency, "Frecuencia", 160),
      instructions: nullableText(item?.instructions, "Indicaciones", 500),
      confidence: confidence(item?.confidence)
    })),
    conditions: limitedArray(value.conditions, "Condiciones", 20).map((item, index) => ({
      id: findingId(item?.id, `condition-${index + 1}`),
      name: text(item?.name, "Nombre de la condicion", 160),
      catalogCode: nullableText(item?.catalogCode, "Codigo de condicion", 80),
      evidence: text(item?.evidence, "Evidencia de condicion", 500),
      confidence: confidence(item?.confidence)
    })),
    dietaryInstructions: limitedArray(value.dietaryInstructions, "Indicaciones alimentarias", 30)
      .map((item, index) => ({
        id: findingId(item?.id, `diet-${index + 1}`),
        instruction: text(item?.instruction, "Indicacion alimentaria", 500),
        confidence: confidence(item?.confidence)
      })),
    nutritionTargets: limitedArray(value.nutritionTargets, "Metas nutricionales", 30)
      .map((item, index) => normalizeTarget(item, index)),
    uncertainties: limitedArray(value.uncertainties, "Incertidumbres", 20)
      .map((item) => text(item, "Incertidumbre", 300))
  };

  const ids = getFindingIds(normalized);
  if (new Set(ids).size !== ids.length) {
    throw new MedicalDocumentValidationError("Los hallazgos contienen identificadores duplicados");
  }
  return normalized;
};

const validateAcceptedFindingIds = (value, extraction) => {
  if (!Array.isArray(value)) {
    throw new MedicalDocumentValidationError("Debes indicar los hallazgos aceptados");
  }
  const accepted = value.map((item) => findingId(item, "accepted-finding"));
  if (new Set(accepted).size !== accepted.length) {
    throw new MedicalDocumentValidationError("Hay hallazgos aceptados repetidos");
  }
  const available = new Set(getFindingIds(extraction));
  if (accepted.some((id) => !available.has(id))) {
    throw new MedicalDocumentValidationError("Se intento aceptar un hallazgo inexistente");
  }
  return accepted;
};

const getAcceptedFindings = (extraction, acceptedFindingIds) => {
  const accepted = new Set(acceptedFindingIds);
  return {
    medications: extraction.medications.filter((item) => accepted.has(item.id)),
    conditions: extraction.conditions.filter((item) => accepted.has(item.id)),
    dietaryInstructions: extraction.dietaryInstructions.filter((item) => accepted.has(item.id)),
    nutritionTargets: extraction.nutritionTargets.filter((item) => accepted.has(item.id))
  };
};

const getFindingIds = (extraction) => [
  ...extraction.medications,
  ...extraction.conditions,
  ...extraction.dietaryInstructions,
  ...extraction.nutritionTargets
].map((item) => item.id);

const normalizeTarget = (item, index) => {
  const field = enumValue(item?.field, Object.keys(TARGET_DEFINITIONS), "Campo nutricional");
  const definition = TARGET_DEFINITIONS[field];
  const value = numberInRange(item?.value, 0, definition.maximum, "Valor nutricional");
  const unit = enumValue(item?.unit, [definition.unit], "Unidad nutricional");
  return {
    id: findingId(item?.id, `target-${index + 1}`),
    field,
    value,
    unit,
    period: enumValue(item?.period, ["per_day", "per_meal"], "Periodo nutricional"),
    confidence: confidence(item?.confidence)
  };
};

const limitedArray = (value, label, maximum) => {
  if (!Array.isArray(value)) throw new MedicalDocumentValidationError(`${label} debe ser una lista`);
  if (value.length > maximum) throw new MedicalDocumentValidationError(`${label} supera el limite permitido`);
  return value;
};

const findingId = (value, fallback) => text(value || fallback, "Identificador", 80);

const text = (value, label, maximum, allowEmpty = false) => {
  if (typeof value !== "string") throw new MedicalDocumentValidationError(`${label} no es valido`);
  const normalized = value.trim().slice(0, maximum);
  if (!allowEmpty && !normalized) throw new MedicalDocumentValidationError(`${label} es obligatorio`);
  return normalized;
};

const nullableText = (value, label, maximum) => {
  if (value === null || value === undefined || value === "") return null;
  return text(value, label, maximum);
};

const nullableDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const normalized = text(value, "Fecha del documento", 10);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new MedicalDocumentValidationError("La fecha del documento no es valida");
  }
  return normalized;
};

const confidence = (value) => enumValue(value, CONFIDENCE_LEVELS, "Confianza");

const enumValue = (value, allowed, label) => {
  if (!allowed.includes(value)) throw new MedicalDocumentValidationError(`${label} no es valido`);
  return value;
};

const numberInRange = (value, minimum, maximum, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new MedicalDocumentValidationError(`${label} esta fuera del rango permitido`);
  }
  return Math.round(parsed * 10) / 10;
};

module.exports = {
  MedicalDocumentValidationError,
  getAcceptedFindings,
  medicalDocumentJsonSchema,
  validateAcceptedFindingIds,
  validateMedicalDocumentExtraction
};
