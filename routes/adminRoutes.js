const express = require("express");
const router = express.Router();
const { listRecipes, listIngredients, createRecipe, updateRecipe, deleteRecipe, createIngredient } = require("../controllers/adminController");
const verifyAdmin = require("../middleware/verifyAdmin");

// Middleware aplicado a todas las rutas de admin
router.get("/recipes", verifyAdmin, listRecipes);
router.get("/ingredients", verifyAdmin, listIngredients);
router.post("/recipes", verifyAdmin, createRecipe);
router.put("/recipes/:id", verifyAdmin, updateRecipe);
router.delete("/recipes/:id", verifyAdmin, deleteRecipe);
router.post("/ingredients", verifyAdmin, createIngredient);


module.exports = router;