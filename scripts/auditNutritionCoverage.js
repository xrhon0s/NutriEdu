const pool = require("../database/db");

const run = async () => {
  const result = await pool.query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE calorias IS NOT NULL)::int AS calories,
    COUNT(*) FILTER (WHERE protein_g IS NOT NULL)::int AS protein,
    COUNT(*) FILTER (WHERE carbs_g IS NOT NULL)::int AS carbs,
    COUNT(*) FILTER (WHERE fat_g IS NOT NULL)::int AS fat,
    COUNT(*) FILTER (WHERE fiber_g IS NOT NULL)::int AS fiber,
    COUNT(*) FILTER (WHERE sodium_mg IS NOT NULL)::int AS sodium,
    COUNT(*) FILTER (WHERE serving_size_g IS NOT NULL)::int AS serving,
    COUNT(*) FILTER (WHERE nutrition_source <> 'unknown')::int AS sourced
    FROM recetas`);
  const row = result.rows[0];
  const coverage = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "total").map(([key, count]) => [key, { count, percent: row.total ? Math.round((count / row.total) * 100) : 0 }]));
  console.log(JSON.stringify({ totalRecipes: row.total, coverage }, null, 2));
};
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
