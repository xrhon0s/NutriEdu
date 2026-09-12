const crypto = require("crypto");

const NUTRIENTS = {
  calorias: "calories_per_100g",
  protein_g: "protein_per_100g",
  carbs_g: "carbs_per_100g",
  fat_g: "fat_per_100g",
  saturated_fat_g: "saturated_fat_per_100g",
  sugar_g: "sugar_per_100g",
  fiber_g: "fiber_per_100g",
  sodium_mg: "sodium_mg_per_100g"
};

const calculationError = (message, details = []) => Object.assign(new Error(message), { code: "NUTRITION_CALCULATION_INCOMPLETE", details });
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeCalculationInput = (body) => {
  const servings = Number(body?.servings);
  const ingredients = Array.isArray(body?.ingredients) ? body.ingredients.map((item) => ({ id: Number(item?.id), amountG: Number(item?.amount_g) })) : [];
  if (!Number.isFinite(servings) || servings <= 0 || !ingredients.length
    || ingredients.some((item) => !Number.isSafeInteger(item.id) || item.id <= 0 || !Number.isFinite(item.amountG) || item.amountG <= 0)
    || new Set(ingredients.map((item) => item.id)).size !== ingredients.length) {
    throw calculationError("Define porciones y gramos validos para cada ingrediente.");
  }
  return { servings, ingredients };
};

const calculateFromIngredientProfiles = (input, profiles) => {
  const profileById = new Map(profiles.map((profile) => [Number(profile.id), profile]));
  const details = [];
  input.ingredients.forEach((ingredient) => {
    const profile = profileById.get(ingredient.id);
    if (!profile) details.push({ ingredientId: ingredient.id, reason: "not_found" });
    else if (profile.nutrition_source === "unknown" || !profile.nutrition_reviewed_at) details.push({ ingredientId: ingredient.id, name: profile.nombre, reason: "unreviewed_profile" });
    else {
      const missing = Object.values(NUTRIENTS).filter((field) => profile[field] === null || profile[field] === undefined || !Number.isFinite(Number(profile[field])));
      if (missing.length) details.push({ ingredientId: ingredient.id, name: profile.nombre, reason: "missing_nutrients", fields: missing });
    }
  });
  if (details.length) throw calculationError("Hay ingredientes sin perfil nutricional completo y revisado.", details);

  const totals = Object.fromEntries(Object.keys(NUTRIENTS).map((field) => [field, 0]));
  input.ingredients.forEach((ingredient) => {
    const profile = profileById.get(ingredient.id);
    Object.entries(NUTRIENTS).forEach(([target, source]) => {
      totals[target] += Number(profile[source]) * ingredient.amountG / 100;
    });
  });
  const snapshot = input.ingredients.map((ingredient) => {
    const profile = profileById.get(ingredient.id);
    return {
      id: ingredient.id,
      amountG: ingredient.amountG,
      reviewedAt: profile.nutrition_reviewed_at,
      source: profile.nutrition_source,
      nutrients: Object.fromEntries(Object.values(NUTRIENTS).map((field) => [field, Number(profile[field])]))
    };
  });
  const digest = crypto.createHash("sha256").update(JSON.stringify({ servings: input.servings, snapshot })).digest("hex").slice(0, 16);
  return {
    ...Object.fromEntries(Object.entries(totals).map(([field, total]) => [field, round(total / input.servings)])),
    serving_size_g: round(input.ingredients.reduce((sum, ingredient) => sum + ingredient.amountG, 0) / input.servings),
    servings: input.servings,
    nutrition_source: "calculated",
    nutrition_source_reference: `NutriEdu calculation ${digest}; ingredients ${snapshot.map((item) => `${item.id}@${String(item.reviewedAt).slice(0, 10)}`).join(",")}`
  };
};

const calculateRecipeNutrition = async (pool, body) => {
  const input = normalizeCalculationInput(body);
  const result = await pool.query(
    `SELECT id, nombre, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
       saturated_fat_per_100g, sugar_per_100g, fiber_per_100g, sodium_mg_per_100g,
       nutrition_source, nutrition_reviewed_at
     FROM ingredientes WHERE id = ANY($1::int[])`,
    [input.ingredients.map((item) => item.id)]
  );
  return calculateFromIngredientProfiles(input, result.rows);
};

module.exports = { calculateFromIngredientProfiles, calculateRecipeNutrition, normalizeCalculationInput };
