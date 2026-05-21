const express = require("express");
const router = express.Router();

const {
  saveWeeklyPlan,
  getWeeklyPlan,
  getShoppingList
} = require("../controllers/plannerController");
const verifyToken = require("../middleware/verifyToken");

router.use(verifyToken);
router.post("/", saveWeeklyPlan);
router.get("/:userId", getWeeklyPlan);
router.get("/:userId/shopping-list", getShoppingList);

module.exports = router;
