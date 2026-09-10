const pool = require("../database/db");

const resolveCatalogIds = async (client, tableName, values) => {
  if (!Array.isArray(values)) return [];

  const ids = [];

  for (const value of values) {
    if (typeof value === "number" || /^\d+$/.test(String(value))) {
      ids.push(Number(value));
      continue;
    }

    const result = await client.query(
      `SELECT id FROM ${tableName} WHERE code = $1 AND is_active = TRUE`,
      [value]
    );

    if (result.rows[0]?.id) {
      ids.push(result.rows[0].id);
    }
  }

  return [...new Set(ids)];
};

const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const [profile, goals, conditions, targets] = await Promise.all([
      pool.query("SELECT * FROM perfiles_usuario WHERE usuario_id = $1", [userId]),
      pool.query(
        `SELECT
           uo.objetivo_id,
           uo.prioridad,
           uo.estado,
           og.code,
           og.nombre,
           og.descripcion
         FROM usuario_objetivos uo
         JOIN objetivos_nutricionales og ON uo.objetivo_id = og.id
         WHERE uo.usuario_id = $1
         ORDER BY uo.prioridad ASC, og.nombre ASC`,
        [userId]
      ),
      pool.query(
        `SELECT
           uc.condicion_id,
           uc.source,
           uc.confirmed_at,
           uc.notes,
           cc.code,
           cc.nombre,
           cc.descripcion,
           cc.risk_level,
           cc.requires_professional_guidance
         FROM usuario_condiciones uc
         JOIN condiciones_clinicas cc ON uc.condicion_id = cc.id
         WHERE uc.usuario_id = $1
         ORDER BY cc.risk_level DESC, cc.nombre ASC`,
        [userId]
      ),
      pool.query("SELECT * FROM usuario_metas_nutricionales WHERE usuario_id = $1", [userId])
    ]);

    return res.json({
      profile: profile.rows[0] || null,
      goals: goals.rows,
      conditions: conditions.rows,
      targets: targets.rows[0] || null
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error obteniendo perfil avanzado" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fecha_nacimiento,
      sexo,
      estatura_cm,
      peso_kg,
      nivel_actividad,
      condicion_fisica,
      habitos_alimentarios = {},
      preferencias_alimentarias = {},
      notas
    } = req.body;

    const result = await pool.query(
      `INSERT INTO perfiles_usuario (
         usuario_id,
         fecha_nacimiento,
         sexo,
         estatura_cm,
         peso_kg,
         nivel_actividad,
         condicion_fisica,
         habitos_alimentarios,
         preferencias_alimentarias,
         notas,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, CURRENT_TIMESTAMP)
       ON CONFLICT (usuario_id) DO UPDATE SET
         fecha_nacimiento = EXCLUDED.fecha_nacimiento,
         sexo = EXCLUDED.sexo,
         estatura_cm = EXCLUDED.estatura_cm,
         peso_kg = EXCLUDED.peso_kg,
         nivel_actividad = EXCLUDED.nivel_actividad,
         condicion_fisica = EXCLUDED.condicion_fisica,
         habitos_alimentarios = EXCLUDED.habitos_alimentarios,
         preferencias_alimentarias = EXCLUDED.preferencias_alimentarias,
         notas = EXCLUDED.notas,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId,
        fecha_nacimiento || null,
        sexo || null,
        estatura_cm || null,
        peso_kg || null,
        nivel_actividad || null,
        condicion_fisica || null,
        JSON.stringify(habitos_alimentarios),
        JSON.stringify(preferencias_alimentarias),
        notas || null
      ]
    );

    return res.json({
      message: "Perfil avanzado guardado correctamente",
      profile: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error guardando perfil avanzado" });
  }
};

const getCatalogs = async (_req, res) => {
  try {
    const [goals, conditions] = await Promise.all([
      pool.query(
        `SELECT id, code, nombre, descripcion
         FROM objetivos_nutricionales
         WHERE is_active = TRUE
         ORDER BY nombre ASC`
      ),
      pool.query(
        `SELECT id, code, nombre, descripcion, risk_level, requires_professional_guidance
         FROM condiciones_clinicas
         WHERE is_active = TRUE
         ORDER BY risk_level DESC, nombre ASC`
      )
    ]);

    return res.json({
      goals: goals.rows,
      conditions: conditions.rows
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error obteniendo catalogos de perfil" });
  }
};

const updateGoals = async (req, res) => {
  let client;

  try {
    const userId = req.user.id;
    const { goals } = req.body;

    if (!Array.isArray(goals)) {
      return res.status(400).json({ message: "La lista de objetivos es obligatoria" });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const goalIds = await resolveCatalogIds(client, "objetivos_nutricionales", goals);

    await client.query("DELETE FROM usuario_objetivos WHERE usuario_id = $1", [userId]);

    for (const [index, goalId] of goalIds.entries()) {
      await client.query(
        `INSERT INTO usuario_objetivos (usuario_id, objetivo_id, prioridad)
         VALUES ($1, $2, $3)`,
        [userId, goalId, index + 1]
      );
    }

    await client.query("COMMIT");

    return res.json({ message: "Objetivos guardados correctamente", goals: goalIds });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    return res.status(500).json({ error: "Error guardando objetivos" });
  } finally {
    if (client) client.release();
  }
};

const updateConditions = async (req, res) => {
  let client;

  try {
    const userId = req.user.id;
    const { conditions, source = "user" } = req.body;

    if (!Array.isArray(conditions)) {
      return res.status(400).json({ message: "La lista de condiciones es obligatoria" });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const conditionIds = await resolveCatalogIds(client, "condiciones_clinicas", conditions);

    await client.query("DELETE FROM usuario_condiciones WHERE usuario_id = $1", [userId]);

    for (const conditionId of conditionIds) {
      await client.query(
        `INSERT INTO usuario_condiciones (usuario_id, condicion_id, source, confirmed_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [userId, conditionId, source]
      );
    }

    await client.query("COMMIT");

    return res.json({
      message: "Condiciones clinicas guardadas correctamente",
      conditions: conditionIds
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    return res.status(500).json({ error: "Error guardando condiciones clinicas" });
  } finally {
    if (client) client.release();
  }
};

const updateTargets = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      calories_min,
      calories_max,
      protein_min_g,
      protein_max_g,
      carbs_min_g,
      carbs_max_g,
      fat_min_g,
      fat_max_g,
      saturated_fat_max_g,
      sugar_max_g,
      fiber_min_g,
      sodium_max_mg,
      water_min_ml,
      calculation_source = "manual",
      notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO usuario_metas_nutricionales (
         usuario_id,
         calories_min,
         calories_max,
         protein_min_g,
         protein_max_g,
         carbs_min_g,
         carbs_max_g,
         fat_min_g,
         fat_max_g,
         saturated_fat_max_g,
         sugar_max_g,
         fiber_min_g,
         sodium_max_mg,
         water_min_ml,
         calculation_source,
         notes,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15,
         $16, CURRENT_TIMESTAMP
       )
       ON CONFLICT (usuario_id) DO UPDATE SET
         calories_min = EXCLUDED.calories_min,
         calories_max = EXCLUDED.calories_max,
         protein_min_g = EXCLUDED.protein_min_g,
         protein_max_g = EXCLUDED.protein_max_g,
         carbs_min_g = EXCLUDED.carbs_min_g,
         carbs_max_g = EXCLUDED.carbs_max_g,
         fat_min_g = EXCLUDED.fat_min_g,
         fat_max_g = EXCLUDED.fat_max_g,
         saturated_fat_max_g = EXCLUDED.saturated_fat_max_g,
         sugar_max_g = EXCLUDED.sugar_max_g,
         fiber_min_g = EXCLUDED.fiber_min_g,
         sodium_max_mg = EXCLUDED.sodium_max_mg,
         water_min_ml = EXCLUDED.water_min_ml,
         calculation_source = EXCLUDED.calculation_source,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId,
        calories_min || null,
        calories_max || null,
        protein_min_g || null,
        protein_max_g || null,
        carbs_min_g || null,
        carbs_max_g || null,
        fat_min_g || null,
        fat_max_g || null,
        saturated_fat_max_g || null,
        sugar_max_g || null,
        fiber_min_g || null,
        sodium_max_mg || null,
        water_min_ml || null,
        calculation_source,
        notes || null
      ]
    );

    return res.json({
      message: "Metas nutricionales guardadas correctamente",
      targets: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error guardando metas nutricionales" });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getCatalogs,
  updateGoals,
  updateConditions,
  updateTargets
};
