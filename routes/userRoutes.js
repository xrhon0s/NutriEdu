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
const {
  loginRateLimit,
  registerRateLimit,
  forgotPasswordRateLimit,
  resetPasswordRateLimit
} = require("../middleware/authRateLimits");

router.post("/register", registerRateLimit, registerUser);
router.post("/login", loginRateLimit, loginUser);
router.post("/forgot-password", forgotPasswordRateLimit, forgotPassword);
router.post("/reset-password", resetPasswordRateLimit, resetPassword);
router.post("/restrictions", verifyToken, addRestrictions);
router.get("/restrictions/:userId", verifyToken, getUserRestrictions);
router.get("/restrictions", verifyToken, getAllRestrictions);
router.delete("/account", verifyToken, deleteAccount);

module.exports = router;
