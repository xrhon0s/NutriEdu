const assert = require("node:assert/strict");
const { PILOT_INGREDIENTS } = require("./applyNutritionPilot");
const { calculateFromIngredientProfiles } = require("../services/recipeNutritionCalculationService");

const nutrientFields = ["calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g", "saturated_fat_per_100g", "sugar_per_100g", "fiber_per_100g", "sodium_mg_per_100g"];
const profiles = PILOT_INGREDIENTS.map((item, index) => ({
  id: index + 1, nombre: item.name, nutrition_source: "usda_fdc", nutrition_reviewed_at: "2026-09-12T12:00:00Z",
  ...Object.fromEntries(nutrientFields.map((field, nutrientIndex) => [field, item.nutrition[nutrientIndex]]))
}));
const result = calculateFromIngredientProfiles({ servings: 1, ingredients: PILOT_INGREDIENTS.map((item, index) => ({ id: index + 1, amountG: item.amountG })) }, profiles);

assert.equal(result.serving_size_g, 195);
assert.equal(result.calorias, 220.95);
assert.equal(result.protein_g, 9.1);
assert.equal(result.nutrition_source, "calculated");
assert.match(result.nutrition_source_reference, /^NutriEdu calculation/);
console.log(JSON.stringify({ ok: true, ingredientSnapshots: 3, servingSizeG: result.serving_size_g, calories: result.calorias, deterministicCalculation: true }, null, 2));
