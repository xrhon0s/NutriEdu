const assert = require("node:assert/strict");

let detailedQueryVerified = false;
let metadataQueryVerified = false;

const fakePool = {
  async query(sql, params) {
    assert.deepEqual(params, [7]);

    if (sql.includes("WITH ingredient_uses AS")) {
      detailedQueryVerified = sql.includes("SUM(amount_g)")
        && sql.includes("COUNT(*) FILTER (WHERE amount_g IS NULL AND amount IS NULL)")
        && sql.includes("ARRAY_AGG(DISTINCT recipe_name")
        && sql.includes("GROUP BY COALESCE(uses.unit, 'unidad')")
        && sql.includes("uses.amount_g IS NULL");
      return {
        rows: [
          {
            id: 4,
            nombre: "pollo",
            food_group: "protein",
            known_amount_g: 400,
            planned_uses: 2,
            missing_quantity_uses: 0,
            recipe_count: 1,
            source_recipes: ["Caldo de pollo"],
            quantities: []
          },
          {
            id: 12,
            nombre: "cebolla",
            food_group: "vegetable",
            known_amount_g: null,
            planned_uses: 2,
            missing_quantity_uses: 0,
            recipe_count: 2,
            source_recipes: ["Arroz con pollo", "Caldo de pollo"],
            quantities: [{ amount: 2, unit: "unidad" }]
          }
        ]
      };
    }

    if (sql.includes("AS plan_signature")) {
      metadataQueryVerified = sql.includes("STRING_AGG") && sql.includes("dia_semana");
      return { rows: [{ planned_meals: 2, plan_signature: "plan-v1" }] };
    }

    if (sql.includes("SELECT DISTINCT i.id, i.nombre")) {
      return { rows: [{ id: 4, nombre: "pollo" }] };
    }

    throw new Error(`Unexpected shopping-list query: ${sql}`);
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: fakePool
};

const { getShoppingList } = require("../controllers/plannerController");

const invoke = async (query) => {
  let body;
  const response = {
    status() { return this; },
    json(value) { body = value; return value; }
  };
  await getShoppingList({ user: { id: 7 }, query }, response);
  return body;
};

const run = async () => {
  const detailed = await invoke({ detailed: "true" });
  assert.equal(detailedQueryVerified, true);
  assert.equal(metadataQueryVerified, true);
  assert.equal(detailed.planSignature, "plan-v1");
  assert.equal(detailed.plannedMeals, 2);
  assert.equal(detailed.missingQuantityItems, 0);
  assert.deepEqual(detailed.items[0], {
    id: 4,
    nombre: "pollo",
    foodGroup: "protein",
    knownAmountG: 400,
    plannedUses: 2,
    missingQuantityUses: 0,
    recipeCount: 1,
    sourceRecipes: ["Caldo de pollo"],
    quantities: []
  });
  assert.deepEqual(detailed.items[1].quantities, [{ amount: 2, unit: "unidad" }]);

  const legacy = await invoke({});
  assert.deepEqual(legacy, [{ id: 4, nombre: "pollo" }]);

  console.log(JSON.stringify({
    ok: true,
    legacyContractPreserved: true,
    quantitiesAggregated: true,
    categoriesIncluded: true,
    planSignatureIncluded: true
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
