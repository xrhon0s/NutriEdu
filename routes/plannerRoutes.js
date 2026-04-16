const express = require("express");
const router = express.Router();

const {
  saveWeeklyPlan,
  getWeeklyPlan,
  getShoppingList
} = require("../controllers/plannerController");

router.post("/", saveWeeklyPlan);
router.get("/:userId", getWeeklyPlan);
router.get("/:userId/shopping-list", getShoppingList);

module.exports = router;