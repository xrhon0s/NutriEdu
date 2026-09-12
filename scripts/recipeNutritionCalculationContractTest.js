const assert = require("node:assert/strict");
const { calculateFromIngredientProfiles, normalizeCalculationInput } = require("../services/recipeNutritionCalculationService");

const input = normalizeCalculationInput({ servings: 2, ingredients: [{ id: 1, amount_g: 200 }, { id: 2, amount_g: 100 }] });
const profile = (id, values) => ({
  id, nombre: `Ingrediente ${id}`, nutrition_source: "professional", nutrition_reviewed_at: "2026-09-12T10:00:00Z",
  calories_per_100g: values[0], protein_per_100g: values[1], carbs_per_100g: values[2], fat_per_100g: values[3],
  saturated_fat_per_100g: values[4], sugar_per_100g: values[5], fiber_per_100g: values[6], sodium_mg_per_100g: values[7]
});
const result = calculateFromIngredientProfiles(input, [profile(1, [100, 20, 5, 4, 1, 2, 3, 50]), profile(2, [200, 10, 30, 8, 2, 4, 6, 100])]);
assert.equal(result.calorias, 200);
assert.equal(result.protein_g, 25);
assert.equal(result.serving_size_g, 150);
assert.equal(result.nutrition_source, "calculated");
assert.match(result.nutrition_source_reference, /^NutriEdu calculation [a-f0-9]{16}/);
assert.throws(() => calculateFromIngredientProfiles(input, [profile(1, [100, 20, 5, 4, 1, 2, 3, 50])]), { code: "NUTRITION_CALCULATION_INCOMPLETE" });
assert.throws(() => normalizeCalculationInput({ servings: 0, ingredients: [] }), { code: "NUTRITION_CALCULATION_INCOMPLETE" });

console.log(JSON.stringify({ ok: true, perServingCalculation: true, reviewedProfilesRequired: true, deterministicReference: true }, null, 2));
