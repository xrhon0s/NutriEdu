const assert = require("node:assert/strict");

const fakePool = {
  async query(sql, params) {
    if (sql.includes("COUNT(*)::int AS total FROM recetas")) return { rows: [{ total: 18 }] };
    if (sql.includes("json_agg") && sql.includes("LIMIT")) return { rows: [{ id: 8, nombre: "Sopa", ingredients: [] }] };
    if (sql.includes("COUNT(*)::int AS total FROM ingredientes")) {
      assert.match(sql, /NOT \(i\.calories_per_100g IS NOT NULL/);
      return { rows: [{ total: 22 }] };
    }
    if (sql.includes("FROM ingredientes i") && sql.includes("LIMIT")) {
      assert.equal(params[0], "%pollo%");
      assert.equal(params[1], "protein");
      assert.equal(params[2], "poultry");
      assert.match(sql, /recipe_usage_count DESC/);
      return { rows: [{ id: 4, nombre: "pollo", food_group: "protein", substitution_group: "poultry", recipe_usage_count: 12 }] };
    }
    if (sql.includes("UPDATE ingredientes SET nombre=$2")) {
      assert.equal(params[4], 165);
      assert.equal(params[12], "professional");
      assert.equal(params[13], "https://example.test/profile");
      assert.equal(params[14], 7);
      assert.match(sql, /nutrition_reviewed_at=NOW\(\)/);
      return { rows: [{ id: 4, nombre: "pollo", nutrition_source: "professional" }] };
    }
    throw new Error(`Unexpected catalog pagination query: ${sql}`);
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: fakePool };
const { listRecipes, listIngredients, createIngredient, createRecipe, updateIngredient } = require("../controllers/adminController");

const invoke = async (handler, request) => {
  let status = 200; let body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; return value; } };
  await handler(request, response);
  return { status, body };
};

const run = async () => {
  const recipes = await invoke(listRecipes, { query: { page: "2", limit: "5", search: "sopa", nutritionStatus: "incomplete" } });
  assert.equal(recipes.body.pagination.page, 2);
  assert.equal(recipes.body.pagination.totalPages, 4);
  assert.equal(recipes.status, 200);

  const ingredients = await invoke(listIngredients, { query: { page: "1", limit: "10", search: "pollo", foodGroup: "protein", substitutionGroup: "poultry", nutritionStatus: "incomplete" } });
  assert.equal(ingredients.body.pagination.totalPages, 3);
  assert.equal(ingredients.body.items[0].food_group, "protein");
  assert.equal(ingredients.body.items[0].substitution_group, "poultry");
  assert.equal(ingredients.body.items[0].recipe_usage_count, 12);

  const invalidGroup = await invoke(createIngredient, { body: { nombre: "nuevo", foodGroup: "vitamin", substitutionGroup: "other" } });
  assert.equal(invalidGroup.status, 400);
  const incompleteIngredient = await invoke(updateIngredient, { params: { id: "4" }, user: { id: 1 }, body: { nombre: "pollo", foodGroup: "protein", substitutionGroup: "poultry", nutrition: { calories_per_100g: 165, source: "manual", reference: "Ficha" } } });
  assert.equal(incompleteIngredient.status, 400);
  const completeProfile = Object.fromEntries(["calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g", "saturated_fat_per_100g", "sugar_per_100g", "fiber_per_100g", "sodium_mg_per_100g"].map((field, index) => [field, index === 0 ? 165 : index]));
  const reviewedIngredient = await invoke(updateIngredient, { params: { id: "4" }, user: { id: 7 }, body: { nombre: "pollo", foodGroup: "protein", substitutionGroup: "poultry", nutrition: { ...completeProfile, source: "professional", reference: "https://example.test/profile" } } });
  assert.equal(reviewedIngredient.status, 200);
  assert.equal(reviewedIngredient.body.nutrition_source, "professional");
  const missingReference = await invoke(createRecipe, {
    user: { id: 1 },
    body: { nombre: "Receta revisada", descripcion: "Descripcion suficiente", calorias: 200, tiempo_preparacion: 20, nivel_salud: 4, servings: 1, nutrition_source: "professional", ingredients: [] }
  });
  assert.equal(missingReference.status, 400);
  console.log(JSON.stringify({ ok: true, recipePagination: true, recipeSearch: true, ingredientPagination: true, ingredientSearch: true, ingredientNutritionQueue: true, manualIngredientProfile: true, foodGroupAllowlist: true, nutritionReferenceRequired: true }, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
