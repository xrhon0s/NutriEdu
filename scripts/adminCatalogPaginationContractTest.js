const assert = require("node:assert/strict");

const fakePool = {
  async query(sql, params) {
    if (sql.includes("COUNT(*)::int AS total FROM recetas")) return { rows: [{ total: 18 }] };
    if (sql.includes("json_agg") && sql.includes("LIMIT")) return { rows: [{ id: 8, nombre: "Sopa", ingredients: [] }] };
    if (sql.includes("COUNT(*)::int AS total FROM ingredientes")) return { rows: [{ total: 22 }] };
    if (sql.includes("FROM ingredientes") && sql.includes("LIMIT") && !sql.includes("COUNT(*)")) {
      assert.equal(params[0], "%pollo%");
      assert.equal(params[1], "protein");
      assert.equal(params[2], "poultry");
      return { rows: [{ id: 4, nombre: "pollo", food_group: "protein", substitution_group: "poultry" }] };
    }
    throw new Error(`Unexpected catalog pagination query: ${sql}`);
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: fakePool };
const { listRecipes, listIngredients, createIngredient, createRecipe } = require("../controllers/adminController");

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

  const ingredients = await invoke(listIngredients, { query: { page: "1", limit: "10", search: "pollo", foodGroup: "protein", substitutionGroup: "poultry" } });
  assert.equal(ingredients.body.pagination.totalPages, 3);
  assert.equal(ingredients.body.items[0].food_group, "protein");
  assert.equal(ingredients.body.items[0].substitution_group, "poultry");

  const invalidGroup = await invoke(createIngredient, { body: { nombre: "nuevo", foodGroup: "vitamin", substitutionGroup: "other" } });
  assert.equal(invalidGroup.status, 400);
  const missingReference = await invoke(createRecipe, {
    user: { id: 1 },
    body: { nombre: "Receta revisada", descripcion: "Descripcion suficiente", calorias: 200, tiempo_preparacion: 20, nivel_salud: 4, servings: 1, nutrition_source: "professional", ingredients: [] }
  });
  assert.equal(missingReference.status, 400);
  console.log(JSON.stringify({ ok: true, recipePagination: true, recipeSearch: true, ingredientPagination: true, ingredientSearch: true, foodGroupAllowlist: true, nutritionReferenceRequired: true }, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
