const numericValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const addReason = (evaluation, reason) => {
  if (reason && !evaluation.reasons.includes(reason)) evaluation.reasons.push(reason);
};

class RecommendationStrategy {
  constructor(code, label) {
    this.code = code;
    this.label = label;
  }

  apply(_recipe, _context, evaluation) {
    return evaluation;
  }
}

class BalancedRecommendationStrategy extends RecommendationStrategy {
  constructor() {
    super("balanced", "Equilibrio general");
  }

  apply(recipe, _context, evaluation) {
    if (numericValue(recipe.nivel_salud) >= 4) {
      evaluation.score += 2;
      addReason(evaluation, "Buena calidad general dentro del catálogo de recetas.");
    }
    return evaluation;
  }
}

class MuscleGainRecommendationStrategy extends RecommendationStrategy {
  constructor() {
    super("gain_muscle", "Ganancia de masa muscular");
  }

  apply(recipe, context, evaluation) {
    const protein = numericValue(recipe.protein_g);
    const target = context.targetProfile.perMeal.protein_g?.min ?? 25;
    if (protein !== null && protein >= target) {
      evaluation.score += 6;
      addReason(evaluation, "Aporte proteico alineado con el objetivo de ganar masa muscular.");
    }
    return evaluation;
  }
}

class FatLossRecommendationStrategy extends RecommendationStrategy {
  constructor() {
    super("lose_body_fat", "Pérdida de grasa corporal");
  }

  apply(recipe, context, evaluation) {
    const calories = numericValue(recipe.calorias);
    const fiber = numericValue(recipe.fiber_g);
    const calorieLimit = context.targetProfile.perMeal.calories?.max ?? 650;
    if (calories !== null && calories <= calorieLimit) {
      evaluation.score += 3;
      addReason(evaluation, "Aporte energético compatible con el objetivo de pérdida de grasa.");
    }
    if (fiber !== null && fiber >= 4) {
      evaluation.score += 3;
      addReason(evaluation, "Su aporte de fibra puede favorecer la saciedad.");
    }
    return evaluation;
  }
}

class CardiometabolicRecommendationStrategy extends RecommendationStrategy {
  constructor(goalCode) {
    super(goalCode, "Control cardiometabólico");
  }

  apply(recipe, _context, evaluation) {
    const fiber = numericValue(recipe.fiber_g);
    const sugar = numericValue(recipe.sugar_g);
    const saturatedFat = numericValue(recipe.saturated_fat_g);
    const sodium = numericValue(recipe.sodium_mg);
    const favorable = [
      fiber !== null && fiber >= 4,
      sugar !== null && sugar <= 12,
      saturatedFat !== null && saturatedFat <= 7,
      sodium !== null && sodium <= 600
    ].filter(Boolean).length;
    evaluation.score += Math.min(6, favorable * 2);
    if (favorable >= 2) {
      addReason(evaluation, "Presenta indicadores favorables para el objetivo cardiometabólico seleccionado.");
    }
    return evaluation;
  }
}

module.exports = {
  BalancedRecommendationStrategy,
  CardiometabolicRecommendationStrategy,
  FatLossRecommendationStrategy,
  MuscleGainRecommendationStrategy,
  RecommendationStrategy
};
