const assert = require("node:assert/strict");
const { validateRecipeTemplate } = require("../services/recipeCatalogTemplateService");

const completeRecipe = {
  schemaVersion: "1.0",
  externalKey: "chicken_rice_001",
  name: "Pollo con arroz",
  description: "Pollo con arroz integral y vegetales.",
  preparationMinutes: 35,
  healthLevel: 4,
  portion: { servingSizeG: 420, servings: 1 },
  nutritionPerServing: {
    calories: 540,
    proteinG: 42,
    carbsG: 58,
    fatG: 14,
    saturatedFatG: 3,
    sugarG: 5,
    fiberG: 8,
    sodiumMg: 480
  },
  nutritionProvenance: { source: "manual", reference: "Reviewed example" },
  ingredients: [
    { externalKey: "chicken_breast", name: "pechuga de pollo", amount: 150, unit: "g", amountG: 150 },
    { externalKey: "brown_rice", name: "arroz integral", amount: 180, unit: "g", amountG: 180 }
  ]
};

const complete = validateRecipeTemplate(completeRecipe);
assert.equal(complete.valid, true);
assert.equal(complete.summary.nutritionConfidence, 1);
assert.equal(complete.summary.eligibilityReady, true);
assert.equal(complete.summary.recommendationReady, true);

const incomplete = validateRecipeTemplate({
  ...completeRecipe,
  nutritionPerServing: { ...completeRecipe.nutritionPerServing, sodiumMg: null }
});
assert.equal(incomplete.valid, true);
assert.equal(incomplete.summary.nutritionConfidence, 0.88);
assert.equal(incomplete.summary.recommendationReady, false);
assert.ok(incomplete.warnings.some((warning) => warning.path === "nutritionPerServing.sodiumMg"));

const invalid = validateRecipeTemplate({
  ...completeRecipe,
  externalKey: "Invalid key",
  ingredients: [completeRecipe.ingredients[0], completeRecipe.ingredients[0]],
  nutritionProvenance: { source: "usda_fdc", reference: "" }
});
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.some((error) => error.code === "INVALID_EXTERNAL_KEY"));
assert.ok(invalid.errors.some((error) => error.code === "DUPLICATE_INGREDIENT"));
assert.ok(invalid.errors.some((error) => error.code === "MISSING_SOURCE_REFERENCE"));

console.log(JSON.stringify({
  ok: true,
  completeRecipeAccepted: true,
  missingNutrientsReduceConfidence: true,
  duplicateIngredientsRejected: true,
  provenanceRequired: true
}, null, 2));
