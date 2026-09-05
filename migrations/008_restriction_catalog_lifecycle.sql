-- NutriEdu - Restriction catalog lifecycle
-- Version: 008

BEGIN;

ALTER TABLE restricciones
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_restricciones_active_name
  ON restricciones (is_active, nombre);

COMMIT;
