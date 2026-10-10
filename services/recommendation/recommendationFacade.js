const { RecommendationStrategyFactory } = require("./strategyFactory");

class RecommendationFacade {
  constructor({
    loadContext,
    loadRecipes,
    evaluateRecipe,
    buildContextSummary,
    strategyFactory = new RecommendationStrategyFactory()
  }) {
    this.loadContext = loadContext;
    this.loadRecipes = loadRecipes;
    this.evaluateRecipe = evaluateRecipe;
    this.buildContextSummary = buildContextSummary;
    this.strategyFactory = strategyFactory;
  }

  async getRecommendations(pool, { userId, limit = 6, offset = 0, now = new Date() }) {
    const context = await this.loadContext(pool, userId, now);
    const recipes = await this.loadRecipes(pool, userId, context.effectiveRestrictions);
    const strategy = this.strategyFactory.create(context);
    const ranked = recipes
      .map((recipe) => ({
        ...recipe,
        recommendation: this.evaluateRecipe(recipe, context, strategy)
      }))
      .sort((first, second) =>
        second.recommendation.score - first.recommendation.score
        || second.recommendation.confidence - first.recommendation.confidence
        || Number(second.nivel_salud || 0) - Number(first.nivel_salud || 0)
        || Number(first.calorias || Number.MAX_SAFE_INTEGER) - Number(second.calorias || Number.MAX_SAFE_INTEGER)
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
      profileContext: {
        ...this.buildContextSummary(context),
        recommendationStrategy: {
          code: strategy.code,
          label: strategy.label
        }
      }
    };
  }
}

module.exports = { RecommendationFacade };
