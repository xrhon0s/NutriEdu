-- ============================================================
-- NutriEdu - Configurable local reminder schedules
-- Version: 007
-- Purpose:
--   Persist user-selected schedules before device registration.
-- ============================================================

BEGIN;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS meal_reminder_times JSONB NOT NULL DEFAULT '{"breakfast":"08:00","lunch":"13:00","dinner":"19:00"}'::jsonb,
  ADD COLUMN IF NOT EXISTS weekly_plan_reminder_day SMALLINT NOT NULL DEFAULT 0 CHECK (weekly_plan_reminder_day BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS weekly_plan_reminder_time TIME NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS shopping_reminder_day SMALLINT NOT NULL DEFAULT 6 CHECK (shopping_reminder_day BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS shopping_reminder_time TIME NOT NULL DEFAULT '09:00';

COMMIT;
