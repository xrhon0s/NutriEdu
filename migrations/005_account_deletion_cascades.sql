-- ============================================================
-- NutriEdu - Account deletion cascades
-- Version: 005
-- Purpose:
--   Ensure all user-owned data is deleted with the user account.
-- ============================================================

BEGIN;

ALTER TABLE plan_semanal
  DROP CONSTRAINT IF EXISTS plan_semanal_usuario_id_fkey,
  ADD CONSTRAINT plan_semanal_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

ALTER TABLE usuario_restricciones
  DROP CONSTRAINT IF EXISTS usuario_restricciones_usuario_id_fkey,
  ADD CONSTRAINT usuario_restricciones_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

COMMIT;
