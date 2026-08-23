const pool = require("../database/db");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const BOOLEAN_FIELDS = ["meal_reminders", "weekly_plan", "shopping", "progress", "security"];

const listNotifications = async (req, res) => {
  try {
    const limit = parseInteger(req.query.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const cursor = req.query.cursor === undefined ? null : parseInteger(req.query.cursor, 1);
    if (!limit || (req.query.cursor !== undefined && !cursor)) {
      return res.status(400).json({ message: "Paginacion de notificaciones invalida" });
    }

    const [itemsResult, unreadResult] = await Promise.all([
      pool.query(
        `SELECT id, category, event_type, title, body, destination, read_at, created_at
         FROM notifications
         WHERE user_id = $1 AND ($2::bigint IS NULL OR id < $2)
         ORDER BY id DESC
         LIMIT $3`,
        [req.user.id, cursor, limit + 1]
      ),
      pool.query(
        "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
        [req.user.id]
      )
    ]);

    const hasMore = itemsResult.rows.length > limit;
    const rows = hasMore ? itemsResult.rows.slice(0, limit) : itemsResult.rows;
    return res.json({
      items: rows.map(toNotificationResponse),
      unreadCount: unreadResult.rows[0].count,
      nextCursor: hasMore ? Number(rows[rows.length - 1].id) : null
    });
  } catch (error) {
    return handleNotificationError(res, error, "Error consultando notificaciones");
  }
};

const getNotificationPreferences = async (req, res) => {
  try {
    await ensurePreferences(req.user.id);
    const result = await pool.query(
      `SELECT timezone, quiet_start, quiet_end, meal_reminders, weekly_plan,
        shopping, progress, security, updated_at
       FROM notification_preferences WHERE user_id = $1`,
      [req.user.id]
    );
    return res.json(toPreferenceResponse(result.rows[0]));
  } catch (error) {
    return handleNotificationError(res, error, "Error consultando preferencias de notificacion");
  }
};

const updateNotificationPreferences = async (req, res) => {
  try {
    await ensurePreferences(req.user.id);
    const currentResult = await pool.query(
      "SELECT * FROM notification_preferences WHERE user_id = $1",
      [req.user.id]
    );
    const current = currentResult.rows[0];
    const next = {
      timezone: req.body.timezone ?? current.timezone,
      quiet_start: req.body.quietStart !== undefined ? normalizeTime(req.body.quietStart) : current.quiet_start,
      quiet_end: req.body.quietEnd !== undefined ? normalizeTime(req.body.quietEnd) : current.quiet_end
    };

    if (!isValidTimeZone(next.timezone) || next.quiet_start === undefined || next.quiet_end === undefined) {
      return res.status(400).json({ message: "Zona horaria u horas silenciosas invalidas" });
    }

    for (const field of BOOLEAN_FIELDS) {
      const camelField = toCamel(field);
      const value = req.body[camelField];
      if (value !== undefined && typeof value !== "boolean") {
        return res.status(400).json({ message: `La preferencia ${camelField} debe ser booleana` });
      }
      next[field] = value ?? current[field];
    }

    const result = await pool.query(
      `UPDATE notification_preferences SET
        timezone = $2, quiet_start = $3, quiet_end = $4,
        meal_reminders = $5, weekly_plan = $6, shopping = $7,
        progress = $8, security = $9, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING timezone, quiet_start, quiet_end, meal_reminders, weekly_plan,
        shopping, progress, security, updated_at`,
      [
        req.user.id, next.timezone, next.quiet_start, next.quiet_end,
        next.meal_reminders, next.weekly_plan, next.shopping, next.progress, next.security
      ]
    );
    return res.json(toPreferenceResponse(result.rows[0]));
  } catch (error) {
    return handleNotificationError(res, error, "Error actualizando preferencias de notificacion");
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const notificationId = parseInteger(req.params.notificationId, 1);
    if (!notificationId) return res.status(400).json({ message: "Notificacion invalida" });

    const result = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE id = $1 AND user_id = $2
       RETURNING id, read_at`,
      [notificationId, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Notificacion no encontrada" });
    return res.json({ id: Number(result.rows[0].id), readAt: result.rows[0].read_at });
  } catch (error) {
    return handleNotificationError(res, error, "Error actualizando notificacion");
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]
    );
    return res.json({ updatedCount: result.rowCount });
  } catch (error) {
    return handleNotificationError(res, error, "Error actualizando notificaciones");
  }
};

const ensurePreferences = (userId) => pool.query(
  "INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
  [userId]
);

const parseInteger = (value, minimum, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

const normalizeTime = (value) => {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  return value;
};

const isValidTimeZone = (value) => {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const toCamel = (value) => value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

const toNotificationResponse = (row) => ({
  id: Number(row.id),
  category: row.category,
  eventType: row.event_type,
  title: row.title,
  body: row.body,
  destination: row.destination,
  readAt: row.read_at,
  createdAt: row.created_at
});

const toPreferenceResponse = (row) => ({
  timezone: row.timezone,
  quietStart: row.quiet_start ? String(row.quiet_start).slice(0, 5) : null,
  quietEnd: row.quiet_end ? String(row.quiet_end).slice(0, 5) : null,
  mealReminders: row.meal_reminders,
  weeklyPlan: row.weekly_plan,
  shopping: row.shopping,
  progress: row.progress,
  security: row.security,
  updatedAt: row.updated_at
});

const handleNotificationError = (res, error, message) => {
  if (error.code === "42P01") {
    return res.status(503).json({ message: "Ejecuta la migracion 006 de notificaciones" });
  }
  console.error(error);
  return res.status(500).json({ error: message });
};

module.exports = {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences
};
