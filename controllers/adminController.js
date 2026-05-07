const pool = require("../database/db");

// Listar todas las recetas
const listRecipes = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM recetas ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo recetas" });
  }
};

// Crear receta
const createRecipe = async (req, res) => {
  const { nombre, descripcion, calorias, tiempo_preparacion } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO recetas(nombre, descripcion, calorias, tiempo_preparacion)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, descripcion, calorias, tiempo_preparacion]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error creando receta" });
  }
};

// Actualizar receta
const updateRecipe = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, calorias, tiempo_preparacion } = req.body;
  try {
    const result = await pool.query(
      `UPDATE recetas SET nombre=$1, descripcion=$2, calorias=$3, tiempo_preparacion=$4
       WHERE id=$5 RETURNING *`,
      [nombre, descripcion, calorias, tiempo_preparacion, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error actualizando receta" });
  }
};

// Eliminar receta
const deleteRecipe = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM recetas WHERE id=$1", [id]);
    res.json({ message: "Receta eliminada correctamente" });
  } catch (err) {
    res.status(500).json({ error: "Error eliminando receta" });
  }
};

module.exports = { listRecipes, createRecipe, updateRecipe, deleteRecipe };