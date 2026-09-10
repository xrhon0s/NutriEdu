-- ============================================================
-- NutriEdu - Clinical profile foundation
-- Version: 001
-- Purpose:
--   Add advanced user profile, nutrition goals, clinical conditions,
--   nutrition rules and user nutrition targets without breaking the
--   current restrictions/recipes/planner model.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Recipe nutrient columns
-- ------------------------------------------------------------
-- These columns are nullable so existing recipes keep working.
-- They allow the future rules engine to evaluate more than calories.

ALTER TABLE recetas
  ADD COLUMN IF NOT EXISTS protein_g NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS carbs_g NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS fat_g NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS saturated_fat_g NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS sugar_g NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS fiber_g NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS sodium_mg NUMERIC(8,2);

-- ------------------------------------------------------------
-- 2. Advanced user profile
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS perfiles_usuario (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha_nacimiento DATE,
  sexo VARCHAR(30),
  estatura_cm NUMERIC(5,2),
  peso_kg NUMERIC(6,2),
  nivel_actividad VARCHAR(40),
  condicion_fisica VARCHAR(80),
  habitos_alimentarios JSONB DEFAULT '{}'::jsonb,
  preferencias_alimentarias JSONB DEFAULT '{}'::jsonb,
  notas TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 3. Nutrition goals catalog and user goals
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS objetivos_nutricionales (
  id SERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuario_objetivos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  objetivo_id INTEGER NOT NULL REFERENCES objetivos_nutricionales(id) ON DELETE RESTRICT,
  prioridad INTEGER NOT NULL DEFAULT 1,
  estado VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, objetivo_id),
  CONSTRAINT usuario_objetivos_estado_check
    CHECK (estado IN ('active', 'paused', 'completed')),
  CONSTRAINT usuario_objetivos_prioridad_check
    CHECK (prioridad >= 1)
);

-- ------------------------------------------------------------
-- 4. Clinical conditions catalog and user conditions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS condiciones_clinicas (
  id SERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  risk_level VARCHAR(30) NOT NULL DEFAULT 'medium',
  requires_professional_guidance BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT condiciones_clinicas_risk_level_check
    CHECK (risk_level IN ('low', 'medium', 'high'))
);

CREATE TABLE IF NOT EXISTS usuario_condiciones (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  condicion_id INTEGER NOT NULL REFERENCES condiciones_clinicas(id) ON DELETE RESTRICT,
  source VARCHAR(40) NOT NULL DEFAULT 'user',
  confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, condicion_id),
  CONSTRAINT usuario_condiciones_source_check
    CHECK (source IN ('user', 'ai_document', 'professional', 'admin'))
);

-- ------------------------------------------------------------
-- 5. Nutrition rules
-- ------------------------------------------------------------
-- `scope_type` defines whether the rule applies to a goal, condition
-- or the global system. `scope_code` points to the catalog code.

CREATE TABLE IF NOT EXISTS reglas_nutricionales (
  id SERIAL PRIMARY KEY,
  scope_type VARCHAR(30) NOT NULL,
  scope_code VARCHAR(80) NOT NULL,
  nutrient VARCHAR(80) NOT NULL,
  rule_type VARCHAR(30) NOT NULL,
  min_value NUMERIC(10,2),
  max_value NUMERIC(10,2),
  unit VARCHAR(30) NOT NULL,
  severity VARCHAR(30) NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT reglas_nutricionales_scope_type_check
    CHECK (scope_type IN ('goal', 'condition', 'global')),
  CONSTRAINT reglas_nutricionales_rule_type_check
    CHECK (rule_type IN ('min', 'max', 'range', 'recommendation')),
  CONSTRAINT reglas_nutricionales_severity_check
    CHECK (severity IN ('info', 'warning', 'danger'))
);

CREATE INDEX IF NOT EXISTS idx_reglas_nutricionales_scope
  ON reglas_nutricionales (scope_type, scope_code);

CREATE INDEX IF NOT EXISTS idx_reglas_nutricionales_nutrient
  ON reglas_nutricionales (nutrient);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reglas_nutricionales_unique_seed
  ON reglas_nutricionales (scope_type, scope_code, nutrient, rule_type, message);

-- ------------------------------------------------------------
-- 6. User nutrition targets
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usuario_metas_nutricionales (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  calories_min NUMERIC(8,2),
  calories_max NUMERIC(8,2),
  protein_min_g NUMERIC(8,2),
  protein_max_g NUMERIC(8,2),
  carbs_min_g NUMERIC(8,2),
  carbs_max_g NUMERIC(8,2),
  fat_min_g NUMERIC(8,2),
  fat_max_g NUMERIC(8,2),
  saturated_fat_max_g NUMERIC(8,2),
  sugar_max_g NUMERIC(8,2),
  fiber_min_g NUMERIC(8,2),
  sodium_max_mg NUMERIC(8,2),
  water_min_ml NUMERIC(8,2),
  calculation_source VARCHAR(40) NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT usuario_metas_calculation_source_check
    CHECK (calculation_source IN ('manual', 'system', 'ai_document', 'professional'))
);

-- ------------------------------------------------------------
-- 7. Seed initial goals
-- ------------------------------------------------------------

INSERT INTO objetivos_nutricionales (code, nombre, descripcion)
VALUES
  ('gain_muscle', 'Ganar masa muscular', 'Aumentar masa muscular con soporte de proteina, energia suficiente y habitos de entrenamiento.'),
  ('lose_body_fat', 'Perder grasa corporal', 'Reducir grasa corporal con control calorico, proteina suficiente y alimentos de alta saciedad.'),
  ('maintain_weight', 'Mantener peso', 'Mantener composicion corporal y habitos sostenibles.'),
  ('general_health', 'Mejorar salud general', 'Mejorar calidad alimentaria, variedad y equilibrio nutricional.'),
  ('control_glucose', 'Controlar glucosa', 'Apoyar control de glucosa con calidad de carbohidratos, fibra y reduccion de azucar anadida.'),
  ('reduce_cholesterol', 'Reducir colesterol', 'Priorizar fibra, grasas saludables y reduccion de grasa saturada.'),
  ('control_blood_pressure', 'Controlar presion arterial', 'Reducir sodio y apoyar habitos alimentarios compatibles con control de presion arterial.'),
  ('improve_digestion', 'Mejorar digestion', 'Identificar tolerancias, mejorar fibra y reducir detonantes digestivos.'),
  ('increase_energy', 'Aumentar energia', 'Mejorar distribucion de comidas, hidratacion y calidad de nutrientes.'),
  ('sports_performance', 'Mejorar rendimiento deportivo', 'Ajustar energia, proteina, carbohidratos e hidratacion segun actividad.'),
  ('medical_diet', 'Seguir dieta por indicacion medica', 'Adaptar recomendaciones a instrucciones clinicas confirmadas.'),
  ('manage_allergies', 'Manejar alergias o intolerancias', 'Evitar ingredientes incompatibles y sugerir alternativas seguras.')
ON CONFLICT (code) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  is_active = TRUE;

-- ------------------------------------------------------------
-- 8. Seed initial clinical conditions
-- ------------------------------------------------------------

INSERT INTO condiciones_clinicas (
  code,
  nombre,
  descripcion,
  risk_level,
  requires_professional_guidance
)
VALUES
  ('diabetes', 'Diabetes', 'Condicion que requiere control de carbohidratos, azucar anadida y calidad de la dieta.', 'high', TRUE),
  ('hypertension', 'Hipertension', 'Condicion relacionada con presion arterial elevada y control de sodio.', 'high', TRUE),
  ('high_cholesterol', 'Colesterol alto', 'Condicion que puede requerir control de grasa saturada y aumento de fibra.', 'medium', TRUE),
  ('kidney_disease', 'Enfermedad renal', 'Condicion que puede requerir control de proteina, sodio, potasio, fosforo y liquidos.', 'high', TRUE),
  ('heart_disease', 'Enfermedad cardiaca', 'Condicion cardiovascular que requiere recomendaciones conservadoras y supervisadas.', 'high', TRUE),
  ('celiac_disease', 'Celiaquia', 'Condicion que requiere evitar gluten.', 'high', TRUE),
  ('lactose_intolerance', 'Intolerancia a lactosa', 'Dificultad para digerir lactosa presente en lacteos.', 'medium', FALSE),
  ('food_allergies', 'Alergias alimentarias', 'Alergias que requieren evitar ingredientes especificos.', 'high', TRUE),
  ('gastritis', 'Gastritis', 'Condicion digestiva que puede requerir evitar irritantes.', 'medium', TRUE),
  ('ibs', 'Colon irritable', 'Condicion digestiva con sensibilidad a grupos de alimentos o habitos.', 'medium', TRUE),
  ('anemia', 'Anemia', 'Condicion relacionada con niveles bajos de hemoglobina o hierro, segun diagnostico.', 'medium', TRUE),
  ('pregnancy', 'Embarazo', 'Etapa que requiere necesidades nutricionales especificas y cuidado clinico.', 'high', TRUE),
  ('obesity', 'Obesidad', 'Condicion que puede requerir objetivos personalizados de energia, calidad alimentaria y seguimiento.', 'medium', TRUE)
ON CONFLICT (code) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  risk_level = EXCLUDED.risk_level,
  requires_professional_guidance = EXCLUDED.requires_professional_guidance,
  is_active = TRUE;

-- ------------------------------------------------------------
-- 9. Seed initial nutrition rules
-- ------------------------------------------------------------

INSERT INTO reglas_nutricionales (
  scope_type,
  scope_code,
  nutrient,
  rule_type,
  min_value,
  max_value,
  unit,
  severity,
  message
)
VALUES
  ('goal', 'gain_muscle', 'protein_g', 'min', 25, NULL, 'g_per_meal', 'info', 'Esta comida podria necesitar mas proteina para apoyar ganancia muscular.'),
  ('goal', 'lose_body_fat', 'calories', 'max', NULL, 650, 'kcal_per_meal', 'warning', 'Esta comida puede ser alta en calorias para un objetivo de perdida de grasa.'),
  ('goal', 'control_glucose', 'sugar_g', 'max', NULL, 12, 'g_per_meal', 'warning', 'Esta comida puede tener demasiado azucar para control de glucosa.'),
  ('goal', 'reduce_cholesterol', 'saturated_fat_g', 'max', NULL, 7, 'g_per_meal', 'warning', 'Esta comida puede ser alta en grasa saturada.'),
  ('condition', 'hypertension', 'sodium_mg', 'max', NULL, 600, 'mg_per_meal', 'danger', 'Esta comida puede ser alta en sodio para una persona con hipertension.'),
  ('condition', 'diabetes', 'sugar_g', 'max', NULL, 10, 'g_per_meal', 'danger', 'Esta comida puede contener demasiado azucar para una persona con diabetes.'),
  ('condition', 'kidney_disease', 'protein_g', 'max', NULL, 35, 'g_per_meal', 'danger', 'Esta comida puede requerir revision profesional por su aporte de proteina.'),
  ('global', 'default', 'fiber_g', 'min', 4, NULL, 'g_per_meal', 'info', 'Agregar fibra puede mejorar saciedad y calidad nutricional.')
ON CONFLICT (scope_type, scope_code, nutrient, rule_type, message) DO NOTHING;

COMMIT;
