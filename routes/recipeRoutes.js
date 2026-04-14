const express = require("express");
const router = express.Router();

const { getSafeRecipes, getRecommendedRecipes, getRecipeById, getRecipeIngredients } = require("../controllers/recipeController");


router.get("/safe/:userId", getSafeRecipes);
router.get("/recommended/:userId", getRecommendedRecipes);
router.get("/:id", getRecipeById);
router.get("/:id/ingredients/:userId", getRecipeIngredients);

module.exports = router;