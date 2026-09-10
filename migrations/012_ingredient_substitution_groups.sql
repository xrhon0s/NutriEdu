-- NutriEdu - Culinary substitution groups
-- Version: 012

BEGIN;

ALTER TABLE ingredientes
  ADD COLUMN IF NOT EXISTS substitution_group VARCHAR(50) NOT NULL DEFAULT 'other';

ALTER TABLE ingredientes
  DROP CONSTRAINT IF EXISTS ingredientes_substitution_group_check;

ALTER TABLE ingredientes
  ADD CONSTRAINT ingredientes_substitution_group_check CHECK (substitution_group IN (
    'poultry', 'red_meat', 'fish', 'shellfish', 'egg', 'plant_protein',
    'grain', 'flour', 'pasta', 'bread', 'tortilla', 'tuber',
    'leafy_vegetable', 'cruciferous_vegetable', 'root_vegetable', 'allium',
    'nightshade', 'squash', 'mushroom', 'stalk_vegetable', 'watery_vegetable',
    'citrus', 'pome_fruit', 'berry', 'tropical_fruit', 'stone_fruit',
    'melon', 'grape', 'avocado',
    'dairy_milk', 'cultured_dairy', 'cheese', 'dairy_cream',
    'cooking_fat', 'nut', 'seed', 'legume',
    'sweetener', 'herb', 'spice', 'salt', 'acid', 'plant_milk', 'other'
  ));

UPDATE ingredientes SET substitution_group = 'poultry' WHERE LOWER(nombre) IN ('pollo', 'pechuga de pollo', 'pavo');
UPDATE ingredientes SET substitution_group = 'red_meat' WHERE LOWER(nombre) IN ('carne de res', 'carne de cerdo');
UPDATE ingredientes SET substitution_group = 'fish' WHERE LOWER(nombre) IN ('salmon', 'salmón', 'atun', 'atún', 'sardina');
UPDATE ingredientes SET substitution_group = 'shellfish' WHERE LOWER(nombre) IN ('camaron', 'camarón');
UPDATE ingredientes SET substitution_group = 'egg' WHERE LOWER(nombre) = 'huevo';
UPDATE ingredientes SET substitution_group = 'plant_protein' WHERE LOWER(nombre) = 'tofu';

UPDATE ingredientes SET substitution_group = 'grain' WHERE LOWER(nombre) IN ('arroz', 'arroz integral', 'avena', 'cuscus', 'cuscús', 'maiz', 'maíz', 'quinoa');
UPDATE ingredientes SET substitution_group = 'flour' WHERE LOWER(nombre) = 'harina de trigo';
UPDATE ingredientes SET substitution_group = 'pasta' WHERE LOWER(nombre) = 'pasta integral';
UPDATE ingredientes SET substitution_group = 'bread' WHERE LOWER(nombre) = 'pan integral';
UPDATE ingredientes SET substitution_group = 'tortilla' WHERE LOWER(nombre) IN ('tortilla de maiz', 'tortilla de maíz');
UPDATE ingredientes SET substitution_group = 'tuber' WHERE LOWER(nombre) = 'papa';

UPDATE ingredientes SET substitution_group = 'leafy_vegetable' WHERE LOWER(nombre) IN ('espinaca', 'lechuga', 'col rizada');
UPDATE ingredientes SET substitution_group = 'cruciferous_vegetable' WHERE LOWER(nombre) IN ('brocoli', 'brócoli');
UPDATE ingredientes SET substitution_group = 'root_vegetable' WHERE LOWER(nombre) IN ('zanahoria', 'rabano', 'rábano', 'betabel');
UPDATE ingredientes SET substitution_group = 'allium' WHERE LOWER(nombre) IN ('ajo', 'cebolla');
UPDATE ingredientes SET substitution_group = 'nightshade' WHERE LOWER(nombre) IN ('tomate', 'pimiento rojo', 'pimiento verde', 'berenjena');
UPDATE ingredientes SET substitution_group = 'squash' WHERE LOWER(nombre) IN ('calabacin', 'calabacín', 'chayote');
UPDATE ingredientes SET substitution_group = 'mushroom' WHERE LOWER(nombre) IN ('champiñones', 'champiñon', 'champiñón');
UPDATE ingredientes SET substitution_group = 'stalk_vegetable' WHERE LOWER(nombre) IN ('apio', 'esparagos', 'espárragos');
UPDATE ingredientes SET substitution_group = 'watery_vegetable' WHERE LOWER(nombre) = 'pepino';

UPDATE ingredientes SET substitution_group = 'citrus' WHERE LOWER(nombre) IN ('limon', 'limón', 'naranja');
UPDATE ingredientes SET substitution_group = 'pome_fruit' WHERE LOWER(nombre) IN ('manzana', 'pera');
UPDATE ingredientes SET substitution_group = 'berry' WHERE LOWER(nombre) = 'fresa';
UPDATE ingredientes SET substitution_group = 'tropical_fruit' WHERE LOWER(nombre) IN ('mango', 'pina', 'piña', 'platano', 'plátano');
UPDATE ingredientes SET substitution_group = 'stone_fruit' WHERE LOWER(nombre) = 'durazno';
UPDATE ingredientes SET substitution_group = 'melon' WHERE LOWER(nombre) IN ('melon', 'melón', 'sandia', 'sandía');
UPDATE ingredientes SET substitution_group = 'grape' WHERE LOWER(nombre) = 'uva';
UPDATE ingredientes SET substitution_group = 'avocado' WHERE LOWER(nombre) = 'aguacate';

UPDATE ingredientes SET substitution_group = 'dairy_milk' WHERE LOWER(nombre) = 'leche';
UPDATE ingredientes SET substitution_group = 'cultured_dairy' WHERE LOWER(nombre) = 'yogur natural';
UPDATE ingredientes SET substitution_group = 'cheese' WHERE LOWER(nombre) = 'queso';
UPDATE ingredientes SET substitution_group = 'dairy_cream' WHERE LOWER(nombre) = 'crema de leche';
UPDATE ingredientes SET substitution_group = 'cooking_fat' WHERE LOWER(nombre) IN ('aceite de oliva', 'aceite de coco', 'mantequilla');
UPDATE ingredientes SET substitution_group = 'nut' WHERE LOWER(nombre) IN ('almendras', 'cacahuete', 'nuez');
UPDATE ingredientes SET substitution_group = 'seed' WHERE LOWER(nombre) IN ('semillas de chia', 'semillas de chía', 'semillas de girasol');
UPDATE ingredientes SET substitution_group = 'legume' WHERE LOWER(nombre) IN ('lentejas', 'frijoles negros', 'garbanzos', 'soya');

UPDATE ingredientes SET substitution_group = 'sweetener' WHERE LOWER(nombre) IN ('azucar', 'azúcar', 'miel', 'stevia');
UPDATE ingredientes SET substitution_group = 'herb' WHERE LOWER(nombre) IN ('albahaca', 'oregano', 'orégano');
UPDATE ingredientes SET substitution_group = 'spice' WHERE LOWER(nombre) IN ('canela', 'comino', 'curcuma', 'cúrcuma', 'jengibre', 'pimienta negra');
UPDATE ingredientes SET substitution_group = 'salt' WHERE LOWER(nombre) = 'sal';
UPDATE ingredientes SET substitution_group = 'acid' WHERE LOWER(nombre) = 'vinagre';
UPDATE ingredientes SET substitution_group = 'plant_milk' WHERE LOWER(nombre) = 'leche de almendra';

CREATE INDEX IF NOT EXISTS idx_ingredientes_substitution_group_name
  ON ingredientes (substitution_group, nombre)
  WHERE substitution_group <> 'other';

COMMIT;
