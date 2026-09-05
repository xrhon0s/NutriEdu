const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  addRestrictions,
  getUserRestrictions,
  getAllRestrictions,
  deleteAccount
} = require("../controllers/userController");
const verifyToken = require("../middleware/verifyToken");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/restrictions", verifyToken, addRestrictions);
router.get("/restrictions/:userId", verifyToken, getUserRestrictions);
router.get("/restrictions", verifyToken, getAllRestrictions);
router.delete("/account", verifyToken, deleteAccount);

module.exports = router;
