-- ============================================================
-- NutriEdu - Medical document retention lifecycle
-- Version: 004
-- Purpose:
--   Expire unapplied structured reviews after 30 days while retaining
--   applied audit records until account deletion.
-- ============================================================

BEGIN;

ALTER TABLE revisiones_documentos_medicos
  ADD COLUMN IF NOT EXISTS retention_policy_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE revisiones_documentos_medicos
SET expires_at = reviewed_at + INTERVAL '30 days'
WHERE status = 'reviewed' AND expires_at IS NULL;

UPDATE revisiones_documentos_medicos
SET expires_at = NULL
WHERE status = 'applied';

CREATE INDEX IF NOT EXISTS idx_revisiones_documentos_expiration
  ON revisiones_documentos_medicos (expires_at)
  WHERE status = 'reviewed' AND expires_at IS NOT NULL;

COMMIT;
