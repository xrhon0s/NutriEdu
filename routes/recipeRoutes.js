const express = require("express");
const router = express.Router();

const { getSafeRecipes, getRecommendedRecipes } = require("../controllers/recipeController");


router.get("/safe/:userId", getSafeRecipes);
router.get("/recommended/:userId", getRecommendedRecipes);

module.exports = router;