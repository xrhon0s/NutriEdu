const NUTRIENT_FIELDS = {
  calories: "calorias",
  protein_g: "protein_g",
  carbs_g: "carbs_g",
  fat_g: "fat_g",
  saturated_fat_g: "saturated_fat_g",
  sugar_g: "sugar_g",
  fiber_g: "fiber_g",
  sodium_mg: "sodium_mg"
};

const TARGET_FIELDS = {
  calories: ["calories_min", "calories_max", "kcal"],
  protein_g: ["protein_min_g", "protein_max_g", "g"],
  carbs_g: ["carbs_min_g", "carbs_max_g", "g"],
  fat_g: ["fat_min_g", "fat_max_g", "g"],
  saturated_fat_g: [null, "saturated_fat_max_g", "g"],
  sugar_g: [null, "sugar_max_g", "g"],
  fiber_g: ["fiber_min_g", null, "g"],
  sodium_mg: [null, "sodium_max_mg", "mg"]
};

const SEVERITY_PENALTY = { info: 4, warning: 10, danger: 22 };
const DIET_RESTRICTIONS = { vegan: ["vegano"], vegetarian: ["vegetariano"] };
const CONDITION_RESTRICTIONS = {
  celiac_disease: ["gluten"],
  lactose_intolerance: ["lactosa"]
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const asObject = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const round = (value, precision = 0) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const ageFromBirthDate = (birthDate, now = new Date()) => {
  if (!birthDate) return null;
  const date = new Date(`${String(birthDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date > now) return null;
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < date.getUTCMonth()
    || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
};

const estimateDailyEnergy = (profile, conditions, now = new Date()) => {
  const age = ageFromBirthDate(profile?.fecha_nacimiento, now);
  const sex = profile?.sexo;
  const height = toNumber(profile?.estatura_cm);
  const weight = toNumber(profile?.peso_kg);
  const activity = profile?.nivel_actividad;
  const missing = [];

  if (age === null) missing.push("birthDate");
  if (!sex) missing.push("sex");
  if (height === null) missing.push("height");
  if (weight === null) missing.push("weight");
  if (!activity) missing.push("activity");
  if (conditions.some((condition) => condition.code === "pregnancy")) {
    return { value: null, reason: "pregnancy_requires_specific_target", missing };
  }
  if (missing.length || age < 19 || !["male", "female"].includes(sex)) {
    return { value: null, reason: age !== null && age < 19 ? "adult_equation_not_applicable" : "profile_incomplete", missing };
  }

  const activityBand = {
    sedentary: "inactive",
    light: "lowActive",
    moderate: "active",
    high: "veryActive",
    athlete: "veryActive"
  }[activity];
  if (!activityBand) return { value: null, reason: "activity_not_supported", missing: ["activity"] };

  const equations = {
    male: {
      inactive: () => 753.07 - (10.83 * age) + (6.5 * height) + (14.1 * weight),
      lowActive: () => 581.47 - (10.83 * age) + (8.3 * height) + (14.94 * weight),
      active: () => 1004.82 - (10.83 * age) + (6.52 * height) + (15.91 * weight),
      veryActive: () => -517.88 - (10.83 * age) + (15.61 * height) + (19.11 * weight)
    },
    female: {
      inactive: () => 584.9 - (7.01 * age) + (5.72 * height) + (11.71 * weight),
      lowActive: () => 575.77 - (7.01 * age) + (6.6 * height) + (12.14 * weight),
      active: () => 710.25 - (7.01 * age) + (6.54 * height) + (12.34 * weight),
      veryActive: () => 511.83 - (7.01 * age) + (9.07 * height) + (12.56 * weight)
    }
  };

  return {
    value: round(equations[sex][activityBand]()),
    source: "nasem_eer_2023",
    age,
    activityBand,
    missing: []
  };
};

const buildPerMealTargets = ({ profile, targets, conditions, now }) => {
  const habits = asObject(profile?.habitos_alimentarios);
  const parsedMeals = Number.parseInt(habits.meals_per_day, 10);
  const mealsPerDay = Number.isInteger(parsedMeals) && parsedMeals >= 1 && parsedMeals <= 8 ? parsedMeals : 3;
  const explicitTargets = targets || {};
  const estimate = estimateDailyEnergy(profile, conditions, now);
  const perMeal = {};
  const sources = {};

  Object.entries(TARGET_FIELDS).forEach(([nutrient, [minField, maxField, unit]]) => {
    let min = minField ? toNumber(explicitTargets[minField]) : null;
    let max = maxField ? toNumber(explicitTargets[maxField]) : null;
    let source = min !== null || max !== null ? (explicitTargets.calculation_source || "manual") : null;

    if (nutrient === "calories" && min === null && max === null && estimate.value !== null) {
      min = estimate.value * 0.9;
      max = estimate.value * 1.1;
      source = estimate.source;
    }
    if (min === null && max === null) return;

    perMeal[nutrient] = {
      min: min === null ? null : round(min / mealsPerDay, 1),
      max: max === null ? null : round(max / mealsPerDay, 1),
      unit,
      period: "per_meal"
    };
    sources[nutrient] = source;
  });

  return { perMeal, sources, mealsPerDay, energyEstimate: estimate };
};

const breaksRule = (value, rule) => {
  const min = toNumber(rule.min_value);
  const max = toNumber(rule.max_value);
  if (rule.rule_type === "min") return min !== null && value < min;
  if (rule.rule_type === "max") return max !== null && value > max;
  if (rule.rule_type === "range") return (min !== null && value < min) || (max !== null && value > max);
  return false;
};

const sourceMultiplier = (rule, goals, conditions) => {
  if (rule.scope_type === "goal") {
    const priority = goals.find((goal) => goal.code === rule.scope_code)?.prioridad || 3;
    return priority === 1 ? 1.25 : priority === 2 ? 1.1 : 1;
  }
  if (rule.scope_type === "condition") {
    const risk = conditions.find((condition) => condition.code === rule.scope_code)?.risk_level;
    return risk === "high" ? 1.25 : risk === "medium" ? 1.1 : 1;
  }
  return 1;
};

const cookingLimit = (profile) => {
  const preference = asObject(profile?.preferencias_alimentarias).cooking_time;
  return { short: 20, medium: 45, long: null }[preference] ?? null;
};

const findConstraintConflicts = (rules, perMealTargets) => {
  const byNutrient = new Map();
  const add = (nutrient, type, value, source) => {
    if (value === null) return;
    if (!byNutrient.has(nutrient)) byNutrient.set(nutrient, { mins: [], maxes: [] });
    byNutrient.get(nutrient)[type].push({ value, source });
  };

  rules.forEach((rule) => {
    if (["min", "range"].includes(rule.rule_type)) add(rule.nutrient, "mins", toNumber(rule.min_value), `${rule.scope_type}:${rule.scope_code}`);
    if (["max", "range"].includes(rule.rule_type)) add(rule.nutrient, "maxes", toNumber(rule.max_value), `${rule.scope_type}:${rule.scope_code}`);
  });
  Object.entries(perMealTargets).forEach(([nutrient, target]) => {
    add(nutrient, "mins", target.min, "user_targets");
    add(nutrient, "maxes", target.max, "user_targets");
  });

  return [...byNutrient.entries()].flatMap(([nutrient, values]) => {
    if (!values.mins.length || !values.maxes.length) return [];
    const min = values.mins.reduce((highest, item) => item.value > highest.value ? item : highest);
    const max = values.maxes.reduce((lowest, item) => item.value < lowest.value ? item : lowest);
    return min.value > max.value ? [{ nutrient, min, max, code: "CONFLICTING_LIMITS" }] : [];
  });
};

const evaluateRecipe = (recipe, context) => {
  let score = 100;
  const reasons = [];
  const warnings = [];
  const missingNutrients = new Set();

  context.rules.forEach((rule) => {
    const field = NUTRIENT_FIELDS[rule.nutrient];
    if (!field) return;
    const value = toNumber(recipe[field]);
    if (value === null) {
      missingNutrients.add(rule.nutrient);
      return;
    }
    if (breaksRule(value, rule)) {
      const penalty = SEVERITY_PENALTY[rule.severity] || SEVERITY_PENALTY.warning;
      score -= penalty * sourceMultiplier(rule, context.goals, context.conditions);
      warnings.push({
        source: rule.scope_type,
        sourceCode: rule.scope_code,
        nutrient: rule.nutrient,
        severity: rule.severity,
        message: rule.message,
        value,
        minValue: toNumber(rule.min_value),
        maxValue: toNumber(rule.max_value),
        unit: rule.unit
      });
    } else if (rule.scope_type !== "global" && reasons.length < 4) {
      reasons.push(`Cumple la regla de ${rule.nutrient} para ${rule.scope_code}.`);
    }
  });

  Object.entries(context.targetProfile.perMeal).forEach(([nutrient, target]) => {
    const value = toNumber(recipe[NUTRIENT_FIELDS[nutrient]]);
    if (value === null) {
      missingNutrients.add(nutrient);
      return;
    }
    const below = target.min !== null && value < target.min;
    const above = target.max !== null && value > target.max;
    if (below || above) {
      const boundary = below ? target.min : target.max;
      const deviation = boundary > 0 ? Math.abs(value - boundary) / boundary : 1;
      score -= Math.min(18, 6 + (deviation * 12));
      warnings.push({
        source: "target",
        sourceCode: "effective_per_meal_target",
        nutrient,
        severity: "warning",
        message: below ? `Aporte inferior a la referencia por comida de ${nutrient}.` : `Aporte superior a la referencia por comida de ${nutrient}.`,
        value,
        minValue: target.min,
        maxValue: target.max,
        unit: target.unit
      });
    } else if (reasons.length < 4) {
      reasons.push(`Dentro de tu referencia por comida para ${nutrient}.`);
    }
  });

  const healthLevel = Math.min(5, Math.max(1, toNumber(recipe.nivel_salud) || 1));
  score -= (5 - healthLevel) * 2;

  const maxCookingMinutes = cookingLimit(context.profile);
  const preparationMinutes = toNumber(recipe.tiempo_preparacion);
  if (maxCookingMinutes !== null && preparationMinutes !== null) {
    if (preparationMinutes > maxCookingMinutes) {
      score -= Math.min(12, 4 + ((preparationMinutes - maxCookingMinutes) / maxCookingMinutes) * 8);
      warnings.push({
        source: "preference",
        sourceCode: "cooking_time",
        severity: "info",
        message: `Requiere más tiempo que los ${maxCookingMinutes} minutos indicados en tu perfil.`,
        value: preparationMinutes,
        maxValue: maxCookingMinutes,
        unit: "minutes"
      });
    } else {
      reasons.push("Se ajusta al tiempo que tienes disponible para cocinar.");
    }
  }

  const knownNutrients = Object.values(NUTRIENT_FIELDS)
    .filter((field) => toNumber(recipe[field]) !== null).length;
  const confidence = round(knownNutrients / Object.keys(NUTRIENT_FIELDS).length, 2);
  if (context.effectiveRestrictions.length) reasons.unshift("Compatible con tus restricciones alimentarias efectivas.");

  const boundedScore = Math.max(0, Math.min(100, round(score)));
  const hasDanger = warnings.some((warning) => warning.severity === "danger");
  const status = hasDanger || context.conflicts.length
    ? "review_required"
    : warnings.length || confidence < 0.5
      ? "suitable_with_adjustments"
      : "suitable";

  return {
    score: boundedScore,
    status,
    confidence,
    reasons: [...new Set(reasons)].slice(0, 5),
    warnings,
    missingNutrients: [...missingNutrients].sort()
  };
};

const buildContextSummary = (context) => {
  const usedFactors = [];
  if (context.effectiveRestrictions.length) usedFactors.push("restrictions");
  if (context.goals.length) usedFactors.push("goals_and_priority");
  if (context.conditions.length) usedFactors.push("clinical_conditions");
  if (Object.keys(context.targetProfile.perMeal).length) usedFactors.push("nutrition_targets");
  if (context.targetProfile.energyEstimate.value !== null) usedFactors.push("age_sex_height_weight_activity");
  if (context.latestProgress?.weight_kg != null) usedFactors.push("latest_progress_weight");
  if (asObject(context.profile?.habitos_alimentarios).meals_per_day) usedFactors.push("meals_per_day");
  if (cookingLimit(context.profile) !== null) usedFactors.push("cooking_time");

  const missingFactors = [];
  if (!context.profile) missingFactors.push("profile");
  if (!Object.keys(context.targetProfile.perMeal).length) missingFactors.push("nutrition_targets");
  missingFactors.push(...context.targetProfile.energyEstimate.missing.map((item) => `energy:${item}`));

  const habits = asObject(context.profile?.habitos_alimentarios);
  const notScoredFactors = [];
  if (context.profile?.condicion_fisica) notScoredFactors.push("physical_condition");
  if (context.profile?.notas) notScoredFactors.push("profile_notes");
  if (habits.eats_out_frequency) notScoredFactors.push("eating_out_frequency");

  return {
    usedFactors: [...new Set(usedFactors)],
    missingFactors: [...new Set(missingFactors)],
    notScoredFactors,
    effectiveRestrictions: context.effectiveRestrictions,
    goals: context.goals.map(({ code, prioridad }) => ({ code, priority: prioridad })),
    conditions: context.conditions.map(({ code, risk_level, requires_professional_guidance }) => ({ code, riskLevel: risk_level, requiresProfessionalGuidance: requires_professional_guidance })),
    targetBasis: {
      period: "per_meal",
      mealsPerDay: context.targetProfile.mealsPerDay,
      sources: context.targetProfile.sources,
      energyEstimate: context.targetProfile.energyEstimate.value === null ? null : {
        value: context.targetProfile.energyEstimate.value,
        source: context.targetProfile.energyEstimate.source
      }
    },
    progress: context.latestProgress ? {
      latestMeasurementDate: context.latestProgress.recorded_on,
      weightKg: toNumber(context.latestProgress.weight_kg)
    } : null,
    conflicts: context.conflicts,
    clinicalReviewRequired: context.conflicts.length > 0 || context.conditions.some((condition) => condition.requires_professional_guidance)
  };
};

const loadRecommendationContext = async (pool, userId, now) => {
  const [profileRes, goalsRes, conditionsRes, targetsRes, restrictionsRes, catalogRes, rulesRes, progressRes] = await Promise.all([
    pool.query("SELECT * FROM perfiles_usuario WHERE usuario_id = $1", [userId]),
    pool.query(
      `SELECT og.code, og.nombre, uo.prioridad
       FROM usuario_objetivos uo
       JOIN objetivos_nutricionales og ON og.id = uo.objetivo_id
       WHERE uo.usuario_id = $1 AND uo.estado = 'active' AND og.is_active = TRUE
       ORDER BY uo.prioridad ASC, og.code ASC`,
      [userId]
    ),
    pool.query(
      `SELECT cc.code, cc.nombre, cc.risk_level, cc.requires_professional_guidance
       FROM usuario_condiciones uc
       JOIN condiciones_clinicas cc ON cc.id = uc.condicion_id
       WHERE uc.usuario_id = $1 AND cc.is_active = TRUE
       ORDER BY cc.risk_level DESC, cc.code ASC`,
      [userId]
    ),
    pool.query("SELECT * FROM usuario_metas_nutricionales WHERE usuario_id = $1", [userId]),
    pool.query(
      `SELECT r.id, r.nombre
       FROM usuario_restricciones ur
       JOIN restricciones r ON r.id = ur.restriccion_id
       WHERE ur.usuario_id = $1`,
      [userId]
    ),
    pool.query("SELECT id, nombre FROM restricciones WHERE is_active = TRUE"),
    pool.query("SELECT * FROM reglas_nutricionales WHERE is_active = TRUE"),
    pool.query("SELECT recorded_on, weight_kg FROM usuario_progreso WHERE usuario_id = $1 ORDER BY recorded_on DESC, id DESC LIMIT 1", [userId])
  ]);

  const profile = profileRes.rows[0] || null;
  const goals = goalsRes.rows;
  const conditions = conditionsRes.rows;
  const preferences = asObject(profile?.preferencias_alimentarias);
  const derivedNames = new Set([
    ...(DIET_RESTRICTIONS[preferences.diet_style] || []),
    ...conditions.flatMap((condition) => CONDITION_RESTRICTIONS[condition.code] || [])
  ]);
  const explicitIds = new Set(restrictionsRes.rows.map((restriction) => Number(restriction.id)));
  const effectiveRestrictions = catalogRes.rows
    .filter((restriction) => explicitIds.has(Number(restriction.id)) || derivedNames.has(String(restriction.nombre).toLowerCase()))
    .map((restriction) => ({
      id: Number(restriction.id),
      name: restriction.nombre,
      source: explicitIds.has(Number(restriction.id)) ? "user" : "profile"
    }));
  restrictionsRes.rows.forEach((restriction) => {
    if (!effectiveRestrictions.some((item) => item.id === Number(restriction.id))) {
      effectiveRestrictions.push({ id: Number(restriction.id), name: restriction.nombre, source: "user" });
    }
  });

  const applicableCodes = new Set(["global:default"]);
  goals.forEach((goal) => applicableCodes.add(`goal:${goal.code}`));
  conditions.forEach((condition) => applicableCodes.add(`condition:${condition.code}`));
  const rules = rulesRes.rows.filter((rule) => applicableCodes.has(`${rule.scope_type}:${rule.scope_code}`));
  const targetProfile = buildPerMealTargets({ profile, targets: targetsRes.rows[0], conditions, now });
  const conflicts = findConstraintConflicts(rules, targetProfile.perMeal);

  return { profile, goals, conditions, rules, targetProfile, effectiveRestrictions, conflicts, latestProgress: progressRes.rows[0] || null };
};

const getRecipeRecommendations = async (pool, { userId, limit = 6, offset = 0, now = new Date() }) => {
  const context = await loadRecommendationContext(pool, userId, now);
  const restrictionIds = context.effectiveRestrictions.map((restriction) => restriction.id);
  const recipesRes = await pool.query(
    `SELECT r.*,
       EXISTS (
         SELECT 1 FROM usuario_recetas_favoritas favorites
         WHERE favorites.usuario_id = $2 AND favorites.receta_id = r.id
       ) AS "isFavorite",
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('id', i.id, 'nombre', i.nombre))
         FILTER (WHERE i.id IS NOT NULL), '[]'::jsonb
       ) AS ingredients
     FROM recetas r
     LEFT JOIN receta_ingredientes ri ON ri.receta_id = r.id
     LEFT JOIN ingredientes i ON i.id = ri.ingrediente_id
     WHERE NOT EXISTS (
       SELECT 1
       FROM receta_ingredientes unsafe_ri
       JOIN ingrediente_restricciones ir ON ir.ingrediente_id = unsafe_ri.ingrediente_id
       WHERE unsafe_ri.receta_id = r.id
         AND ir.restriccion_id = ANY($1::int[])
     )
     GROUP BY r.id`,
    [restrictionIds, userId]
  );

  const ranked = recipesRes.rows
    .map((recipe) => ({ ...recipe, recommendation: evaluateRecipe(recipe, context) }))
    .sort((first, second) =>
      second.recommendation.score - first.recommendation.score
      || second.recommendation.confidence - first.recommendation.confidence
      || (toNumber(second.nivel_salud) || 0) - (toNumber(first.nivel_salud) || 0)
      || (toNumber(first.calorias) || Number.MAX_SAFE_INTEGER) - (toNumber(second.calorias) || Number.MAX_SAFE_INTEGER)
      || Number(first.id) - Number(second.id));
  const page = ranked.slice(offset, offset + limit);

  return {
    recipes: page,
    pagination: {
      limit,
      offset,
      total: ranked.length,
      nextOffset: offset + limit < ranked.length ? offset + limit : null,
      hasMore: offset + limit < ranked.length
    },
    profileContext: buildContextSummary(context)
  };
};

module.exports = {
  ageFromBirthDate,
  buildPerMealTargets,
  estimateDailyEnergy,
  evaluateRecipe,
  findConstraintConflicts,
  getRecipeRecommendations,
  loadRecommendationContext
};
