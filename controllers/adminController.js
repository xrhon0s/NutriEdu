const pool = require("../database/db");

// ================= Recetas =================

// Listar recetas con ingredientes
const listRecipes = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.id, r.nombre, r.descripcion, r.calorias, r.tiempo_preparacion,
        COALESCE(
          json_agg(json_build_object('id', i.id, 'nombre', i.nombre)) 
          FILTER (WHERE i.id IS NOT NULL), '[]'
        ) AS ingredients
      FROM recetas r
      LEFT JOIN receta_ingredientes ri ON r.id = ri.receta_id
      LEFT JOIN ingredientes i ON ri.ingrediente_id = i.id
      GROUP BY r.id
      ORDER BY r.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo recetas" });
  }
};

// Crear receta con ingredientes
const createRecipe = async (req, res) => {
  const { nombre, descripcion, calorias, tiempo_preparacion, ingredients } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO recetas(nombre, descripcion, calorias, tiempo_preparacion)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, descripcion, calorias, tiempo_preparacion]
    );

    const receta = result.rows[0];

    // Insertar ingredientes relacionados
    if (ingredients?.length > 0) {
      const values = ingredients.map((_, i) => `($1, $${i + 2})`).join(",");
      await pool.query(
        `INSERT INTO receta_ingredientes(receta_id, ingrediente_id) VALUES ${values}`,
        [receta.id, ...ingredients.map(Number)]
      );
    }

    // Devolver receta con ingredientes
    const recetaConIngredientes = await pool.query(`
      SELECT r.*,
        COALESCE(
          json_agg(json_build_object('id', i.id, 'nombre', i.nombre))
          FILTER (WHERE i.id IS NOT NULL), '[]'
        ) AS ingredients
      FROM recetas r
      LEFT JOIN receta_ingredientes ri ON r.id = ri.receta_id
      LEFT JOIN ingredientes i ON ri.ingrediente_id = i.id
      WHERE r.id = $1
      GROUP BY r.id
    `, [receta.id]);

    res.json(recetaConIngredientes.rows[0]);
  } catch (err) {
    console.error("Error creando receta:", err);
    res.status(500).json({ error: "Ocurrió un error al guardar la receta" });
  }
};

// Actualizar receta con ingredientes
const updateRecipe = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, calorias, tiempo_preparacion, ingredients } = req.body;

  try {
    await pool.query(
      `UPDATE recetas SET nombre=$1, descripcion=$2, calorias=$3, tiempo_preparacion=$4 WHERE id=$5`,
      [nombre, descripcion, calorias, tiempo_preparacion, id]
    );

    // Borrar ingredientes actuales y agregar los nuevos
    await pool.query(`DELETE FROM receta_ingredientes WHERE receta_id=$1`, [id]);
    if (ingredients?.length > 0) {
      const values = ingredients.map((_, i) => `($1, $${i + 2})`).join(",");
      await pool.query(
        `INSERT INTO receta_ingredientes(receta_id, ingrediente_id) VALUES ${values}`,
        [id, ...ingredients.map(Number)]
      );
    }

    const recetaConIngredientes = await pool.query(`
      SELECT r.*,
        COALESCE(
          json_agg(json_build_object('id', i.id, 'nombre', i.nombre))
          FILTER (WHERE i.id IS NOT NULL), '[]'
        ) AS ingredients
      FROM recetas r
      LEFT JOIN receta_ingredientes ri ON r.id = ri.receta_id
      LEFT JOIN ingredientes i ON ri.ingrediente_id = i.id
      WHERE r.id = $1
      GROUP BY r.id
    `, [id]);

    res.json(recetaConIngredientes.rows[0]);
  } catch (err) {
    console.error("Error actualizando receta:", err);
    res.status(500).json({ error: "Ocurrió un error al actualizar la receta" });
  }
};

// Eliminar receta
const deleteRecipe = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM recetas WHERE id=$1", [id]);
    res.json({ message: "Receta eliminada correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error eliminando receta" });
  }
};

// ================= Ingredientes =================

// Listar ingredientes
const listIngredients = async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, nombre FROM ingredientes ORDER BY nombre`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo ingredientes" });
  }
};

// Crear ingrediente
const createIngredient = async (req, res) => {
  console.log("Body recibido:", req.body);
  const { nombre } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO ingredientes(nombre) VALUES ($1) RETURNING *`,
      [nombre]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error creando ingrediente:", err);
    res.status(500).json({ error: "Ocurrió un error al crear el ingrediente" });
  }
};

module.exports = {
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  listIngredients,
  createIngredient
};