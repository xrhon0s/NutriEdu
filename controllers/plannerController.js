const pool = require("../database/db");
const { createInAppNotification } = require("../services/notificationService");

const VALID_DAYS = new Set([
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo"
]);
const VALID_MEAL_TYPES = new Set(["Desayuno", "Almuerzo", "Cena"]);

const validatePlan = (plan) => {
  const occupiedSlots = new Set();

  for (const item of plan) {
    const recipeId = Number(item?.recetaId);
    const day = item?.diaSemana;
    const mealType = item?.tipoComida;

    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      return "El plan contiene una receta inválida";
    }

    if (!VALID_DAYS.has(day) || !VALID_MEAL_TYPES.has(mealType)) {
      return "El plan contiene un día o tipo de comida inválido";
    }

    const slot = `${day}:${mealType}`;
    if (occupiedSlots.has(slot)) {
      return "Cada espacio del plan solo puede contener una receta";
    }
    occupiedSlots.add(slot);
  }

  return null;
};

const saveWeeklyPlan = async (req, res) => {
  let client;

  try {
    const { plan } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(plan)) {
      return res.status(400).json({
        message: "Datos de planificación inválidos"
      });
    }

    const validationError = validatePlan(plan);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const recipeIds = [...new Set(plan.map((item) => Number(item.recetaId)))];
    if (recipeIds.length) {
      const recipeResult = await client.query(
        `SELECT r.id,
          EXISTS (
            SELECT 1
            FROM receta_ingredientes ri
            JOIN ingrediente_restricciones ir ON ri.ingrediente_id = ir.ingrediente_id
            JOIN usuario_restricciones ur ON ir.restriccion_id = ur.restriccion_id
            WHERE ri.receta_id = r.id AND ur.usuario_id = $1
          ) AS has_unsafe_ingredients
         FROM recetas r
         WHERE r.id = ANY($2::int[])`,
        [userId, recipeIds]
      );

      if (recipeResult.rows.length !== recipeIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El plan contiene una receta que no existe" });
      }

      if (recipeResult.rows.some((recipe) => recipe.has_unsafe_ingredients)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "El plan contiene una receta incompatible con tus restricciones"
        });
      }
    }

    await client.query(
      "DELETE FROM plan_semanal WHERE usuario_id = $1",
      [userId]
    );

    for (const item of plan) {
      const { recetaId, diaSemana, tipoComida } = item;

      await client.query(
        `INSERT INTO plan_semanal (usuario_id, receta_id, dia_semana, tipo_comida)
         VALUES ($1, $2, $3, $4)`,
        [userId, recetaId, diaSemana, tipoComida]
      );
    }

    await client.query("COMMIT");

    createInAppNotification(pool, {
      userId,
      category: "weekly_plan",
      eventType: "weekly_plan_updated",
      title: "Plan semanal actualizado",
      body: "Tu plan guardado ya esta disponible junto con la lista de compras.",
      destination: "/plan"
    }).catch((notificationError) => {
      console.error("Error creando notificacion del plan:", notificationError);
    });

    res.json({
      message: "Plan semanal guardado correctamente"
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Error reverting weekly plan transaction", rollbackError);
      }
    }
    console.error(error);
    res.status(500).json({
      error: "Error guardando plan semanal"
    });
  } finally {
    client?.release();
  }
};

const getWeeklyPlan = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT 
        ps.id,
        ps.dia_semana,
        ps.tipo_comida,
        r.id AS receta_id,
        r.nombre AS receta_nombre,
        r.descripcion,
        r.calorias,
        r.protein_g,
        r.carbs_g,
        r.fat_g,
        r.saturated_fat_g,
        r.sugar_g,
        r.fiber_g,
        r.sodium_mg,
        r.tiempo_preparacion,
        r.nivel_salud
      FROM plan_semanal ps
      JOIN recetas r ON ps.receta_id = r.id
      WHERE ps.usuario_id = $1
      ORDER BY ps.dia_semana, ps.tipo_comida
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error obteniendo plan semanal"
    });
  }
};

const getShoppingList = async (req, res) => {
  try {
    const userId = req.user.id;

    if (req.query.detailed === "true") {
      const [itemsResult, planResult] = await Promise.all([
        pool.query(
          `WITH ingredient_uses AS (
             SELECT i.id, i.nombre, i.food_group, ps.id AS plan_entry_id,
               r.id AS recipe_id, r.nombre AS recipe_name,
               ri.amount::float AS amount, NULLIF(BTRIM(ri.unit), '') AS unit,
               ri.amount_g::float AS amount_g
             FROM plan_semanal ps
             JOIN recetas r ON ps.receta_id = r.id
             JOIN receta_ingredientes ri ON ps.receta_id = ri.receta_id
             JOIN ingredientes i ON ri.ingrediente_id = i.id
             WHERE ps.usuario_id = $1
           ), ingredient_totals AS (
             SELECT id, nombre, food_group,
               SUM(amount_g)::float AS known_amount_g,
               COUNT(*)::int AS planned_uses,
               COUNT(*) FILTER (WHERE amount_g IS NULL AND amount IS NULL)::int AS missing_quantity_uses,
               COUNT(DISTINCT recipe_id)::int AS recipe_count,
               ARRAY_AGG(DISTINCT recipe_name ORDER BY recipe_name) AS source_recipes
             FROM ingredient_uses
             GROUP BY id, nombre, food_group
           )
           SELECT totals.*,
             COALESCE((
               SELECT JSON_AGG(
                 JSON_BUILD_OBJECT('amount', quantity.amount, 'unit', quantity.unit)
                 ORDER BY quantity.unit
               )
               FROM (
                 SELECT SUM(uses.amount)::float AS amount,
                   COALESCE(uses.unit, 'unidad') AS unit
                 FROM ingredient_uses uses
                 WHERE uses.id = totals.id
                   AND uses.amount IS NOT NULL
                   AND uses.amount_g IS NULL
                 GROUP BY COALESCE(uses.unit, 'unidad')
               ) quantity
             ), '[]'::json) AS quantities
           FROM ingredient_totals totals
           ORDER BY totals.food_group, totals.nombre`,
          [userId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS planned_meals,
             COALESCE(
               MD5(STRING_AGG(
                 CONCAT_WS(':', receta_id::text, dia_semana, tipo_comida),
                 '|' ORDER BY dia_semana, tipo_comida, receta_id
               )),
               MD5('')
             ) AS plan_signature
           FROM plan_semanal
           WHERE usuario_id = $1`,
          [userId]
        )
      ]);

      const items = itemsResult.rows.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        foodGroup: item.food_group || "other",
        knownAmountG: item.known_amount_g,
        plannedUses: item.planned_uses,
        missingQuantityUses: item.missing_quantity_uses,
        recipeCount: item.recipe_count,
        sourceRecipes: item.source_recipes || [],
        quantities: item.quantities || []
      }));
      const plan = planResult.rows[0];

      return res.json({
        items,
        planSignature: plan.plan_signature,
        plannedMeals: plan.planned_meals,
        missingQuantityItems: items.filter((item) => item.missingQuantityUses > 0).length
      });
    }

    const result = await pool.query(
      `
      SELECT DISTINCT i.id, i.nombre
      FROM plan_semanal ps
      JOIN receta_ingredientes ri ON ps.receta_id = ri.receta_id
      JOIN ingredientes i ON ri.ingrediente_id = i.id
      WHERE ps.usuario_id = $1
      ORDER BY i.nombre ASC
      `,
      [userId]
    );

    return res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error generando lista de compras"
    });
  }
};

module.exports = { saveWeeklyPlan, getWeeklyPlan, getShoppingList };
