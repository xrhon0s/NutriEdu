-- NutriEdu - Ingredient food groups
-- Version: 009

BEGIN;

ALTER TABLE ingredientes
  ADD COLUMN IF NOT EXISTS food_group VARCHAR(40) NOT NULL DEFAULT 'other';

ALTER TABLE ingredientes
  DROP CONSTRAINT IF EXISTS ingredientes_food_group_check;

ALTER TABLE ingredientes
  ADD CONSTRAINT ingredientes_food_group_check CHECK (food_group IN (
    'protein', 'carbohydrate', 'vegetable', 'fruit', 'dairy',
    'fat', 'legume', 'seasoning', 'beverage', 'other'
  ));

UPDATE ingredientes SET food_group = 'protein'
WHERE LOWER(nombre) IN ('pollo', 'huevo', 'camaron', 'carne de res', 'carne de cerdo', 'salmon', 'atun', 'sardina', 'tofu');

UPDATE ingredientes SET food_group = 'carbohydrate'
WHERE LOWER(nombre) IN ('harina de trigo', 'arroz', 'avena', 'papa', 'pasta integral', 'pan integral', 'tortilla de maiz', 'quinoa', 'cuscus', 'maiz');

UPDATE ingredientes SET food_group = 'vegetable'
WHERE LOWER(nombre) IN ('zanahoria', 'brocoli', 'espinaca', 'tomate', 'cebolla', 'ajo', 'pimiento rojo', 'pimiento verde', 'lechuga', 'pepino', 'apio', 'chayote', 'calabacin', 'berenjena', 'champiñones', 'esparagos', 'col rizada', 'rabano', 'betabel');

UPDATE ingredientes SET food_group = 'fruit'
WHERE LOWER(nombre) IN ('aguacate', 'limon', 'naranja', 'manzana', 'platano', 'fresa', 'mango', 'pina', 'uva', 'sandia', 'melon', 'pera', 'durazno');

UPDATE ingredientes SET food_group = 'dairy'
WHERE LOWER(nombre) IN ('leche', 'queso', 'yogur natural', 'crema de leche');

UPDATE ingredientes SET food_group = 'fat'
WHERE LOWER(nombre) IN ('almendras', 'mantequilla', 'aceite de oliva', 'aceite de coco', 'nuez', 'cacahuete', 'semillas de chia', 'semillas de girasol');

UPDATE ingredientes SET food_group = 'legume'
WHERE LOWER(nombre) IN ('lentejas', 'frijoles negros', 'garbanzos', 'soya');

UPDATE ingredientes SET food_group = 'seasoning'
WHERE LOWER(nombre) IN ('azucar', 'albahaca', 'vinagre', 'sal', 'pimienta negra', 'oregano', 'comino', 'curcuma', 'canela', 'jengibre', 'miel', 'stevia');

UPDATE ingredientes SET food_group = 'beverage'
WHERE LOWER(nombre) IN ('leche de almendra');

CREATE INDEX IF NOT EXISTS idx_ingredientes_food_group_name
  ON ingredientes (food_group, nombre);

COMMIT;
