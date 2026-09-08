const NUTRIENT_FIELDS = [
  "calories", "proteinG", "carbsG", "fatG",
  "saturatedFatG", "sugarG", "fiberG", "sodiumMg"
];

const NUTRITION_SOURCES = new Set([
  "unknown", "manual", "usda_fdc", "calculated", "ai_estimate", "professional"
]);

const EXTERNAL_KEY_PATTERN = /^[a-z][a-z0-9_]{2,79}$/;
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const validateRecipeTemplate = (input) => {
  const errors = [];
  const warnings = [];
  const addError = (path, code, message) => errors.push({ path, code, message });
  const addWarning = (path, code, message) => warnings.push({ path, code, message });

  if (!isObject(input)) {
    addError("$", "INVALID_DOCUMENT", "La plantilla debe ser un objeto JSON.");
    return { valid: false, errors, warnings, summary: null };
  }
  if (input.schemaVersion !== "1.0") addError("schemaVersion", "UNSUPPORTED_VERSION", "schemaVersion debe ser 1.0.");
  if (!EXTERNAL_KEY_PATTERN.test(input.externalKey || "")) addError("externalKey", "INVALID_EXTERNAL_KEY", "Usa letras minusculas, numeros y guion bajo; debe iniciar con una letra.");
  if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.trim().length > 160) addError("name", "INVALID_NAME", "El nombre debe tener entre 2 y 160 caracteres.");
  if (typeof input.description !== "string" || input.description.trim().length < 10 || input.description.trim().length > 2000) addError("description", "INVALID_DESCRIPTION", "La descripcion debe tener entre 10 y 2000 caracteres.");
  if (!Number.isInteger(input.preparationMinutes) || input.preparationMinutes <= 0) addError("preparationMinutes", "INVALID_PREPARATION_TIME", "El tiempo debe ser un entero positivo.");
  if (!Number.isInteger(input.healthLevel) || input.healthLevel < 1 || input.healthLevel > 5) addError("healthLevel", "INVALID_HEALTH_LEVEL", "El nivel de salud debe ser un entero entre 1 y 5.");

  const portion = input.portion;
  if (!isObject(portion)) {
    addError("portion", "MISSING_PORTION", "Debes definir la porcion evaluada.");
  } else {
    if (!isFiniteNumber(portion.servingSizeG) || portion.servingSizeG <= 0) addError("portion.servingSizeG", "INVALID_SERVING_SIZE", "El peso de la porcion debe ser positivo.");
    if (!isFiniteNumber(portion.servings) || portion.servings <= 0) addError("portion.servings", "INVALID_SERVINGS", "El numero de porciones debe ser positivo.");
  }

  const nutrition = input.nutritionPerServing;
  let knownNutrients = 0;
  if (!isObject(nutrition)) {
    addError("nutritionPerServing", "MISSING_NUTRITION", "Debes incluir el bloque nutricional por porcion.");
  } else {
    NUTRIENT_FIELDS.forEach((field) => {
      const value = nutrition[field];
      if (value === null || value === undefined || value === "") {
        addWarning(`nutritionPerServing.${field}`, "MISSING_NUTRIENT", "El dato faltante reducira la confianza del ranking.");
      } else if (!isFiniteNumber(value) || value < 0 || (field === "calories" && value === 0)) {
        addError(`nutritionPerServing.${field}`, "INVALID_NUTRIENT", "El nutriente debe ser numerico y no negativo; calorias debe ser mayor que cero.");
      } else {
        knownNutrients += 1;
      }
    });
  }

  const provenance = input.nutritionProvenance;
  if (!isObject(provenance) || !NUTRITION_SOURCES.has(provenance.source)) {
    addError("nutritionProvenance.source", "INVALID_NUTRITION_SOURCE", "La fuente nutricional no pertenece al catalogo permitido.");
  } else if (provenance.source !== "unknown" && (typeof provenance.reference !== "string" || !provenance.reference.trim())) {
    addError("nutritionProvenance.reference", "MISSING_SOURCE_REFERENCE", "Una fuente declarada necesita una referencia trazable.");
  }

  const ingredients = input.ingredients;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    addError("ingredients", "MISSING_INGREDIENTS", "La receta debe incluir al menos un ingrediente.");
  } else {
    const seenKeys = new Set();
    ingredients.forEach((ingredient, index) => {
      const path = `ingredients[${index}]`;
      if (!isObject(ingredient)) {
        addError(path, "INVALID_INGREDIENT", "El ingrediente debe ser un objeto.");
        return;
      }
      if (!EXTERNAL_KEY_PATTERN.test(ingredient.externalKey || "")) addError(`${path}.externalKey`, "INVALID_EXTERNAL_KEY", "La clave externa del ingrediente no es valida.");
      if (seenKeys.has(ingredient.externalKey)) addError(`${path}.externalKey`, "DUPLICATE_INGREDIENT", "El ingrediente aparece mas de una vez.");
      seenKeys.add(ingredient.externalKey);
      if (typeof ingredient.name !== "string" || ingredient.name.trim().length < 2 || ingredient.name.trim().length > 160) addError(`${path}.name`, "INVALID_INGREDIENT_NAME", "El nombre del ingrediente no es valido.");
      if (!isFiniteNumber(ingredient.amount) || ingredient.amount <= 0) addError(`${path}.amount`, "INVALID_AMOUNT", "La cantidad debe ser positiva.");
      if (typeof ingredient.unit !== "string" || !ingredient.unit.trim() || ingredient.unit.length > 30) addError(`${path}.unit`, "INVALID_UNIT", "La unidad es obligatoria y admite hasta 30 caracteres.");
      if (!isFiniteNumber(ingredient.amountG) || ingredient.amountG <= 0) addError(`${path}.amountG`, "INVALID_GRAMS", "amountG debe ser positivo para calcular nutrientes.");
    });
  }

  const confidence = knownNutrients / NUTRIENT_FIELDS.length;
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      knownNutrients,
      totalNutrients: NUTRIENT_FIELDS.length,
      nutritionConfidence: Math.round(confidence * 100) / 100,
      eligibilityReady: Array.isArray(ingredients) && ingredients.length > 0 && !errors.some((error) => error.path.startsWith("ingredients")),
      recommendationReady: errors.length === 0 && confidence === 1
    }
  };
};

module.exports = { validateRecipeTemplate };
