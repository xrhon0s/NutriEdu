const express = require("express");
const router = express.Router();

const {
  saveWeeklyPlan,
  getWeeklyPlan
} = require("../controllers/plannerController");

router.post("/", saveWeeklyPlan);
router.get("/:userId", getWeeklyPlan);

module.exports = router;