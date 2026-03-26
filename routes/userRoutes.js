const express = require("express");
const router = express.Router();

const { registerUser, loginUser, addRestrictions, getUserRestrictions } = require("../controllers/userController");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/restrictions", addRestrictions);
router.get("/restrictions/:userId", getUserRestrictions);

module.exports = router;