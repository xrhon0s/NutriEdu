const nutrientFieldMap = {
  calories: "calorias",
  protein_g: "protein_g",
  carbs_g: "carbs_g",
  fat_g: "fat_g",
  saturated_fat_g: "saturated_fat_g",
  sugar_g: "sugar_g",
  fiber_g: "fiber_g",
  sodium_mg: "sodium_mg"
};

const severityPenalty = {
  info: 5,
  warning: 12,
  danger: 25
};

const statusFromEvaluation = ({ unsafeIngredients, alerts }) => {
  if (unsafeIngredients.length > 0) return "not_suitable";
  if (alerts.some((alert) => alert.severity === "danger")) return "review_required";
  if (alerts.some((alert) => alert.severity === "warning")) return "suitable_with_adjustments";
  return "suitable";
};

const getNumericValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? null : numericValue;
};

const evaluateRule = (recipe, rule) => {
  const recipeField = nutrientFieldMap[rule.nutrient];
  if (!recipeField) return null;

  const value = getNumericValue(recipe[recipeField]);
  if (value === null) return null;

  const minValue = getNumericValue(rule.min_value);
  const maxValue = getNumericValue(rule.max_value);

  const breaksMin = rule.rule_type === "min" && minValue !== null && value < minValue;
  const breaksMax = rule.rule_type === "max" && maxValue !== null && value > maxValue;
  const breaksRange =
    rule.rule_type === "range" &&
    ((minValue !== null && value < minValue) || (maxValue !== null && value > maxValue));

  if (!breaksMin && !breaksMax && !breaksRange) return null;

  return {
    source: rule.scope_type,
    sourceCode: rule.scope_code,
    nutrient: rule.nutrient,
    value,
    minValue,
    maxValue,
    unit: rule.unit,
    severity: rule.severity,
    message: rule.message
  };
};

const buildTargetAlerts = (recipe, targets) => {
  if (!targets) return [];

  const checks = [
    {
      nutrient: "calories",
      field: "calorias",
      min: targets.calories_min,
      max: targets.calories_max,
      unit: "kcal",
      minMessage: "Esta receta podria quedar baja en calorias para tu meta.",
      maxMessage: "Esta receta puede superar tu limite de calorias."
    },
    {
      nutrient: "protein_g",
      field: "protein_g",
      min: targets.protein_min_g,
      max: targets.protein_max_g,
      unit: "g",
      minMessage: "Esta receta podria necesitar mas proteina para tu meta.",
      maxMessage: "Esta receta puede superar tu limite de proteina."
    },
    {
      nutrient: "carbs_g",
      field: "carbs_g",
      min: targets.carbs_min_g,
      max: targets.carbs_max_g,
      unit: "g",
      minMessage: "Esta receta podria quedar baja en carbohidratos para tu meta.",
      maxMessage: "Esta receta puede superar tu limite de carbohidratos."
    },
    {
      nutrient: "fat_g",
      field: "fat_g",
      min: targets.fat_min_g,
      max: targets.fat_max_g,
      unit: "g",
      minMessage: "Esta receta podria quedar baja en grasas para tu meta.",
      maxMessage: "Esta receta puede superar tu limite de grasas."
    },
    {
      nutrient: "saturated_fat_g",
      field: "saturated_fat_g",
      max: targets.saturated_fat_max_g,
      unit: "g",
      maxMessage: "Esta receta puede superar tu limite de grasa saturada."
    },
    {
      nutrient: "sugar_g",
      field: "sugar_g",
      max: targets.sugar_max_g,
      unit: "g",
      maxMessage: "Esta receta puede superar tu limite de azucar."
    },
    {
      nutrient: "fiber_g",
      field: "fiber_g",
      min: targets.fiber_min_g,
      unit: "g",
      minMessage: "Esta receta podria necesitar mas fibra para tu meta."
    },
    {
      nutrient: "sodium_mg",
      field: "sodium_mg",
      max: targets.sodium_max_mg,
      unit: "mg",
      maxMessage: "Esta receta puede superar tu limite de sodio."
    }
  ];

  return checks.flatMap((check) => {
    const value = getNumericValue(recipe[check.field]);
    if (value === null) return [];

    const min = getNumericValue(check.min);
    const max = getNumericValue(check.max);
    const alerts = [];

    if (min !== null && value < min) {
      alerts.push({
        source: "target",
        sourceCode: "user_targets",
        nutrient: check.nutrient,
        value,
        minValue: min,
        maxValue: max,
        unit: check.unit,
        severity: "info",
        message: check.minMessage
      });
    }

    if (max !== null && value > max) {
      alerts.push({
        source: "target",
        sourceCode: "user_targets",
        nutrient: check.nutrient,
        value,
        minValue: min,
        maxValue: max,
        unit: check.unit,
        severity: "warning",
        message: check.maxMessage
      });
    }

    return alerts;
  });
};

const evaluateRecipeForUser = async (pool, { recipeId, userId }) => {
  const [recipeRes, unsafeRes, goalsRes, conditionsRes, targetsRes] = await Promise.all([
    pool.query("SELECT * FROM recetas WHERE id = $1", [recipeId]),
    pool.query(
      `SELECT i.id, i.nombre
       FROM receta_ingredientes ri
       JOIN ingredientes i ON ri.ingrediente_id = i.id
       JOIN ingrediente_restricciones ir ON i.id = ir.ingrediente_id
       JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
       WHERE ri.receta_id = $1 AND ur.usuario_id = $2
       ORDER BY i.nombre ASC`,
      [recipeId, userId]
    ),
    pool.query(
      `SELECT og.code
       FROM usuario_objetivos uo
       JOIN objetivos_nutricionales og ON uo.objetivo_id = og.id
       WHERE uo.usuario_id = $1 AND uo.estado = 'active'`,
      [userId]
    ),
    pool.query(
      `SELECT cc.code
       FROM usuario_condiciones uc
       JOIN condiciones_clinicas cc ON uc.condicion_id = cc.id
       WHERE uc.usuario_id = $1`,
      [userId]
    ),
    pool.query("SELECT * FROM usuario_metas_nutricionales WHERE usuario_id = $1", [userId])
  ]);

  const recipe = recipeRes.rows[0];

  if (!recipe) {
    return null;
  }

  const goalCodes = goalsRes.rows.map((goal) => goal.code);
  const conditionCodes = conditionsRes.rows.map((condition) => condition.code);
  const scopeFilters = [
    { scopeType: "global", codes: ["default"] },
    { scopeType: "goal", codes: goalCodes },
    { scopeType: "condition", codes: conditionCodes }
  ].filter((scope) => scope.codes.length > 0);

  const rules = [];

  for (const scope of scopeFilters) {
    const rulesRes = await pool.query(
      `SELECT *
       FROM reglas_nutricionales
       WHERE is_active = TRUE
         AND scope_type = $1
         AND scope_code = ANY($2::text[])`,
      [scope.scopeType, scope.codes]
    );
    rules.push(...rulesRes.rows);
  }

  const ruleAlerts = rules
    .map((rule) => evaluateRule(recipe, rule))
    .filter(Boolean);
  const targetAlerts = buildTargetAlerts(recipe, targetsRes.rows[0]);
  const alerts = [...ruleAlerts, ...targetAlerts];
  const unsafeIngredients = unsafeRes.rows;
  const rawScore =
    100 -
    unsafeIngredients.length * 40 -
    alerts.reduce((total, alert) => total + (severityPenalty[alert.severity] || 0), 0);

  const score = Math.max(0, Math.min(100, rawScore));
  const status = statusFromEvaluation({ unsafeIngredients, alerts });

  return {
    recipe,
    score,
    status,
    unsafeIngredients,
    alerts,
    context: {
      goals: goalCodes,
      conditions: conditionCodes,
      hasTargets: Boolean(targetsRes.rows[0])
    }
  };
};

const evaluateFoodAnalysisForUser = async (pool, { analysis, userId }) => {
  if (!analysis.isFood) {
    return {
      score: null,
      status: "not_food",
      unsafeIngredients: [],
      alerts: [],
      actions: [],
      context: { goals: [], conditions: [], hasTargets: false }
    };
  }

  const [restrictedRes, goalsRes, conditionsRes, targetsRes] = await Promise.all([
    pool.query(
      `SELECT DISTINCT i.id, i.nombre
       FROM ingredientes i
       JOIN ingrediente_restricciones ir ON i.id = ir.ingrediente_id
       JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
       WHERE ur.usuario_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT og.code
       FROM usuario_objetivos uo
       JOIN objetivos_nutricionales og ON uo.objetivo_id = og.id
       WHERE uo.usuario_id = $1 AND uo.estado = 'active'`,
      [userId]
    ),
    pool.query(
      `SELECT cc.code
       FROM usuario_condiciones uc
       JOIN condiciones_clinicas cc ON uc.condicion_id = cc.id
       WHERE uc.usuario_id = $1`,
      [userId]
    ),
    pool.query("SELECT * FROM usuario_metas_nutricionales WHERE usuario_id = $1", [userId])
  ]);

  const goalCodes = goalsRes.rows.map((goal) => goal.code);
  const conditionCodes = conditionsRes.rows.map((condition) => condition.code);
  const scopeFilters = [
    { scopeType: "global", codes: ["default"] },
    { scopeType: "goal", codes: goalCodes },
    { scopeType: "condition", codes: conditionCodes }
  ].filter((scope) => scope.codes.length > 0);
  const rules = [];

  for (const scope of scopeFilters) {
    const rulesRes = await pool.query(
      `SELECT *
       FROM reglas_nutricionales
       WHERE is_active = TRUE
         AND scope_type = $1
         AND scope_code = ANY($2::text[])`,
      [scope.scopeType, scope.codes]
    );
    rules.push(...rulesRes.rows);
  }

  const estimatedFood = {
    calorias: analysis.nutrition.calories,
    protein_g: analysis.nutrition.protein_g,
    carbs_g: analysis.nutrition.carbs_g,
    fat_g: analysis.nutrition.fat_g,
    saturated_fat_g: analysis.nutrition.saturated_fat_g,
    sugar_g: analysis.nutrition.sugar_g,
    fiber_g: analysis.nutrition.fiber_g,
    sodium_mg: analysis.nutrition.sodium_mg
  };
  const unsafeIngredients = analysis.ingredients.flatMap((detected) => {
    const match = restrictedRes.rows.find((restricted) => namesOverlap(detected.name, restricted.nombre));
    return match ? [{
      id: match.id,
      nombre: detected.name,
      matchedIngredient: match.nombre,
      confidence: detected.confidence,
      uncertain: detected.uncertain
    }] : [];
  });
  const alerts = [
    ...rules.map((rule) => evaluateRule(estimatedFood, rule)).filter(Boolean),
    ...buildTargetAlerts(estimatedFood, targetsRes.rows[0])
  ];
  const rawScore =
    100 -
    unsafeIngredients.length * 40 -
    alerts.reduce((total, alert) => total + (severityPenalty[alert.severity] || 0), 0);

  return {
    score: Math.max(0, Math.min(100, rawScore)),
    status: statusFromEvaluation({ unsafeIngredients, alerts }),
    unsafeIngredients,
    alerts,
    actions: unsafeIngredients.map((ingredient) => ({
      type: "remove_or_replace",
      ingredient: ingredient.nombre,
      message: `Revisa o reemplaza ${ingredient.nombre} por tu restricción registrada.`
    })),
    context: {
      goals: goalCodes,
      conditions: conditionCodes,
      hasTargets: Boolean(targetsRes.rows[0])
    }
  };
};

const namesOverlap = (first, second) => {
  const normalizedFirst = ` ${normalizeName(first)} `;
  const normalizedSecond = ` ${normalizeName(second)} `;
  if (normalizedFirst.trim().length < 3 || normalizedSecond.trim().length < 3) return false;
  return normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst);
};

const normalizeName = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

module.exports = {
  evaluateFoodAnalysisForUser,
  evaluateRecipeForUser
};
