const pool = require("../database/db");
const fs = require("fs");
const path = require("path");
const { getVisionProvider } = require("../services/vision");
const { getVisionUsagePolicy } = require("../services/visionUsageService");

const getOperationsOverview = async (req, res) => {
  try {
    const [countsResult, usageResult, migrationTableResult] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM usuarios)::int AS users,
          (SELECT COUNT(*) FROM perfiles_usuario)::int AS profiles,
          (SELECT COUNT(*) FROM recetas)::int AS recipes,
          (SELECT COUNT(*) FROM ingredientes)::int AS ingredients,
          (SELECT COUNT(*) FROM restricciones)::int AS restrictions,
          (SELECT COUNT(*) FROM objetivos_nutricionales WHERE is_active)::int AS active_goals,
          (SELECT COUNT(*) FROM condiciones_clinicas WHERE is_active)::int AS active_conditions,
          (SELECT COUNT(*) FROM reglas_nutricionales WHERE is_active)::int AS active_rules,
          (SELECT COUNT(*) FROM notifications WHERE read_at IS NULL)::int AS unread_notifications
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS analyses,
          COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COALESCE(SUM(CASE
            WHEN status = 'succeeded' THEN estimated_cost_usd
            WHEN status = 'pending' THEN reserved_cost_usd
            ELSE 0
          END), 0)::numeric AS committed_usd
        FROM vision_analysis_usage
        WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      `),
      pool.query("SELECT to_regclass('public.schema_migrations') AS migration_table")
    ]);

    const knownMigrations = fs.readdirSync(path.join(__dirname, "..", "migrations"))
      .filter((fileName) => /^\d{3}_.+\.sql$/.test(fileName))
      .sort();
    const recordedMigrations = migrationTableResult.rows[0].migration_table
      ? (await pool.query("SELECT version, file_name, applied_at FROM schema_migrations ORDER BY version")).rows
      : [];
    const recordedByVersion = new Map(recordedMigrations.map((migration) => [migration.version, migration]));
    const counts = countsResult.rows[0];
    const usage = usageResult.rows[0];
    const policy = getVisionUsagePolicy();
    const provider = getVisionProvider();

    return res.json({
      generatedAt: new Date().toISOString(),
      counts: {
        users: counts.users,
        profiles: counts.profiles,
        profileCoveragePercent: counts.users ? Math.round((counts.profiles / counts.users) * 100) : 0,
        recipes: counts.recipes,
        ingredients: counts.ingredients,
        restrictions: counts.restrictions,
        activeGoals: counts.active_goals,
        activeConditions: counts.active_conditions,
        activeRules: counts.active_rules,
        unreadNotifications: counts.unread_notifications
      },
      vision: {
        configured: Boolean(provider),
        provider: provider?.name || null,
        model: provider?.model || null,
        monthlyBudgetUsd: policy.monthlyBudgetUsd,
        committedUsd: Number(usage.committed_usd),
        analyses: usage.analyses,
        succeeded: usage.succeeded,
        failed: usage.failed,
        pending: usage.pending
      },
      migrations: knownMigrations.map((fileName) => {
        const version = fileName.slice(0, 3);
        const recorded = recordedByVersion.get(version);
        return {
          version,
          fileName,
          recorded: Boolean(recorded),
          recordedAt: recorded?.applied_at || null
        };
      })
    });
  } catch (error) {
    console.error("Error consultando operacion administrativa:", error);
    return res.status(500).json({ error: "Error consultando el estado operativo" });
  }
};

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
  const nombre = normalizeName(req.body.nombre);
  if (!nombre) return res.status(400).json({ message: "El nombre del ingrediente es obligatorio" });
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

const updateIngredient = async (req, res) => {
  const id = Number(req.params.id);
  const nombre = normalizeName(req.body.nombre);
  if (!Number.isSafeInteger(id) || id <= 0 || !nombre) {
    return res.status(400).json({ message: "Ingrediente invalido" });
  }
  try {
    const result = await pool.query(
      "UPDATE ingredientes SET nombre = $2 WHERE id = $1 RETURNING id, nombre",
      [id, nombre]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Ingrediente no encontrado" });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando ingrediente:", error);
    return res.status(500).json({ error: "Error actualizando ingrediente" });
  }
};

const deleteIngredient = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Ingrediente invalido" });
  }
  try {
    const result = await pool.query("DELETE FROM ingredientes WHERE id = $1 RETURNING id", [id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Ingrediente no encontrado" });
    return res.json({ deleted: true, id });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({ message: "El ingrediente esta relacionado con recetas o restricciones" });
    }
    console.error("Error eliminando ingrediente:", error);
    return res.status(500).json({ error: "Error eliminando ingrediente" });
  }
};

const normalizeName = (value) => typeof value === "string" ? value.trim().slice(0, 160) : "";

module.exports = {
  getOperationsOverview,
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient
};
