const express = require("express");
const router = express.Router();

const {
  getProfile,
  updateProfile,
  getCatalogs,
  updateGoals,
  updateConditions,
  updateTargets
} = require("../controllers/profileController");
const verifyToken = require("../middleware/verifyToken");
const { deleteProgress, listProgress, saveProgress } = require("../controllers/progressController");

router.use(verifyToken);

router.get("/", getProfile);
router.put("/", updateProfile);
router.get("/catalogs", getCatalogs);
router.get("/progress", listProgress);
router.post("/progress", saveProgress);
router.delete("/progress/:id", deleteProgress);
router.put("/goals", updateGoals);
router.put("/conditions", updateConditions);
router.put("/targets", updateTargets);

module.exports = router;
