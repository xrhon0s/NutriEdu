const pool = require("../database/db");

const run = async () => {
  const [result, ingredientResult, recipeReadinessResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE calorias IS NOT NULL)::int AS calories,
    COUNT(*) FILTER (WHERE protein_g IS NOT NULL)::int AS protein,
    COUNT(*) FILTER (WHERE carbs_g IS NOT NULL)::int AS carbs,
    COUNT(*) FILTER (WHERE fat_g IS NOT NULL)::int AS fat,
    COUNT(*) FILTER (WHERE fiber_g IS NOT NULL)::int AS fiber,
    COUNT(*) FILTER (WHERE sodium_mg IS NOT NULL)::int AS sodium,
    COUNT(*) FILTER (WHERE serving_size_g IS NOT NULL)::int AS serving,
    COUNT(*) FILTER (WHERE nutrition_source <> 'unknown')::int AS sourced
    FROM recetas`),
    pool.query(`SELECT i.id, i.nombre,
      COUNT(DISTINCT ri.receta_id)::int AS recipe_usage_count,
      (CASE WHEN i.calories_per_100g IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN i.protein_per_100g IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN i.carbs_per_100g IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN i.fat_per_100g IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN i.saturated_fat_per_100g IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN i.sugar_per_100g IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN i.fiber_per_100g IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN i.sodium_mg_per_100g IS NOT NULL THEN 1 ELSE 0 END)::int AS nutrient_count,
      i.nutrition_source, i.nutrition_reviewed_at
      FROM ingredientes i
      LEFT JOIN receta_ingredientes ri ON ri.ingrediente_id = i.id
      GROUP BY i.id
      ORDER BY recipe_usage_count DESC, i.nombre
      LIMIT 12`),
    pool.query(`WITH readiness AS (
      SELECT r.id, r.nombre, COUNT(ri.ingrediente_id)::int AS ingredient_count,
        COUNT(*) FILTER (WHERE ri.ingrediente_id IS NOT NULL AND (
          i.calories_per_100g IS NULL OR i.protein_per_100g IS NULL OR i.carbs_per_100g IS NULL OR i.fat_per_100g IS NULL
          OR i.saturated_fat_per_100g IS NULL OR i.sugar_per_100g IS NULL OR i.fiber_per_100g IS NULL OR i.sodium_mg_per_100g IS NULL
          OR i.nutrition_source = 'unknown' OR i.nutrition_reviewed_at IS NULL
        ))::int AS profile_blockers,
        COUNT(*) FILTER (WHERE ri.ingrediente_id IS NOT NULL AND ri.amount_g IS NULL)::int AS quantity_blockers
      FROM recetas r
      LEFT JOIN receta_ingredientes ri ON ri.receta_id = r.id
      LEFT JOIN ingredientes i ON i.id = ri.ingrediente_id
      GROUP BY r.id
    ) SELECT * FROM readiness
      ORDER BY (profile_blockers + quantity_blockers), ingredient_count, nombre
      LIMIT 10`)
  ]);
  const row = result.rows[0];
  const coverage = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "total").map(([key, count]) => [key, { count, percent: row.total ? Math.round((count / row.total) * 100) : 0 }]));
  console.log(JSON.stringify({
    totalRecipes: row.total,
    coverage,
    priorityIngredients: ingredientResult.rows,
    recipesClosestToCalculation: recipeReadinessResult.rows
  }, null, 2));
};
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
