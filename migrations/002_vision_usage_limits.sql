-- ============================================================
-- NutriEdu - Vision usage and cost controls
-- Version: 002
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS vision_analysis_usage (
  request_id UUID PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  model VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  reserved_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CONSTRAINT vision_analysis_usage_status_check
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  CONSTRAINT vision_analysis_usage_tokens_check
    CHECK (
      (input_tokens IS NULL OR input_tokens >= 0)
      AND (output_tokens IS NULL OR output_tokens >= 0)
      AND (total_tokens IS NULL OR total_tokens >= 0)
    ),
  CONSTRAINT vision_analysis_usage_cost_check
    CHECK (reserved_cost_usd >= 0 AND estimated_cost_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vision_analysis_usage_user_created
  ON vision_analysis_usage (usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vision_analysis_usage_created_status
  ON vision_analysis_usage (created_at DESC, status);

COMMIT;
