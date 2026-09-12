const assert = require("node:assert/strict");
const { buildNutritionWorklist, importNutritionPatch, validateNutritionPatch } = require("../services/recipeNutritionWorklistService");

const run = async () => {
  const worklist = buildNutritionWorklist([{
    id: 36, external_key: null, nombre: "Caldo de pollo", serving_size_g: null, servings: 2,
    calorias: 150, protein_g: null, carbs_g: null, fat_g: null, saturated_fat_g: null,
    sugar_g: null, fiber_g: null, sodium_mg: null, nutrition_source: "unknown",
    nutrition_source_reference: null
  }]);
  assert.equal(worklist.mode, "nutrition_patch");
  assert.equal(worklist.recipes[0].externalKey, "legacy_recipe_36");
  assert.equal(worklist.recipes[0].nutritionPerServing.calories, 150);
  assert.equal(worklist.recipes[0].nutritionPerServing.proteinG, null);
  assert.equal(Object.hasOwn(worklist.recipes[0], "ingredients"), false);
  assert.equal(validateNutritionPatch(worklist).valid, false);

  const complete = structuredClone(worklist);
  complete.recipes[0].portion.servingSizeG = 350;
  Object.keys(complete.recipes[0].nutritionPerServing).forEach((key) => {
    if (complete.recipes[0].nutritionPerServing[key] === null) complete.recipes[0].nutritionPerServing[key] = 1;
  });
  complete.recipes[0].nutritionProvenance = { source: "professional", reference: "Ficha tecnica revisada 2026-09-12" };
  assert.equal(validateNutritionPatch(complete).valid, true);

  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push(sql);
      if (sql.includes("SELECT id, external_key, nombre FROM recetas")) return { rows: [{ id: 36, external_key: null, nombre: "Caldo de pollo" }] };
      if (sql.includes("INSERT INTO recipe_catalog_imports")) return { rows: [{ id: 9, created_at: "2026-09-12T12:00:00Z" }] };
      if (sql.includes("UPDATE recetas SET")) {
        assert.equal(params.at(-1), 36);
        assert.equal(params[12], "Ficha tecnica revisada 2026-09-12");
      }
      return { rows: [] };
    },
    release() {}
  };
  const result = await importNutritionPatch({ async connect() { return client; } }, complete, 7);
  assert.equal(result.imported, true);
  assert.equal(result.counts.recipesUpdated, 1);
  assert.equal(statements.some((sql) => /DELETE\s+FROM\s+receta_ingredientes/i.test(sql)), false);
  assert.equal(statements.includes("COMMIT"), true);

  console.log(JSON.stringify({ ok: true, stableKeys: true, preservesKnownValues: true, ingredientsUntouched: true, verifiedSourceRequired: true, transactionAudited: true }, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
