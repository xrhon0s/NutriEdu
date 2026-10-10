const {
  BalancedRecommendationStrategy,
  CardiometabolicRecommendationStrategy,
  FatLossRecommendationStrategy,
  MuscleGainRecommendationStrategy
} = require("./strategies");

class RecommendationStrategyCreator {
  create(context) {
    const primaryGoal = [...(context.goals || [])]
      .sort((first, second) => Number(first.prioridad || 99) - Number(second.prioridad || 99))[0];
    return this.factoryMethod(primaryGoal);
  }

  factoryMethod() {
    throw new Error(`${this.constructor.name} must implement factoryMethod()`);
  }
}

class RecommendationStrategyFactory extends RecommendationStrategyCreator {
  factoryMethod(primaryGoal) {
    if (primaryGoal?.code === "gain_muscle") return new MuscleGainRecommendationStrategy();
    if (primaryGoal?.code === "lose_body_fat") return new FatLossRecommendationStrategy();
    if (["control_glucose", "reduce_cholesterol", "control_blood_pressure"].includes(primaryGoal?.code)) {
      return new CardiometabolicRecommendationStrategy(primaryGoal.code);
    }
    return new BalancedRecommendationStrategy();
  }
}

module.exports = { RecommendationStrategyCreator, RecommendationStrategyFactory };
