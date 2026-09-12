-- NutriEdu - Synced user recipe favorites
-- Version: 013

BEGIN;

CREATE TABLE IF NOT EXISTS usuario_recetas_favoritas (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  receta_id INTEGER NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, receta_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_recetas_favoritas_created
  ON usuario_recetas_favoritas (usuario_id, created_at DESC, receta_id DESC);

COMMIT;
