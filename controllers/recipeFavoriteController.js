const pool = require("../database/db");

const parseRecipeId = (value) => {
  const recipeId = Number(value);
  return Number.isInteger(recipeId) && recipeId > 0 ? recipeId : null;
};

const parsePagination = ({ limit = "12", offset = "0" }) => {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) return null;
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) return null;
  return { limit: parsedLimit, offset: parsedOffset };
};

const listFavoriteRecipes = async (req, res) => {
  const pagination = parsePagination(req.query);
  if (!pagination) return res.status(400).json({ message: "Paginacion invalida" });

  try {
    const result = await pool.query(
      `SELECT
         r.*,
         TRUE AS "isFavorite",
         favorites.created_at AS "favoritedAt",
         EXISTS (
           SELECT 1
           FROM receta_ingredientes ri
           JOIN ingrediente_restricciones ir ON ri.ingrediente_id = ir.ingrediente_id
           JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
           WHERE ri.receta_id = r.id AND ur.usuario_id = $1
         ) AS "hasUnsafeIngredients"
       FROM usuario_recetas_favoritas favorites
       JOIN recetas r ON r.id = favorites.receta_id
       WHERE favorites.usuario_id = $1
       ORDER BY favorites.created_at DESC, favorites.receta_id DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, pagination.limit + 1, pagination.offset]
    );
    const hasMore = result.rows.length > pagination.limit;
    return res.json({
      recipes: hasMore ? result.rows.slice(0, pagination.limit) : result.rows,
      pagination: {
        ...pagination,
        nextOffset: hasMore ? pagination.offset + pagination.limit : null,
        hasMore
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error obteniendo recetas guardadas" });
  }
};

const saveFavoriteRecipe = async (req, res) => {
  const recipeId = parseRecipeId(req.params.recipeId);
  if (!recipeId) return res.status(400).json({ message: "Receta invalida" });

  try {
    const recipe = await pool.query("SELECT id FROM recetas WHERE id = $1", [recipeId]);
    if (!recipe.rows.length) return res.status(404).json({ message: "Receta no encontrada" });

    const result = await pool.query(
      `INSERT INTO usuario_recetas_favoritas (usuario_id, receta_id)
       VALUES ($1, $2)
       ON CONFLICT (usuario_id, receta_id)
       DO UPDATE SET usuario_id = EXCLUDED.usuario_id
       RETURNING usuario_id AS "userId", receta_id AS "recipeId", created_at AS "createdAt"`,
      [req.user.id, recipeId]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error guardando receta" });
  }
};

const removeFavoriteRecipe = async (req, res) => {
  const recipeId = parseRecipeId(req.params.recipeId);
  if (!recipeId) return res.status(400).json({ message: "Receta invalida" });

  try {
    await pool.query(
      "DELETE FROM usuario_recetas_favoritas WHERE usuario_id = $1 AND receta_id = $2",
      [req.user.id, recipeId]
    );
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error eliminando receta guardada" });
  }
};

module.exports = { listFavoriteRecipes, saveFavoriteRecipe, removeFavoriteRecipe };
