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

router.use(verifyToken);

router.get("/", getProfile);
router.put("/", updateProfile);
router.get("/catalogs", getCatalogs);
router.put("/goals", updateGoals);
router.put("/conditions", updateConditions);
router.put("/targets", updateTargets);

module.exports = router;
