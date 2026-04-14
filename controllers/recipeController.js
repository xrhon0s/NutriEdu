const pool = require("../database/db");

const getSafeRecipes = async (req, res) => {

 try {

  const userId = req.params.userId;

  const result = await pool.query(

   `SELECT r.*
    FROM recetas r
    WHERE r.id NOT IN (

     SELECT ri.receta_id
     FROM receta_ingredientes ri

     JOIN ingrediente_restricciones ir
     ON ri.ingrediente_id = ir.ingrediente_id

     JOIN usuario_restricciones ur
     ON ir.restriccion_id = ur.restriccion_id

     WHERE ur.usuario_id = $1

    )`,
    
   [userId]

  );

  res.json(result.rows);

 } catch (error) {

  console.error(error);

  res.status(500).json({
   error: "Error obteniendo recetas"
  });

 }

}

//=====================================================================

const getRecommendedRecipes = async (req, res) => {

 try {

  const userId = req.params.userId;

  const result = await pool.query(

   `SELECT r.*
    FROM recetas r
    WHERE r.id NOT IN (

     SELECT ri.receta_id
     FROM receta_ingredientes ri

     JOIN ingrediente_restricciones ir
     ON ri.ingrediente_id = ir.ingrediente_id

     JOIN usuario_restricciones ur
     ON ir.restriccion_id = ur.restriccion_id

     WHERE ur.usuario_id = $1

    )
    ORDER BY nivel_salud DESC, calorias ASC`,
    
   [userId]

  );

  res.json(result.rows);

 } catch (error) {

  console.error(error);

  res.status(500).json({
   error: "Error obteniendo recomendaciones"
  });

 }

};


const getRecipeById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM recetas WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Receta no encontrada"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error obteniendo la receta"
    });
  }
};

const getRecipeIngredients = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const result = await pool.query(
      `
      SELECT 
        i.id,
        i.nombre,
        CASE 
          WHEN ir.restriccion_id IS NOT NULL THEN false
          ELSE true
        END AS compatible
      FROM receta_ingredientes ri
      JOIN ingredientes i ON ri.ingrediente_id = i.id
      LEFT JOIN ingrediente_restricciones ir 
        ON i.id = ir.ingrediente_id
      LEFT JOIN usuario_restricciones ur 
        ON ir.restriccion_id = ur.restriccion_id
        AND ur.usuario_id = $2
      WHERE ri.receta_id = $1
      `,
      [id, userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error obteniendo ingredientes"
    });
  }
};

module.exports = { getSafeRecipes, getRecommendedRecipes, getRecipeById, getRecipeIngredients };