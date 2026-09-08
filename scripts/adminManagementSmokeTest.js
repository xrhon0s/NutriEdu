require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../database/db");
const recipeTemplate = require("../templates/recipe_catalog/example.recipe.json");
const catalogTemplate = require("../templates/recipe_catalog/example.catalog.json");

const apiUrl = process.env.SMOKE_API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
const runId = Date.now();
const email = `admin-smoke-${runId}@example.test`;
const password = `Admin-Smoke-${runId}`;
let userId;
const importIds = [];
const importedRecipeKey = `smoke_recipe_${runId}`;
const importedIngredientKeys = [`smoke_protein_${runId}`, `smoke_grain_${runId}`];

const request = async (path, options = {}) => {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
};

const run = async () => {
  const weakPasswordResponse = await fetch(`${apiUrl}/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: "Weak Password", email: `weak-${runId}@example.test`, password: "1234" })
  });
  if (weakPasswordResponse.status !== 400 || (await weakPasswordResponse.json()).code !== "WEAK_PASSWORD") {
    throw new Error("Weak registration password was not rejected by the API");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const inserted = await pool.query(
    "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1,$2,$3,'administrador') RETURNING id",
    ["Admin Smoke Test", email, passwordHash]
  );
  userId = inserted.rows[0].id;
  const login = await request("/users/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const headers = { Authorization: `Bearer ${login.token}` };
  const users = await request("/admin/users?page=1&limit=5&search=admin-smoke", { headers });
  const catalogs = await request("/admin/clinical-catalogs", { headers });
  const rules = await request("/admin/nutrition-rules?page=1&limit=5", { headers });
  const restrictions = await request("/admin/restrictions", { headers });
  const visionUsage = await request("/admin/vision-usage?page=1&limit=5", { headers });
  const recipes = await request("/admin/recipes?page=1&limit=5&search=", { headers });
  const ingredients = await request("/admin/ingredients?page=1&limit=5&foodGroup=protein", { headers });
  const templateValidation = await request("/admin/recipes/template/validate", {
    method: "POST",
    headers,
    body: JSON.stringify(recipeTemplate)
  });
  const importCatalog = JSON.parse(JSON.stringify(catalogTemplate));
  importCatalog.ingredients[0].externalKey = importedIngredientKeys[0];
  importCatalog.ingredients[0].name = `ingrediente proteina smoke ${runId}`;
  importCatalog.ingredients[1].externalKey = importedIngredientKeys[1];
  importCatalog.ingredients[1].name = `ingrediente cereal smoke ${runId}`;
  importCatalog.recipes[0].externalKey = importedRecipeKey;
  importCatalog.recipes[0].name = `Receta import smoke ${runId}`;
  importCatalog.recipes[0].ingredients = importCatalog.ingredients.map((ingredient, index) => ({
    externalKey: ingredient.externalKey,
    name: ingredient.name,
    amount: index === 0 ? 150 : 180,
    unit: "g",
    amountG: index === 0 ? 150 : 180
  }));
  const importPreview = await request("/admin/recipes/import/preview", { method: "POST", headers, body: JSON.stringify(importCatalog) });
  const firstImport = await request("/admin/recipes/import", { method: "POST", headers, body: JSON.stringify(importCatalog) });
  importIds.push(firstImport.importId);
  importCatalog.recipes[0].description = `Descripcion actualizada por smoke ${runId}`;
  const secondImport = await request("/admin/recipes/import", { method: "POST", headers, body: JSON.stringify(importCatalog) });
  importIds.push(secondImport.importId);
  const persistedImport = await pool.query(
    `SELECT r.descripcion, r.nutrition_reviewed_by, COUNT(ri.ingrediente_id)::int AS ingredient_count,
       MIN(ri.amount_g)::numeric AS minimum_amount_g
     FROM recetas r
     JOIN receta_ingredientes ri ON ri.receta_id=r.id
     WHERE r.external_key=$1
     GROUP BY r.id`,
    [importedRecipeKey]
  );
  const role = await request(`/admin/users/${userId}/role`, { method: "PATCH", headers, body: JSON.stringify({ role: "usuario" }) });
  const importedRecipe = persistedImport.rows[0];
  if (users.pagination.total !== 1 || !catalogs.goals.length || !catalogs.conditions.length || !rules.items.length || !restrictions.items.length || !visionUsage.policy || !recipes.pagination || !ingredients.pagination || !templateValidation.valid || !templateValidation.summary.recommendationReady || !importPreview.valid || importPreview.summary.recipesToCreate !== 1 || firstImport.counts.recipesCreated !== 1 || secondImport.counts.recipesUpdated !== 1 || importedRecipe?.descripcion !== importCatalog.recipes[0].description || importedRecipe?.nutrition_reviewed_by !== userId || importedRecipe?.ingredient_count !== 2 || Number(importedRecipe?.minimum_amount_g) <= 0 || role.rol !== "usuario") {
    throw new Error("Admin management smoke contract returned an unexpected result");
  }
  console.log(JSON.stringify({ ok: true, weakPasswordRejected: true, userSearch: true, catalogs: true, rules: true, restrictions: true, visionUsage: true, recipePagination: true, ingredientPagination: true, recipeTemplateValidation: true, recipeImportPreview: true, idempotentRecipeImport: true, ingredientQuantitiesPersisted: true, roleChange: true }, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await pool.query("DELETE FROM recetas WHERE external_key = $1", [importedRecipeKey]).catch(() => undefined);
  await pool.query("DELETE FROM ingredientes WHERE external_key = ANY($1::text[])", [importedIngredientKeys]).catch(() => undefined);
  if (importIds.length) await pool.query("DELETE FROM recipe_catalog_imports WHERE id = ANY($1::bigint[])", [importIds]).catch(() => undefined);
  if (userId) await pool.query("DELETE FROM usuarios WHERE id = $1", [userId]).catch(() => undefined);
  await pool.end();
});
