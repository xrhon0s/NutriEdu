const express = require("express");
const router = express.Router();
const {
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe
} = require("../controllers/adminController");

// Middleware opcional: validar rol de administrador
const verifyAdmin = (req, res, next) => {
  if (req.user?.rol !== "administrador") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  next();
};

router.get("/recipes", verifyAdmin, listRecipes);
router.post("/recipes", verifyAdmin, createRecipe);
router.put("/recipes/:id", verifyAdmin, updateRecipe);
router.delete("/recipes/:id", verifyAdmin, deleteRecipe);

module.exports = router;