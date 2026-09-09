const assert = require("node:assert/strict");

const unsafeIngredient = { id: 4, nombre: "pollo", food_group: "protein", substitution_group: "poultry" };
let legacySafetyUsesDistinct = false;
let substituteUsesCulinaryGroup = false;

const fakePool = {
  async query(sql, params) {
    if (sql.includes("FROM receta_ingredientes ri") && sql.includes("usuario_restricciones ur")) {
      legacySafetyUsesDistinct = /SELECT\s+DISTINCT\s+i\.id,\s*i\.nombre/i.test(sql);
      return { rows: [unsafeIngredient] };
    }
    if (sql.includes("FROM ingredientes i") && sql.includes("LIMIT 5")) {
      substituteUsesCulinaryGroup = sql.includes("i.substitution_group = $3") && params[2] === "poultry";
      return { rows: [{ id: 81, nombre: "pavo", food_group: "protein", substitution_group: "poultry" }] };
    }
    throw new Error(`Unexpected recipe safety query: ${sql}`);
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: fakePool
};

const { checkRecipeSafety } = require("../controllers/recipeController");
const { evaluateRecipeForUser } = require("../services/nutritionRuleService");

const run = async () => {
  let body;
  const request = { params: { recipeId: "36" }, user: { id: 1 } };
  const response = {
    status() { return this; },
    json(value) { body = value; return value; }
  };

  await checkRecipeSafety(request, response);

  assert.equal(legacySafetyUsesDistinct, true);
  assert.deepEqual(body.unsafeIngredients, [unsafeIngredient]);
  assert.equal(body.substitutes.length, 1);
  assert.equal(substituteUsesCulinaryGroup, true);
  assert.deepEqual(body.substitutes[0].opciones.map((item) => item.nombre), ["pavo"]);
  assert.equal(body.substitutes[0].opciones.some((item) => item.nombre === "tofu"), false);

  let clinicalSafetyUsesDistinct = false;
  const clinicalPool = {
    async query(sql) {
      if (sql.includes("SELECT * FROM recetas")) {
        return { rows: [{ id: 36, nombre: "Caldo de pollo casero" }] };
      }
      if (sql.includes("FROM receta_ingredientes ri")) {
        clinicalSafetyUsesDistinct = /SELECT\s+DISTINCT\s+i\.id,\s*i\.nombre/i.test(sql);
        return { rows: [unsafeIngredient] };
      }
      if (
        sql.includes("FROM usuario_objetivos") ||
        sql.includes("FROM usuario_condiciones") ||
        sql.includes("FROM usuario_metas_nutricionales") ||
        sql.includes("FROM reglas_nutricionales")
      ) {
        return { rows: [] };
      }
      throw new Error(`Unexpected clinical safety query: ${sql}`);
    }
  };
  const evaluation = await evaluateRecipeForUser(clinicalPool, { recipeId: 36, userId: 1 });

  assert.equal(clinicalSafetyUsesDistinct, true);
  assert.deepEqual(evaluation.unsafeIngredients, [unsafeIngredient]);
  assert.equal(evaluation.score, 60);

  console.log(JSON.stringify({
    ok: true,
    legacySafetyDeduplication: true,
    clinicalSafetyDeduplication: true,
    substituteGroupsUnique: true,
    culinarySubstitutionGroupRequired: true,
    arbitraryProteinFallbackRejected: true
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
