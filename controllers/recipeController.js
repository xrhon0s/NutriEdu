const pool = require("../database/db");
const { evaluateRecipeForUser } = require("../services/nutritionRuleService");

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
      calorias_max,
      safe_only,
      paginated
    } = req.query;

    const pagination = parsePagination(req.query);
    if (paginated === "true" && !pagination) {
      return res.status(400).json({ message: "Los parametros de paginacion no son validos" });
    }

    const allowedHealthLevels = new Set(["muy_saludable", "saludable", "moderada"]);
    if (nivel_salud && !allowedHealthLevels.has(nivel_salud)) {
      return res.status(400).json({ message: "Nivel de salud inválido" });
    }

    const numericFilters = {
      nivel_min: parseOptionalNumber(nivel_min),
      nivel_max: parseOptionalNumber(nivel_max),
      calorias_min: parseOptionalNumber(calorias_min),
      calorias_max: parseOptionalNumber(calorias_max)
    };
    if (Object.values(numericFilters).some((value) => value === undefined)) {
      return res.status(400).json({ message: "Los filtros numéricos no son válidos" });
    }
    if (
      numericFilters.calorias_min !== null &&
      numericFilters.calorias_max !== null &&
      numericFilters.calorias_min > numericFilters.calorias_max
    ) {
      return res.status(400).json({ message: "Las calorías mínimas no pueden superar las máximas" });
    }

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
      WHERE (
        LOWER(r.nombre) LIKE LOWER($2)
        OR LOWER(COALESCE(r.descripcion, '')) LIKE LOWER($2)
      )
    `;
    
    let params = [userId, `%${query}%`];
    let counter = 3;

    if (numericFilters.nivel_min !== null) {
      baseQuery += ` AND r.nivel_salud >= $${counter++}`;
      params.push(numericFilters.nivel_min);
    }

    if (numericFilters.nivel_max !== null) {
      baseQuery += ` AND r.nivel_salud <= $${counter++}`;
      params.push(numericFilters.nivel_max);
    }

    if (numericFilters.nivel_min === null && numericFilters.nivel_max === null && nivel_salud) {
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

    if (numericFilters.calorias_min !== null) {
      baseQuery += ` AND r.calorias >= $${counter++}`;
      params.push(numericFilters.calorias_min);
    }

    if (numericFilters.calorias_max !== null) {
      baseQuery += ` AND r.calorias <= $${counter++}`;
      params.push(numericFilters.calorias_max);
    }

    if (safe_only === "true") {
      baseQuery += ` AND NOT EXISTS (
        SELECT 1
        FROM receta_ingredientes ri
        JOIN ingrediente_restricciones ir ON ri.ingrediente_id = ir.ingrediente_id
        JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
        WHERE ri.receta_id = r.id AND ur.usuario_id = $1
      )`;
    }

    baseQuery += " ORDER BY r.nivel_salud DESC, r.calorias ASC, r.nombre ASC, r.id ASC";

    if (paginated === "true") {
      const limitPosition = counter++;
      const offsetPosition = counter++;
      baseQuery += ` LIMIT $${limitPosition} OFFSET $${offsetPosition}`;
      params.push(pagination.limit + 1, pagination.offset);
    }

    const result = await pool.query(baseQuery, params);

    if (paginated === "true") {
      const hasMore = result.rows.length > pagination.limit;
      const recipes = hasMore ? result.rows.slice(0, pagination.limit) : result.rows;
      return res.json({
        recipes,
        pagination: {
          limit: pagination.limit,
          offset: pagination.offset,
          nextOffset: hasMore ? pagination.offset + pagination.limit : null,
          hasMore
        }
      });
    }

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error buscando recetas con filtros" });
  }
};

const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const parsePagination = ({ limit = "12", offset = "0" }) => {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  if (
    !Number.isInteger(parsedLimit) ||
    !Number.isInteger(parsedOffset) ||
    parsedLimit < 1 ||
    parsedLimit > 50 ||
    parsedOffset < 0
  ) {
    return null;
  }
  return { limit: parsedLimit, offset: parsedOffset };
};

// ================= Evaluacion nutricional personalizada =================
const evaluateRecipe = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const userId = req.user.id;

    const evaluation = await evaluateRecipeForUser(pool, { recipeId, userId });

    if (!evaluation) {
      return res.status(404).json({ message: "Receta no encontrada" });
    }

    return res.json(evaluation);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error evaluando receta" });
  }
};

module.exports = {
  getSafeRecipes,
  getRecommendedRecipes,
  getRecipeById,
  getRecipeIngredients,
  checkRecipeSafety, 
  searchRecipes,
  evaluateRecipe
};
