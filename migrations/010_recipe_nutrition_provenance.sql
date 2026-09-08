-- NutriEdu - Recipe nutrition provenance and quantity foundation
-- Version: 010

BEGIN;

ALTER TABLE recetas
  ADD COLUMN IF NOT EXISTS serving_size_g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS servings NUMERIC(8,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nutrition_source VARCHAR(30) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS nutrition_reviewed_at TIMESTAMPTZ;

ALTER TABLE recetas
  DROP CONSTRAINT IF EXISTS recetas_serving_size_positive,
  DROP CONSTRAINT IF EXISTS recetas_servings_positive,
  DROP CONSTRAINT IF EXISTS recetas_nutrition_source_check;

ALTER TABLE recetas
  ADD CONSTRAINT recetas_serving_size_positive CHECK (serving_size_g IS NULL OR serving_size_g > 0),
  ADD CONSTRAINT recetas_servings_positive CHECK (servings > 0),
  ADD CONSTRAINT recetas_nutrition_source_check CHECK (nutrition_source IN ('unknown', 'manual', 'usda_fdc', 'calculated', 'ai_estimate', 'professional'));

ALTER TABLE receta_ingredientes
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(30),
  ADD COLUMN IF NOT EXISTS amount_g NUMERIC(10,2);

ALTER TABLE receta_ingredientes
  DROP CONSTRAINT IF EXISTS receta_ingredientes_amount_positive,
  DROP CONSTRAINT IF EXISTS receta_ingredientes_amount_g_positive;

ALTER TABLE receta_ingredientes
  ADD CONSTRAINT receta_ingredientes_amount_positive CHECK (amount IS NULL OR amount > 0),
  ADD CONSTRAINT receta_ingredientes_amount_g_positive CHECK (amount_g IS NULL OR amount_g > 0);

ALTER TABLE ingredientes
  ADD COLUMN IF NOT EXISTS fdc_id BIGINT,
  ADD COLUMN IF NOT EXISTS calories_per_100g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS protein_per_100g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS carbs_per_100g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fat_per_100g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS saturated_fat_per_100g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sugar_per_100g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fiber_per_100g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sodium_mg_per_100g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS nutrition_source VARCHAR(30) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS nutrition_reviewed_at TIMESTAMPTZ;

ALTER TABLE ingredientes
  DROP CONSTRAINT IF EXISTS ingredientes_nutrition_source_check;

ALTER TABLE ingredientes
  ADD CONSTRAINT ingredientes_nutrition_source_check CHECK (nutrition_source IN ('unknown', 'manual', 'usda_fdc', 'ai_estimate', 'professional'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredientes_fdc_id
  ON ingredientes (fdc_id)
  WHERE fdc_id IS NOT NULL;

COMMIT;
