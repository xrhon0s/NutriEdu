-- NutriEdu - Idempotent recipe catalog imports and provenance
-- Version: 011

BEGIN;

ALTER TABLE recetas
  ADD COLUMN IF NOT EXISTS external_key VARCHAR(80),
  ADD COLUMN IF NOT EXISTS nutrition_source_reference TEXT,
  ADD COLUMN IF NOT EXISTS nutrition_reviewed_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE ingredientes
  ADD COLUMN IF NOT EXISTS external_key VARCHAR(80),
  ADD COLUMN IF NOT EXISTS nutrition_source_reference TEXT,
  ADD COLUMN IF NOT EXISTS nutrition_reviewed_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE recetas
  DROP CONSTRAINT IF EXISTS recetas_external_key_format;

ALTER TABLE recetas
  ADD CONSTRAINT recetas_external_key_format
  CHECK (external_key IS NULL OR external_key ~ '^[a-z][a-z0-9_]{2,79}$');

ALTER TABLE ingredientes
  DROP CONSTRAINT IF EXISTS ingredientes_external_key_format;

ALTER TABLE ingredientes
  ADD CONSTRAINT ingredientes_external_key_format
  CHECK (external_key IS NULL OR external_key ~ '^[a-z][a-z0-9_]{2,79}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_recetas_external_key
  ON recetas (external_key)
  WHERE external_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredientes_external_key
  ON ingredientes (external_key)
  WHERE external_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS recipe_catalog_imports (
  id BIGSERIAL PRIMARY KEY,
  imported_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  schema_version VARCHAR(20) NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  recipes_created INTEGER NOT NULL DEFAULT 0 CHECK (recipes_created >= 0),
  recipes_updated INTEGER NOT NULL DEFAULT 0 CHECK (recipes_updated >= 0),
  ingredients_created INTEGER NOT NULL DEFAULT 0 CHECK (ingredients_created >= 0),
  ingredients_updated INTEGER NOT NULL DEFAULT 0 CHECK (ingredients_updated >= 0),
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recipe_catalog_imports_created
  ON recipe_catalog_imports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipe_catalog_imports_actor_created
  ON recipe_catalog_imports (imported_by, created_at DESC);

COMMIT;
