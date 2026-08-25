const express = require("express");
const router = express.Router();
const {
  createIngredient,
  createRecipe,
  deleteIngredient,
  deleteRecipe,
  getOperationsOverview,
  listUsers,
  updateUserRole,
  listClinicalCatalogs,
  createClinicalCatalogItem,
  updateClinicalCatalogItem,
  listIngredients,
  listRecipes,
  updateIngredient,
  updateRecipe
} = require("../controllers/adminController");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");

// Middleware aplicado a todas las rutas de admin
router.use(verifyToken, verifyAdmin);

router.get("/overview", getOperationsOverview);
router.get("/users", listUsers);
router.patch("/users/:id/role", updateUserRole);
router.get("/clinical-catalogs", listClinicalCatalogs);
router.post("/clinical-catalogs/:catalog", createClinicalCatalogItem);
router.patch("/clinical-catalogs/:catalog/:id", updateClinicalCatalogItem);
router.get("/recipes", listRecipes);
router.get("/ingredients", listIngredients);
router.post("/recipes", createRecipe);
router.put("/recipes/:id", updateRecipe);
router.delete("/recipes/:id", deleteRecipe);
router.post("/ingredients", createIngredient);
router.put("/ingredients/:id", updateIngredient);
router.delete("/ingredients/:id", deleteIngredient);


module.exports = router;
