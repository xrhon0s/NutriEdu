const CONFIDENCE_LEVELS = ["low", "medium", "high"];
const NUTRIENT_FIELDS = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "saturated_fat_g",
  "sugar_g",
  "fiber_g",
  "sodium_mg"
];
const NUTRIENT_MAXIMUMS = {
  calories: 20000,
  protein_g: 5000,
  carbs_g: 5000,
  fat_g: 5000,
  saturated_fat_g: 5000,
  sugar_g: 5000,
  fiber_g: 5000,
  sodium_mg: 100000
};
const MAX_PORTION_GRAMS = 10000;

const nullableNumber = (maximum) => ({ type: ["number", "null"], minimum: 0, maximum });

const foodAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["isFood", "notFoodReason", "dish", "ingredients", "portion", "nutrition", "uncertainties"],
  properties: {
    isFood: { type: "boolean" },
    notFoodReason: { type: ["string", "null"] },
    dish: {
      type: "object",
      additionalProperties: false,
      required: ["name", "description", "confidence"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        confidence: { type: "string", enum: CONFIDENCE_LEVELS }
      }
    },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "estimatedGrams", "confidence", "uncertain"],
        properties: {
          name: { type: "string" },
          estimatedGrams: nullableNumber(MAX_PORTION_GRAMS),
          confidence: { type: "string", enum: CONFIDENCE_LEVELS },
          uncertain: { type: "boolean" }
        }
      }
    },
    portion: {
      type: "object",
      additionalProperties: false,
      required: ["description", "estimatedGrams", "confidence"],
      properties: {
        description: { type: "string" },
        estimatedGrams: nullableNumber(MAX_PORTION_GRAMS),
        confidence: { type: "string", enum: CONFIDENCE_LEVELS }
      }
    },
    nutrition: {
      type: "object",
      additionalProperties: false,
      required: [...NUTRIENT_FIELDS, "confidence"],
      properties: {
        ...Object.fromEntries(NUTRIENT_FIELDS.map((field) => [field, nullableNumber(NUTRIENT_MAXIMUMS[field])])),
        confidence: { type: "string", enum: CONFIDENCE_LEVELS }
      }
    },
    uncertainties: {
      type: "array",
      items: { type: "string" }
    }
  }
};

class FoodAnalysisValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FoodAnalysisValidationError";
    this.code = "INVALID_FOOD_ANALYSIS";
  }
}

const validateFoodAnalysis = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FoodAnalysisValidationError("El análisis debe ser un objeto");
  }

  const isFood = Boolean(value.isFood);
  const dish = value.dish || {};
  const portion = value.portion || {};
  const nutrition = value.nutrition || {};
  const ingredients = Array.isArray(value.ingredients) ? value.ingredients.slice(0, 30) : [];

  const normalized = {
    isFood,
    notFoodReason: nullableText(value.notFoodReason, 300),
    dish: {
      name: text(dish.name, "Nombre del plato", 160, !isFood),
      description: text(dish.description, "Descripción del plato", 500, true),
      confidence: confidence(dish.confidence)
    },
    ingredients: ingredients.map((ingredient, index) => ({
      name: text(ingredient?.name, `Ingrediente ${index + 1}`, 120),
      estimatedGrams: nullableNumberInRange(ingredient?.estimatedGrams, MAX_PORTION_GRAMS, "Cantidad de ingrediente"),
      confidence: confidence(ingredient?.confidence),
      uncertain: Boolean(ingredient?.uncertain)
    })),
    portion: {
      description: text(portion.description, "Descripción de porción", 200, true),
      estimatedGrams: nullableNumberInRange(portion.estimatedGrams, MAX_PORTION_GRAMS, "Cantidad de porcion"),
      confidence: confidence(portion.confidence)
    },
    nutrition: {
      ...Object.fromEntries(NUTRIENT_FIELDS.map((field) => [
        field,
        nullableNumberInRange(nutrition[field], NUTRIENT_MAXIMUMS[field], field)
      ])),
      confidence: confidence(nutrition.confidence)
    },
    uncertainties: (Array.isArray(value.uncertainties) ? value.uncertainties : [])
      .slice(0, 12)
      .map((item) => text(item, "Incertidumbre", 240))
  };

  if (isFood && normalized.ingredients.length === 0) {
    throw new FoodAnalysisValidationError("El análisis no contiene ingredientes revisables");
  }
  return normalized;
};

const text = (value, label, maxLength, allowEmpty = false) => {
  if (typeof value !== "string") throw new FoodAnalysisValidationError(`${label} no es válido`);
  const cleaned = value.trim().slice(0, maxLength);
  if (!allowEmpty && !cleaned) throw new FoodAnalysisValidationError(`${label} es obligatorio`);
  return cleaned;
};

const nullableText = (value, maxLength) => {
  if (value === null || value === undefined || value === "") return null;
  return text(value, "Texto", maxLength);
};

const confidence = (value) => {
  if (!CONFIDENCE_LEVELS.includes(value)) {
    throw new FoodAnalysisValidationError("El nivel de confianza no es válido");
  }
  return value;
};

const nullableNumberInRange = (value, maximum, label) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new FoodAnalysisValidationError(`${label} esta fuera del rango permitido`);
  }
  return Math.round(parsed * 10) / 10;
};

module.exports = {
  FoodAnalysisValidationError,
  foodAnalysisJsonSchema,
  validateFoodAnalysis
};
