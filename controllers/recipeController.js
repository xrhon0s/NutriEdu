const pool = require("../database/db");

// ================= Recetas Seguras =================
const getSafeRecipes = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT r.*
       FROM recetas r
       WHERE r.id NOT IN (
         SELECT ri.receta_id
         FROM receta_ingredientes ri
         JOIN ingrediente_restricciones ir ON ri.ingrediente_id = ir.ingrediente_id
         JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
         WHERE ur.usuario_id = $1
       )
       ORDER BY r.nivel_salud DESC, r.calorias ASC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo recetas" });
  }
};

// ================= Recetas Recomendadas =================
const getRecommendedRecipes = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT r.*
       FROM recetas r
       WHERE r.id NOT IN (
         SELECT ri.receta_id
         FROM receta_ingredientes ri
         JOIN ingrediente_restricciones ir ON ri.ingrediente_id = ir.ingrediente_id
         JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
         WHERE ur.usuario_id = $1
       )
       ORDER BY nivel_salud DESC, calorias ASC`,
      [userId]
    );

    // Retornar solo un subset para recomendaciones (3-5 recetas aleatorias)
    const recommended = result.rows.sort(() => 0.5 - Math.random()).slice(0, 5);

    res.json(recommended);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo recomendaciones" });
  }
};

// ================= Receta por ID =================
const getRecipeById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT * FROM recetas WHERE id = $1", [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Receta no encontrada" });

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo la receta" });
  }
};

// ================= Ingredientes de la receta =================
const getRecipeIngredients = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT i.id, i.nombre
       FROM receta_ingredientes ri
       JOIN ingredientes i ON ri.ingrediente_id = i.id
       WHERE ri.receta_id = $1
       ORDER BY i.nombre ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo ingredientes de la receta" });
  }
};

// ================= Verificar seguridad de la receta =================
const checkRecipeSafety = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const userId = req.user.id;

    // Ingredientes no seguros
    const unsafeRes = await pool.query(
      `SELECT i.id, i.nombre
       FROM receta_ingredientes ri
       JOIN ingredientes i ON ri.ingrediente_id = i.id
       JOIN ingrediente_restricciones ir ON i.id = ir.ingrediente_id
       JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
       WHERE ri.receta_id = $1 AND ur.usuario_id = $2`,
      [recipeId, userId]
    );
    const unsafeIngredients = unsafeRes.rows;

    // Sustitutos (hasta 5) por ingrediente no seguro
    const substitutes = await Promise.all(
      unsafeIngredients.map(async (ing) => {
        const subsRes = await pool.query(
          `SELECT i.id, i.nombre
           FROM ingredientes i
           WHERE i.id NOT IN (
             SELECT ingrediente_id
             FROM ingrediente_restricciones ir
             JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
             WHERE ur.usuario_id = $1
           )
           AND i.id != $2
           LIMIT 5`,
          [userId, ing.id]
        );
        return { ingredienteOriginal: ing.nombre, opciones: subsRes.rows };
      })
    );

    res.json({ unsafeIngredients, substitutes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error verificando seguridad de la receta" });
  }
};

// ================= BUSCADOR GLOBAL DE RECETAS =================
const searchRecipes = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      query = "",
      nivel_salud,
      nivel_min,
      nivel_max,
      calorias_min,
      calorias_max
    } = req.query;

    let baseQuery = `
      SELECT r.*,
        EXISTS (
          SELECT 1
          FROM receta_ingredientes ri
          JOIN ingrediente_restricciones ir ON ri.ingrediente_id = ir.ingrediente_id
          JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
          WHERE ri.receta_id = r.id
          AND ur.usuario_id = $1
        ) AS "hasUnsafeIngredients"
      FROM recetas r
      WHERE LOWER(r.nombre) LIKE LOWER($2)
    `;
    
    let params = [userId, `%${query}%`];
    let counter = 3;

    if (nivel_min) {
      baseQuery += ` AND r.nivel_salud >= $${counter++}`;
      params.push(nivel_min);
    }

    if (nivel_max) {
      baseQuery += ` AND r.nivel_salud <= $${counter++}`;
      params.push(nivel_max);
    }

    if (!nivel_min && !nivel_max && nivel_salud) {
      if (nivel_salud === "muy_saludable") {
        baseQuery += " AND r.nivel_salud >= 5";
      } else if (nivel_salud === "saludable") {
        baseQuery += " AND r.nivel_salud >= 3 AND r.nivel_salud < 5";
      } else if (nivel_salud === "moderada") {
        baseQuery += " AND r.nivel_salud < 3";
      } else {
        baseQuery += ` AND r.nivel_salud = $${counter++}`;
        params.push(nivel_salud);
      }
    }

    if (calorias_min) {
      baseQuery += ` AND r.calorias >= $${counter++}`;
      params.push(calorias_min);
    }

    if (calorias_max) {
      baseQuery += ` AND r.calorias <= $${counter++}`;
      params.push(calorias_max);
    }

    const result = await pool.query(baseQuery, params);
    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error buscando recetas con filtros" });
  }
};

module.exports = {
  getSafeRecipes,
  getRecommendedRecipes,
  getRecipeById,
  getRecipeIngredients,
  checkRecipeSafety, 
  searchRecipes
};
