const pool = require("../database/db");
const { calculateFromIngredientProfiles } = require("../services/recipeNutritionCalculationService");

const PILOT_RECIPE = "Yogur con almendras";
const PILOT_INGREDIENTS = [
  {
    name: "yogur natural", fdcId: 171284, amountG: 170,
    nutrition: [61, 3.47, 4.66, 3.25, 2.1, 4.66, 0, 46]
  },
  {
    name: "almendras", fdcId: 170567, amountG: 15,
    nutrition: [579, 21.15, 21.55, 49.93, 3.802, 4.35, 12.5, 1]
  },
  {
    name: "miel", fdcId: 169640, amountG: 10,
    nutrition: [304, 0.3, 82.4, 0, 0, 82.1, 0.2, 4]
  }
];
const NUTRIENT_COLUMNS = [
  "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g",
  "saturated_fat_per_100g", "sugar_per_100g", "fiber_per_100g", "sodium_mg_per_100g"
];

const loadReviewer = async (client) => {
  const requestedEmail = process.env.PILOT_REVIEWER_EMAIL?.trim().toLowerCase();
  const result = requestedEmail
    ? await client.query("SELECT id, email FROM usuarios WHERE LOWER(email)=$1 AND rol='administrador'", [requestedEmail])
    : await client.query("SELECT id, email FROM usuarios WHERE rol='administrador' ORDER BY id LIMIT 1");
  if (!result.rows[0]) throw new Error("No existe un administrador para registrar como revisor del piloto.");
  return result.rows[0];
};

const run = async () => {
  const apply = process.argv.includes("--apply");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nutriedu:nutrition-pilot:v1'))");
    const reviewer = await loadReviewer(client);
    const recipeResult = await client.query("SELECT id, nombre FROM recetas WHERE LOWER(nombre)=LOWER($1)", [PILOT_RECIPE]);
    if (recipeResult.rows.length !== 1) throw new Error(`Se esperaba una receta única llamada ${PILOT_RECIPE}.`);
    const recipe = recipeResult.rows[0];
    const names = PILOT_INGREDIENTS.map((item) => item.name);
    const ingredientResult = await client.query("SELECT id, nombre FROM ingredientes WHERE LOWER(nombre)=ANY($1::text[])", [names]);
    if (ingredientResult.rows.length !== PILOT_INGREDIENTS.length) throw new Error("No se encontraron exactamente los tres ingredientes del piloto.");
    const byName = new Map(ingredientResult.rows.map((item) => [item.nombre.toLowerCase(), item]));
    const relationResult = await client.query("SELECT ingrediente_id FROM receta_ingredientes WHERE receta_id=$1", [recipe.id]);
    const relationIds = new Set(relationResult.rows.map((item) => Number(item.ingrediente_id)));
    const expectedIds = PILOT_INGREDIENTS.map((item) => Number(byName.get(item.name)?.id));
    if (relationIds.size !== expectedIds.length || expectedIds.some((id) => !relationIds.has(id))) {
      throw new Error("La composición actual de la receta no coincide exactamente con el piloto versionado.");
    }

    const reviewedAt = new Date().toISOString();
    const profiles = [];
    for (const item of PILOT_INGREDIENTS) {
      const ingredient = byName.get(item.name);
      const sourceReference = `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${item.fdcId}/nutrients`;
      const updated = await client.query(
        `UPDATE ingredientes SET fdc_id=$2, ${NUTRIENT_COLUMNS.map((column, index) => `${column}=$${index + 3}`).join(", ")},
          nutrition_source='usda_fdc', nutrition_source_reference=$11, nutrition_reviewed_by=$12, nutrition_reviewed_at=$13
         WHERE id=$1 RETURNING *`,
        [ingredient.id, item.fdcId, ...item.nutrition, sourceReference, reviewer.id, reviewedAt]
      );
      await client.query(
        "UPDATE receta_ingredientes SET amount=$3, unit='g', amount_g=$3 WHERE receta_id=$1 AND ingrediente_id=$2",
        [recipe.id, ingredient.id, item.amountG]
      );
      profiles.push(updated.rows[0]);
    }

    const calculation = calculateFromIngredientProfiles({
      servings: 1,
      ingredients: PILOT_INGREDIENTS.map((item) => ({ id: byName.get(item.name).id, amountG: item.amountG }))
    }, profiles);
    await client.query(
      `UPDATE recetas SET calorias=$2, protein_g=$3, carbs_g=$4, fat_g=$5, saturated_fat_g=$6,
        sugar_g=$7, fiber_g=$8, sodium_mg=$9, serving_size_g=$10, servings=$11,
        nutrition_source=$12, nutrition_source_reference=$13, nutrition_reviewed_by=$14, nutrition_reviewed_at=$15
       WHERE id=$1`,
      [recipe.id, Math.round(calculation.calorias), calculation.protein_g, calculation.carbs_g, calculation.fat_g,
        calculation.saturated_fat_g, calculation.sugar_g, calculation.fiber_g, calculation.sodium_mg,
        calculation.serving_size_g, calculation.servings, calculation.nutrition_source,
        calculation.nutrition_source_reference, reviewer.id, reviewedAt]
    );

    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    console.log(JSON.stringify({ mode: apply ? "applied" : "dry_run", recipe: { id: recipe.id, name: recipe.nombre }, reviewer: reviewer.email, ingredients: PILOT_INGREDIENTS.map((item) => ({ name: item.name, fdcId: item.fdcId, amountG: item.amountG })), calculation }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { PILOT_INGREDIENTS, PILOT_RECIPE };
