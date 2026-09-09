const assert = require("node:assert/strict");
const catalog = require("../templates/recipe_catalog/example.catalog.json");
const { validateRecipeCatalog } = require("../services/recipeCatalogImportService");

const valid = validateRecipeCatalog(catalog);
assert.equal(valid.valid, true);
assert.equal(valid.summary.recipes, 1);
assert.equal(valid.summary.ingredientDefinitions, 2);
assert.equal(valid.summary.recommendationReadyRecipes, 1);
assert.equal(valid.warnings.some((warning) => warning.code === "MISSING_SUBSTITUTION_GROUP"), false);

const duplicateRecipe = validateRecipeCatalog({
  ...catalog,
  recipes: [catalog.recipes[0], catalog.recipes[0]]
});
assert.equal(duplicateRecipe.valid, false);
assert.ok(duplicateRecipe.errors.some((error) => error.code === "DUPLICATE_EXTERNAL_KEY"));

const mismatchedReference = validateRecipeCatalog({
  ...catalog,
  recipes: [{
    ...catalog.recipes[0],
    ingredients: [{ ...catalog.recipes[0].ingredients[0], name: "otro ingrediente" }]
  }]
});
assert.equal(mismatchedReference.valid, false);
assert.ok(mismatchedReference.errors.some((error) => error.code === "INGREDIENT_NAME_MISMATCH"));

const oversized = validateRecipeCatalog({ ...catalog, recipes: Array(201).fill(catalog.recipes[0]) });
assert.equal(oversized.valid, false);
assert.ok(oversized.errors.some((error) => error.code === "INVALID_RECIPE_COUNT"));

const invalidSubstitutionGroup = validateRecipeCatalog({
  ...catalog,
  ingredients: [{ ...catalog.ingredients[0], substitutionGroup: "generic_protein" }, catalog.ingredients[1]]
});
assert.equal(invalidSubstitutionGroup.valid, false);
assert.ok(invalidSubstitutionGroup.errors.some((error) => error.code === "INVALID_SUBSTITUTION_GROUP"));

console.log(JSON.stringify({
  ok: true,
  completeCatalogAccepted: true,
  duplicateKeysRejected: true,
  ingredientIdentityEnforced: true,
  batchLimitEnforced: true
}, null, 2));
