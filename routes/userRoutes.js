const express = require("express");
const router = express.Router();

const { registerUser, loginUser, addRestrictions } = require("../controllers/userController");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/restrictions", addRestrictions);

module.exports = router;