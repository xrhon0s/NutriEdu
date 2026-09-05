const express = require("express");
const {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences
} = require("../controllers/notificationController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

router.use(verifyToken);
router.get("/", listNotifications);
router.post("/read-all", markAllNotificationsRead);
router.get("/preferences", getNotificationPreferences);
router.put("/preferences", updateNotificationPreferences);
router.patch("/:notificationId/read", markNotificationRead);

module.exports = router;
