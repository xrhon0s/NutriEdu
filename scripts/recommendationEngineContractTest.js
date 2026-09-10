const assert = require("node:assert/strict");
const {
  buildPerMealTargets,
  estimateDailyEnergy,
  findConstraintConflicts,
  getRecipeRecommendations
} = require("../services/recommendationService");

const profile = {
  fecha_nacimiento: "1996-01-15",
  sexo: "male",
  estatura_cm: 178,
  peso_kg: 78,
  nivel_actividad: "moderate",
  habitos_alimentarios: { meals_per_day: 3 },
  preferencias_alimentarias: { diet_style: "omnivore", cooking_time: "short" }
};
const conditions = [{ code: "hypertension", risk_level: "high", requires_professional_guidance: true }];

const run = async () => {
  const now = new Date("2026-09-07T12:00:00Z");
  const energy = estimateDailyEnergy(profile, conditions, now);
  assert.equal(energy.source, "nasem_eer_2023");
  assert.ok(energy.value > 2000);

  const targetProfile = buildPerMealTargets({
    profile,
    conditions,
    now,
    targets: { calories_min: 2100, calories_max: 2400, protein_min_g: 90, calculation_source: "professional" }
  });
  assert.deepEqual(targetProfile.perMeal.calories, { min: 700, max: 800, unit: "kcal", period: "per_meal" });
  assert.equal(targetProfile.perMeal.protein_g.min, 30);

  const conflicts = findConstraintConflicts(
    [{ nutrient: "protein_g", rule_type: "max", min_value: null, max_value: 25, scope_type: "condition", scope_code: "kidney_disease" }],
    targetProfile.perMeal
  );
  assert.equal(conflicts[0].code, "CONFLICTING_LIMITS");

  const fakePool = {
    async query(sql) {
      if (sql.includes("FROM perfiles_usuario")) return { rows: [profile] };
      if (sql.includes("FROM usuario_objetivos")) return { rows: [{ code: "gain_muscle", nombre: "Ganar masa", prioridad: 1 }] };
      if (sql.includes("FROM usuario_condiciones")) return { rows: conditions };
      if (sql.includes("FROM usuario_metas_nutricionales")) return { rows: [{ calories_min: 2100, calories_max: 2400, protein_min_g: 90, calculation_source: "professional" }] };
      if (sql.includes("FROM usuario_restricciones")) return { rows: [{ id: 1, nombre: "gluten" }] };
      if (sql.includes("FROM restricciones WHERE")) return { rows: [{ id: 1, nombre: "gluten" }] };
      if (sql.includes("FROM reglas_nutricionales")) return { rows: [
        { scope_type: "goal", scope_code: "gain_muscle", nutrient: "protein_g", rule_type: "min", min_value: 25, max_value: null, unit: "g_per_meal", severity: "info", message: "Proteina baja" },
        { scope_type: "condition", scope_code: "hypertension", nutrient: "sodium_mg", rule_type: "max", min_value: null, max_value: 600, unit: "mg_per_meal", severity: "danger", message: "Sodio alto" }
      ] };
      if (sql.includes("GROUP BY r.id")) return { rows: [
        { id: 2, nombre: "Opcion limitada", calorias: 420, protein_g: 12, sodium_mg: 800, tiempo_preparacion: 60, nivel_salud: 3 },
        { id: 1, nombre: "Opcion compatible", calorias: 740, protein_g: 32, carbs_g: 70, fat_g: 20, saturated_fat_g: 4, sugar_g: 6, fiber_g: 8, sodium_mg: 420, tiempo_preparacion: 18, nivel_salud: 5 }
      ] };
      throw new Error(`Unexpected recommendation query: ${sql}`);
    }
  };

  const result = await getRecipeRecommendations(fakePool, { userId: 1, limit: 6, offset: 0, now });
  assert.equal(result.recipes[0].id, 1);
  assert.ok(result.recipes[0].recommendation.score > result.recipes[1].recommendation.score);
  assert.equal(result.recipes[0].recommendation.confidence, 1);
  assert.equal(result.profileContext.clinicalReviewRequired, true);
  assert.ok(result.profileContext.usedFactors.includes("goals_and_priority"));
  assert.ok(result.recipes[0].recommendation.reasons.length > 0);

  console.log(JSON.stringify({
    ok: true,
    dailyTargetsConverted: true,
    energyEstimateAttributed: true,
    conflictsDetected: true,
    deterministicRanking: true,
    explainableResults: true
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
