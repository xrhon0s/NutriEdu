-- ============================================================
-- NutriEdu - Medical document review and application audit
-- Version: 003
-- Purpose:
--   Persist reviewed structured findings and explicit profile changes.
--   The original medical document is never stored in these tables.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS revisiones_documentos_medicos (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  request_id VARCHAR(100) NOT NULL,
  schema_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  document_type VARCHAR(40) NOT NULL,
  extraction JSONB NOT NULL,
  accepted_finding_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  accepted_findings JSONB NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'reviewed',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT revisiones_documentos_status_check
    CHECK (status IN ('reviewed', 'applied')),
  CONSTRAINT revisiones_documentos_accepted_ids_array_check
    CHECK (jsonb_typeof(accepted_finding_ids) = 'array'),
  CONSTRAINT revisiones_documentos_unique_request
    UNIQUE (usuario_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_revisiones_documentos_usuario_fecha
  ON revisiones_documentos_medicos (usuario_id, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS aplicaciones_documentos_medicos (
  id BIGSERIAL PRIMARY KEY,
  revision_id BIGINT NOT NULL UNIQUE
    REFERENCES revisiones_documentos_medicos(id) ON DELETE RESTRICT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  confirmation_version VARCHAR(20) NOT NULL,
  preview_hash VARCHAR(64) NOT NULL,
  applied_changes JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_aplicaciones_documentos_usuario_fecha
  ON aplicaciones_documentos_medicos (usuario_id, applied_at DESC);

COMMIT;
