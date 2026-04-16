const pool = require("../database/db");

const saveWeeklyPlan = async (req, res) => {
  try {
    const { userId, plan } = req.body;

    if (!userId || !Array.isArray(plan)) {
      return res.status(400).json({
        message: "Datos de planificación inválidos"
      });
    }

    await pool.query(
      "DELETE FROM plan_semanal WHERE usuario_id = $1",
      [userId]
    );

    for (const item of plan) {
      const { recetaId, diaSemana, tipoComida } = item;

      await pool.query(
        `INSERT INTO plan_semanal (usuario_id, receta_id, dia_semana, tipo_comida)
         VALUES ($1, $2, $3, $4)`,
        [userId, recetaId, diaSemana, tipoComida]
      );
    }

    res.json({
      message: "Plan semanal guardado correctamente"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error guardando plan semanal"
    });
  }
};

const getWeeklyPlan = async (req, res) => {
  try {
    const { userId } = req.params;

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
    const { userId } = req.params;

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

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error generando lista de compras"
    });
  }
};

module.exports = { saveWeeklyPlan, getWeeklyPlan, getShoppingList };