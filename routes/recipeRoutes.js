const express = require("express");
const router = express.Router();
const {
  getSafeRecipes,
  getRecommendedRecipes,
  getRecipeById,
  getRecipeIngredients,
  checkRecipeSafety,
  searchRecipes,
  evaluateRecipe
} = require("../controllers/recipeController");
const verifyToken = require("../middleware/verifyToken");

router.use(verifyToken);
router.get("/safe/:userId", getSafeRecipes);
router.get("/recommended/:userId", getRecommendedRecipes);
router.get("/search/:userId", searchRecipes);
router.get("/evaluate/:recipeId", evaluateRecipe);
router.get("/:id", getRecipeById);
router.get("/:id/ingredients", getRecipeIngredients);


// Nuevo endpoint para alertas de seguridad
router.get("/check/:recipeId/:userId", checkRecipeSafety);

module.exports = router;
