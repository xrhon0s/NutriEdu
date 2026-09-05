const preferenceColumns = {
  meals: "meal_reminders",
  weekly_plan: "weekly_plan",
  shopping: "shopping",
  progress: "progress",
  security: "security"
};

const createInAppNotification = async (database, notification) => {
  try {
    const preferenceColumn = preferenceColumns[notification.category];
    if (!preferenceColumn) throw new Error("Invalid notification category");

    const preference = await database.query(
      `SELECT ${preferenceColumn} AS enabled
       FROM notification_preferences
       WHERE user_id = $1`,
      [notification.userId]
    );
    if (preference.rows[0]?.enabled === false) return null;

    const result = await database.query(
      `INSERT INTO notifications (
        user_id, category, event_type, title, body, destination, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING id`,
      [
        notification.userId,
        notification.category,
        notification.eventType,
        notification.title,
        notification.body,
        notification.destination || null,
        JSON.stringify(notification.metadata || {})
      ]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
};

module.exports = { createInAppNotification };
