const assert = require("node:assert/strict");

let nutritionFieldsVerified = false;

const fakePool = {
  async query(sql, params) {
    assert.deepEqual(params, [7]);
    nutritionFieldsVerified = [
      "r.calorias",
      "r.protein_g",
      "r.carbs_g",
      "r.fat_g",
      "r.saturated_fat_g",
      "r.sugar_g",
      "r.fiber_g",
      "r.sodium_mg"
    ].every((field) => sql.includes(field));

    return {
      rows: [{
        id: 10,
        dia_semana: "Lunes",
        tipo_comida: "Almuerzo",
        receta_id: 4,
        receta_nombre: "Pollo con arroz",
        calorias: 540,
        protein_g: 35,
        carbs_g: 58,
        fat_g: 16,
        saturated_fat_g: 4,
        sugar_g: 3,
        fiber_g: 7,
        sodium_mg: 430
      }]
    };
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: fakePool
};

const { getWeeklyPlan } = require("../controllers/plannerController");

const run = async () => {
  let body;
  const response = {
    status() { return this; },
    json(value) { body = value; return value; }
  };

  await getWeeklyPlan({ user: { id: 7 }, params: { userId: "999" } }, response);

  assert.equal(nutritionFieldsVerified, true);
  assert.equal(body[0].protein_g, 35);
  assert.equal(body[0].sodium_mg, 430);
  console.log(JSON.stringify({
    ok: true,
    authenticatedIdentityUsed: true,
    plannerNutritionIncluded: true
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
