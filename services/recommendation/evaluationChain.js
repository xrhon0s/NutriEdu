class EvaluationHandler {
  constructor(name) {
    this.name = name;
    this.next = null;
  }

  setNext(handler) {
    this.next = handler;
    return handler;
  }

  handle(recipe, context, evaluation, dependencies) {
    this.process(recipe, context, evaluation, dependencies);
    if (this.next) {
      return this.next.handle(recipe, context, evaluation, dependencies);
    }
    return evaluation;
  }

  process() {
    throw new Error(`${this.constructor.name} must implement process()`);
  }
}

class NutritionRuleHandler extends EvaluationHandler {
  constructor() {
    super("nutrition_rules");
  }

  process(recipe, context, evaluation, dependencies) {
    const {
      nutrientFields,
      severityPenalty,
      toNumber,
      breaksRule,
      sourceMultiplier
    } = dependencies;

    context.rules.forEach((rule) => {
      const field = nutrientFields[rule.nutrient];
      if (!field) return;
      const value = toNumber(recipe[field]);
      if (value === null) {
        evaluation.missingNutrients.add(rule.nutrient);
        return;
      }
      if (breaksRule(value, rule)) {
        const penalty = severityPenalty[rule.severity] || severityPenalty.warning;
        evaluation.score -= penalty * sourceMultiplier(rule, context.goals, context.conditions);
        evaluation.warnings.push({
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
      } else if (rule.scope_type !== "global" && evaluation.reasons.length < 4) {
        evaluation.reasons.push(`Cumple la regla de ${rule.nutrient} para ${rule.scope_code}.`);
      }
    });
  }
}

class NutritionTargetHandler extends EvaluationHandler {
  constructor() {
    super("nutrition_targets");
  }

  process(recipe, context, evaluation, dependencies) {
    const { nutrientFields, toNumber } = dependencies;

    Object.entries(context.targetProfile.perMeal).forEach(([nutrient, target]) => {
      const value = toNumber(recipe[nutrientFields[nutrient]]);
      if (value === null) {
        evaluation.missingNutrients.add(nutrient);
        return;
      }
      const below = target.min !== null && value < target.min;
      const above = target.max !== null && value > target.max;
      if (below || above) {
        const boundary = below ? target.min : target.max;
        const deviation = boundary > 0 ? Math.abs(value - boundary) / boundary : 1;
        evaluation.score -= Math.min(18, 6 + (deviation * 12));
        evaluation.warnings.push({
          source: "target",
          sourceCode: "effective_per_meal_target",
          nutrient,
          severity: "warning",
          message: below
            ? `Aporte inferior a la referencia por comida de ${nutrient}.`
            : `Aporte superior a la referencia por comida de ${nutrient}.`,
          value,
          minValue: target.min,
          maxValue: target.max,
          unit: target.unit
        });
      } else if (evaluation.reasons.length < 4) {
        evaluation.reasons.push(`Dentro de tu referencia por comida para ${nutrient}.`);
      }
    });
  }
}

class RecipeQualityHandler extends EvaluationHandler {
  constructor() {
    super("recipe_quality");
  }

  process(recipe, _context, evaluation, dependencies) {
    const { toNumber } = dependencies;
    const healthLevel = Math.min(5, Math.max(1, toNumber(recipe.nivel_salud) || 1));
    evaluation.score -= (5 - healthLevel) * 2;
  }
}

class CookingTimeHandler extends EvaluationHandler {
  constructor() {
    super("cooking_time");
  }

  process(recipe, context, evaluation, dependencies) {
    const { cookingLimit, toNumber } = dependencies;
    const maxCookingMinutes = cookingLimit(context.profile);
    const preparationMinutes = toNumber(recipe.tiempo_preparacion);
    if (maxCookingMinutes === null || preparationMinutes === null) return;

    if (preparationMinutes > maxCookingMinutes) {
      evaluation.score -= Math.min(12, 4 + ((preparationMinutes - maxCookingMinutes) / maxCookingMinutes) * 8);
      evaluation.warnings.push({
        source: "preference",
        sourceCode: "cooking_time",
        severity: "info",
        message: `Requiere más tiempo que los ${maxCookingMinutes} minutos indicados en tu perfil.`,
        value: preparationMinutes,
        maxValue: maxCookingMinutes,
        unit: "minutes"
      });
      return;
    }

    evaluation.reasons.push("Se ajusta al tiempo que tienes disponible para cocinar.");
  }
}

class ConfidenceHandler extends EvaluationHandler {
  constructor() {
    super("confidence");
  }

  process(recipe, context, evaluation, dependencies) {
    const { nutrientFields, toNumber, round } = dependencies;
    const knownNutrients = Object.values(nutrientFields)
      .filter((field) => toNumber(recipe[field]) !== null).length;
    evaluation.confidence = round(knownNutrients / Object.keys(nutrientFields).length, 2);
    if (context.effectiveRestrictions.length) {
      evaluation.reasons.unshift("Compatible con tus restricciones alimentarias efectivas.");
    }
  }
}

class RecipeEvaluationChain {
  constructor(firstHandler, dependencies) {
    this.firstHandler = firstHandler;
    this.dependencies = dependencies;
  }

  evaluate(recipe, context) {
    const evaluation = {
      score: 100,
      reasons: [],
      warnings: [],
      missingNutrients: new Set(),
      confidence: 0
    };
    return this.firstHandler.handle(recipe, context, evaluation, this.dependencies);
  }

  getHandlerNames() {
    const names = [];
    let handler = this.firstHandler;
    while (handler) {
      names.push(handler.name);
      handler = handler.next;
    }
    return names;
  }
}

const createRecipeEvaluationChain = (dependencies) => {
  const rules = new NutritionRuleHandler();
  const targets = rules.setNext(new NutritionTargetHandler());
  const quality = targets.setNext(new RecipeQualityHandler());
  const cooking = quality.setNext(new CookingTimeHandler());
  cooking.setNext(new ConfidenceHandler());
  return new RecipeEvaluationChain(rules, dependencies);
};

module.exports = {
  ConfidenceHandler,
  CookingTimeHandler,
  EvaluationHandler,
  NutritionRuleHandler,
  NutritionTargetHandler,
  RecipeEvaluationChain,
  RecipeQualityHandler,
  createRecipeEvaluationChain
};
