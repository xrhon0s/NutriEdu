-- NutriEdu - Longitudinal user progress tracking
-- Version: 014

BEGIN;

CREATE TABLE IF NOT EXISTS usuario_progreso (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(6,2),
  waist_cm NUMERIC(6,2),
  body_fat_pct NUMERIC(5,2),
  adherence_pct NUMERIC(5,2),
  energy_level SMALLINT,
  notes TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT usuario_progreso_user_day_unique UNIQUE (usuario_id, recorded_on),
  CONSTRAINT usuario_progreso_weight_range CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 500),
  CONSTRAINT usuario_progreso_waist_range CHECK (waist_cm IS NULL OR waist_cm BETWEEN 30 AND 300),
  CONSTRAINT usuario_progreso_body_fat_range CHECK (body_fat_pct IS NULL OR body_fat_pct BETWEEN 1 AND 75),
  CONSTRAINT usuario_progreso_adherence_range CHECK (adherence_pct IS NULL OR adherence_pct BETWEEN 0 AND 100),
  CONSTRAINT usuario_progreso_energy_range CHECK (energy_level IS NULL OR energy_level BETWEEN 1 AND 5),
  CONSTRAINT usuario_progreso_measurement_required CHECK (
    weight_kg IS NOT NULL OR waist_cm IS NOT NULL OR body_fat_pct IS NOT NULL
    OR adherence_pct IS NOT NULL OR energy_level IS NOT NULL
  ),
  CONSTRAINT usuario_progreso_source_check CHECK (source IN ('user', 'professional', 'import'))
);

CREATE INDEX IF NOT EXISTS idx_usuario_progreso_user_date
  ON usuario_progreso (usuario_id, recorded_on DESC, id DESC);

COMMIT;
