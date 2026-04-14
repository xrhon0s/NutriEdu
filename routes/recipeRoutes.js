const express = require("express");
const router = express.Router();

const { getSafeRecipes, getRecommendedRecipes, getRecipeById } = require("../controllers/recipeController");


router.get("/safe/:userId", getSafeRecipes);
router.get("/recommended/:userId", getRecommendedRecipes);
router.get("/:id", getRecipeById);

module.exports = router;