const express = require("express");
const router = express.Router();
const { listRecipes, listIngredients, createRecipe, updateRecipe, deleteRecipe, createIngredient } = require("../controllers/adminController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");

// Middleware aplicado a todas las rutas de admin
router.use(verifyToken, verifyAdmin);

router.get("/recipes", listRecipes);
router.get("/ingredients", listIngredients);
router.post("/recipes", createRecipe);
router.put("/recipes/:id", updateRecipe);
router.delete("/recipes/:id", deleteRecipe);
router.post("/ingredients", createIngredient);


module.exports = router;
