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

module.exports = { getSafeRecipes, getRecommendedRecipes, getRecipeById };