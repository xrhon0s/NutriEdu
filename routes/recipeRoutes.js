const express = require("express");
const router = express.Router();
const {
  getSafeRecipes,
  getRecommendedRecipes,
  getRankedRecommendations,
  getRecipeById,
  getRecipeIngredients,
  checkRecipeSafety,
  searchRecipes,
  evaluateRecipe
} = require("../controllers/recipeController");
const verifyToken = require("../middleware/verifyToken");
const {
  listFavoriteRecipes,
  saveFavoriteRecipe,
  removeFavoriteRecipe
} = require("../controllers/recipeFavoriteController");

router.use(verifyToken);
router.get("/safe/:userId", getSafeRecipes);
router.get("/recommended/:userId", getRecommendedRecipes);
router.get("/recommendations", getRankedRecommendations);
router.get("/favorites", listFavoriteRecipes);
router.put("/favorites/:recipeId", saveFavoriteRecipe);
router.delete("/favorites/:recipeId", removeFavoriteRecipe);
router.get("/search/:userId", searchRecipes);
router.get("/evaluate/:recipeId", evaluateRecipe);
router.get("/:id", getRecipeById);
router.get("/:id/ingredients", getRecipeIngredients);


// Nuevo endpoint para alertas de seguridad
router.get("/check/:recipeId/:userId", checkRecipeSafety);

module.exports = router;
