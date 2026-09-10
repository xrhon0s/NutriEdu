-- ============================================================
-- NutriEdu - In-app notifications and user preferences
-- Version: 006
-- Purpose:
--   Add a durable inbox before local reminders or remote push.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Bogota',
  quiet_start TIME,
  quiet_end TIME,
  meal_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_plan BOOLEAN NOT NULL DEFAULT TRUE,
  shopping BOOLEAN NOT NULL DEFAULT TRUE,
  progress BOOLEAN NOT NULL DEFAULT TRUE,
  security BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL CHECK (category IN ('meals', 'weekly_plan', 'shopping', 'progress', 'security')),
  event_type VARCHAR(80) NOT NULL,
  title VARCHAR(140) NOT NULL,
  body VARCHAR(320) NOT NULL,
  destination VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, id DESC)
  WHERE read_at IS NULL;

INSERT INTO notification_preferences (user_id)
SELECT id FROM usuarios
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO notifications (user_id, category, event_type, title, body, destination)
SELECT
  u.id,
  'security',
  'inbox_ready',
  'Tu bandeja esta lista',
  'Aqui recibiras avisos de NutriEdu sin incluir informacion clinica sensible.',
  '/profile'
FROM usuarios u
WHERE NOT EXISTS (
  SELECT 1 FROM notifications n
  WHERE n.user_id = u.id AND n.event_type = 'inbox_ready'
);

COMMIT;
