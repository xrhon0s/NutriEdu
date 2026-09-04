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

const listUsers = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(5, Number.parseInt(req.query.limit, 10) || 15));
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
    const role = ["usuario", "administrador"].includes(req.query.role) ? req.query.role : null;
    const offset = (page - 1) * limit;
    const params = [];
    const filters = [];
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(u.nombre ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      filters.push(`u.rol = $${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM usuarios u ${where}`, params);
    params.push(limit, offset);
    const users = await pool.query(`
      SELECT
        u.id, u.nombre, u.email, u.rol, u.fecha_registro,
        (p.usuario_id IS NOT NULL) AS has_profile,
        COUNT(DISTINCT uo.objetivo_id)::int AS goals_count,
        COUNT(DISTINCT uc.condicion_id)::int AS conditions_count,
        COUNT(DISTINCT ur.restriccion_id)::int AS restrictions_count
      FROM usuarios u
      LEFT JOIN perfiles_usuario p ON p.usuario_id = u.id
      LEFT JOIN usuario_objetivos uo ON uo.usuario_id = u.id
      LEFT JOIN usuario_condiciones uc ON uc.usuario_id = u.id
      LEFT JOIN usuario_restricciones ur ON ur.usuario_id = u.id
      ${where}
      GROUP BY u.id, p.usuario_id
      ORDER BY u.fecha_registro DESC NULLS LAST, u.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const total = countResult.rows[0].total;
    return res.json({
      items: users.rows,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    console.error("Error listando usuarios administrativos:", error);
    return res.status(500).json({ error: "Error consultando usuarios" });
  }
};

const updateUserRole = async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  const role = req.body?.role;
  if (!Number.isInteger(userId) || !["usuario", "administrador"].includes(role)) {
    return res.status(400).json({ message: "Usuario o rol invalido" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query("SELECT id, nombre, email, rol FROM usuarios WHERE id = $1 FOR UPDATE", [userId]);
    const user = userResult.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (user.rol === "administrador" && role !== "administrador") {
      const admins = await client.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'administrador'");
      if (admins.rows[0].total <= 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "No puedes remover el rol del ultimo administrador" });
      }
    }
    const updated = await client.query(
      "UPDATE usuarios SET rol = $1 WHERE id = $2 RETURNING id, nombre, email, rol, fecha_registro",
      [role, userId]
    );
    await client.query("COMMIT");
    return res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error actualizando rol:", error);
    return res.status(500).json({ error: "Error actualizando el rol" });
  } finally {
    client.release();
  }
};

const catalogConfig = {
  goals: { table: "objetivos_nutricionales", condition: false },
  conditions: { table: "condiciones_clinicas", condition: true }
};

const getCatalogConfig = (value) => catalogConfig[value] || null;
const normalizeCatalogInput = (body, isCondition) => {
  const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() : "";
  if (!/^[a-z][a-z0-9_]{2,79}$/.test(code) || nombre.length < 2 || nombre.length > 120 || descripcion.length > 1200) return null;
  const normalized = { code, nombre, descripcion: descripcion || null, isActive: body.isActive !== false };
  if (isCondition) {
    if (!["low", "medium", "high"].includes(body.riskLevel)) return null;
    normalized.riskLevel = body.riskLevel;
    normalized.requiresGuidance = body.requiresProfessionalGuidance === true;
  }
  return normalized;
};

const listClinicalCatalogs = async (_req, res) => {
  try {
    const [goals, conditions] = await Promise.all([
      pool.query("SELECT id, code, nombre, descripcion, is_active FROM objetivos_nutricionales ORDER BY is_active DESC, nombre"),
      pool.query("SELECT id, code, nombre, descripcion, risk_level, requires_professional_guidance, is_active FROM condiciones_clinicas ORDER BY is_active DESC, risk_level DESC, nombre")
    ]);
    return res.json({ goals: goals.rows, conditions: conditions.rows });
  } catch (error) {
    console.error("Error consultando catalogos clinicos:", error);
    return res.status(500).json({ error: "Error consultando catalogos clinicos" });
  }
};

const createClinicalCatalogItem = async (req, res) => {
  const config = getCatalogConfig(req.params.catalog);
  const input = config && normalizeCatalogInput(req.body || {}, config.condition);
  if (!config || !input) return res.status(400).json({ message: "Catalogo o datos invalidos" });
  try {
    const query = config.condition
      ? `INSERT INTO ${config.table} (code, nombre, descripcion, risk_level, requires_professional_guidance, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`
      : `INSERT INTO ${config.table} (code, nombre, descripcion, is_active) VALUES ($1,$2,$3,$4) RETURNING *`;
    const values = config.condition
      ? [input.code, input.nombre, input.descripcion, input.riskLevel, input.requiresGuidance, input.isActive]
      : [input.code, input.nombre, input.descripcion, input.isActive];
    return res.status(201).json((await pool.query(query, values)).rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "El codigo ya existe" });
    console.error("Error creando elemento clinico:", error);
    return res.status(500).json({ error: "Error creando elemento clinico" });
  }
};

const updateClinicalCatalogItem = async (req, res) => {
  const config = getCatalogConfig(req.params.catalog);
  const id = Number.parseInt(req.params.id, 10);
  const input = config && normalizeCatalogInput(req.body || {}, config.condition);
  if (!config || !Number.isInteger(id) || !input) return res.status(400).json({ message: "Catalogo o datos invalidos" });
  try {
    const query = config.condition
      ? `UPDATE ${config.table} SET code=$1, nombre=$2, descripcion=$3, risk_level=$4, requires_professional_guidance=$5, is_active=$6 WHERE id=$7 RETURNING *`
      : `UPDATE ${config.table} SET code=$1, nombre=$2, descripcion=$3, is_active=$4 WHERE id=$5 RETURNING *`;
    const values = config.condition
      ? [input.code, input.nombre, input.descripcion, input.riskLevel, input.requiresGuidance, input.isActive, id]
      : [input.code, input.nombre, input.descripcion, input.isActive, id];
    const result = await pool.query(query, values);
    if (!result.rows[0]) return res.status(404).json({ message: "Elemento no encontrado" });
    return res.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "El codigo ya existe" });
    console.error("Error actualizando elemento clinico:", error);
    return res.status(500).json({ error: "Error actualizando elemento clinico" });
  }
};

const ruleOptions = {
  scopeTypes: ["global", "goal", "condition"],
  nutrients: ["calories", "protein_g", "carbs_g", "fat_g", "saturated_fat_g", "sugar_g", "fiber_g", "sodium_mg"],
  ruleTypes: ["min", "max", "range", "recommendation"],
  severities: ["info", "warning", "danger"]
};

const normalizeRuleInput = (body = {}) => {
  const scopeType = ruleOptions.scopeTypes.includes(body.scopeType) ? body.scopeType : null;
  const scopeCode = typeof body.scopeCode === "string" ? body.scopeCode.trim().toLowerCase() : "";
  const nutrient = ruleOptions.nutrients.includes(body.nutrient) ? body.nutrient : null;
  const ruleType = ruleOptions.ruleTypes.includes(body.ruleType) ? body.ruleType : null;
  const severity = ruleOptions.severities.includes(body.severity) ? body.severity : null;
  const unit = typeof body.unit === "string" ? body.unit.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const parseValue = (value) => value === "" || value === null || value === undefined ? null : Number(value);
  const minValue = parseValue(body.minValue);
  const maxValue = parseValue(body.maxValue);
  const numbersValid = [minValue, maxValue].every((value) => value === null || (Number.isFinite(value) && value >= 0));
  const boundsValid = ruleType === "min" ? minValue !== null
    : ruleType === "max" ? maxValue !== null
      : ruleType === "range" ? minValue !== null && maxValue !== null && minValue <= maxValue
        : true;
  if (!scopeType || !/^[a-z][a-z0-9_]{2,79}$/.test(scopeCode) || !nutrient || !ruleType || !severity ||
      !numbersValid || !boundsValid || unit.length < 1 || unit.length > 30 || message.length < 5 || message.length > 1200) return null;
  return { scopeType, scopeCode, nutrient, ruleType, minValue, maxValue, unit, severity, message, isActive: body.isActive !== false };
};

const validateRuleScope = async (input) => {
  if (input.scopeType === "global") return input.scopeCode === "default";
  const table = input.scopeType === "goal" ? "objetivos_nutricionales" : "condiciones_clinicas";
  const result = await pool.query(`SELECT 1 FROM ${table} WHERE code = $1`, [input.scopeCode]);
  return Boolean(result.rows[0]);
};

const listNutritionRules = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, Number.parseInt(req.query.limit, 10) || 20));
    const scopeType = ruleOptions.scopeTypes.includes(req.query.scopeType) ? req.query.scopeType : null;
    const active = req.query.active === "true" ? true : req.query.active === "false" ? false : null;
    const params = [];
    const filters = [];
    if (scopeType) { params.push(scopeType); filters.push(`scope_type = $${params.length}`); }
    if (active !== null) { params.push(active); filters.push(`is_active = $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const totalResult = await pool.query(`SELECT COUNT(*)::int AS total FROM reglas_nutricionales ${where}`, params);
    params.push(limit, (page - 1) * limit);
    const result = await pool.query(
      `SELECT id, scope_type, scope_code, nutrient, rule_type, min_value, max_value, unit, severity, message, is_active, created_at
       FROM reglas_nutricionales ${where}
       ORDER BY is_active DESC, scope_type, scope_code, nutrient, id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = totalResult.rows[0].total;
    return res.json({
      items: result.rows,
      options: ruleOptions,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    console.error("Error consultando reglas nutricionales:", error);
    return res.status(500).json({ error: "Error consultando reglas nutricionales" });
  }
};

const saveNutritionRule = async (req, res) => {
  const id = req.params.id ? Number.parseInt(req.params.id, 10) : null;
  const input = normalizeRuleInput(req.body);
  if (!input || (req.params.id && !Number.isInteger(id))) return res.status(400).json({ message: "Regla nutricional invalida" });
  try {
    if (!(await validateRuleScope(input))) return res.status(400).json({ message: "El alcance seleccionado no existe" });
    const values = [input.scopeType, input.scopeCode, input.nutrient, input.ruleType, input.minValue, input.maxValue, input.unit, input.severity, input.message, input.isActive];
    const result = id
      ? await pool.query(
        `UPDATE reglas_nutricionales SET scope_type=$1, scope_code=$2, nutrient=$3, rule_type=$4, min_value=$5, max_value=$6, unit=$7, severity=$8, message=$9, is_active=$10 WHERE id=$11 RETURNING *`,
        [...values, id]
      )
      : await pool.query(
        `INSERT INTO reglas_nutricionales (scope_type, scope_code, nutrient, rule_type, min_value, max_value, unit, severity, message, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        values
      );
    if (!result.rows[0]) return res.status(404).json({ message: "Regla no encontrada" });
    return res.status(id ? 200 : 201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Ya existe una regla equivalente" });
    console.error("Error guardando regla nutricional:", error);
    return res.status(500).json({ error: "Error guardando regla nutricional" });
  }
};

const normalizeRestrictionInput = (body = {}) => {
  const nombre = typeof body.nombre === "string" ? body.nombre.trim().toLowerCase() : "";
  const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() : "";
  if (nombre.length < 2 || nombre.length > 120 || descripcion.length > 1200) return null;
  return { nombre, descripcion: descripcion || null, isActive: body.isActive !== false };
};

const listRestrictionsAdmin = async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
    const params = search ? [`%${search}%`] : [];
    const where = search ? "WHERE nombre ILIKE $1 OR descripcion ILIKE $1" : "";
    const result = await pool.query(
      `SELECT r.id, r.nombre, r.descripcion, r.is_active,
         COUNT(DISTINCT ur.usuario_id)::int AS users_count,
         COUNT(DISTINCT ir.ingrediente_id)::int AS ingredients_count
       FROM restricciones r
       LEFT JOIN usuario_restricciones ur ON ur.restriccion_id = r.id
       LEFT JOIN ingrediente_restricciones ir ON ir.restriccion_id = r.id
       ${where}
       GROUP BY r.id
       ORDER BY r.is_active DESC, r.nombre`,
      params
    );
    return res.json({ items: result.rows });
  } catch (error) {
    console.error("Error consultando restricciones:", error);
    return res.status(500).json({ error: "Error consultando restricciones" });
  }
};

const saveRestrictionAdmin = async (req, res) => {
  const id = req.params.id ? Number.parseInt(req.params.id, 10) : null;
  const input = normalizeRestrictionInput(req.body);
  if (!input || (req.params.id && !Number.isInteger(id))) return res.status(400).json({ message: "Restriccion invalida" });
  try {
    const duplicate = await pool.query("SELECT id FROM restricciones WHERE LOWER(nombre) = LOWER($1) AND ($2::int IS NULL OR id <> $2)", [input.nombre, id]);
    if (duplicate.rows[0]) return res.status(409).json({ message: "Ya existe una restriccion con ese nombre" });
    const result = id
      ? await pool.query("UPDATE restricciones SET nombre=$1, descripcion=$2, is_active=$3 WHERE id=$4 RETURNING *", [input.nombre, input.descripcion, input.isActive, id])
      : await pool.query("INSERT INTO restricciones (nombre, descripcion, is_active) VALUES ($1,$2,$3) RETURNING *", [input.nombre, input.descripcion, input.isActive]);
    if (!result.rows[0]) return res.status(404).json({ message: "Restriccion no encontrada" });
    return res.status(id ? 200 : 201).json(result.rows[0]);
  } catch (error) {
    console.error("Error guardando restriccion:", error);
    return res.status(500).json({ error: "Error guardando restriccion" });
  }
};

const listVisionUsage = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, Number.parseInt(req.query.limit, 10) || 20));
    const status = ["pending", "succeeded", "failed"].includes(req.query.status) ? req.query.status : null;
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
    const params = [];
    const filters = [];
    if (status) { params.push(status); filters.push(`v.status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); filters.push(`(u.nombre ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const summaryParams = [...params];
    const summary = await pool.query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE v.status='succeeded')::int AS succeeded,
         COUNT(*) FILTER (WHERE v.status='failed')::int AS failed,
         COUNT(*) FILTER (WHERE v.status='pending')::int AS pending,
         COALESCE(SUM(v.total_tokens),0)::int AS total_tokens,
         COALESCE(SUM(CASE WHEN v.status='succeeded' THEN v.estimated_cost_usd WHEN v.status='pending' THEN v.reserved_cost_usd ELSE 0 END),0)::numeric AS committed_usd
       FROM vision_analysis_usage v JOIN usuarios u ON u.id=v.usuario_id ${where}`,
      summaryParams
    );
    params.push(limit, (page - 1) * limit);
    const result = await pool.query(
      `SELECT v.request_id, v.usuario_id, u.nombre AS user_name, u.email AS user_email, v.provider, v.model, v.status,
         v.input_tokens, v.output_tokens, v.total_tokens, v.reserved_cost_usd, v.estimated_cost_usd, v.error_code, v.created_at, v.completed_at
       FROM vision_analysis_usage v JOIN usuarios u ON u.id=v.usuario_id ${where}
       ORDER BY v.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const totals = summary.rows[0];
    const policy = getVisionUsagePolicy();
    return res.json({
      items: result.rows,
      summary: { ...totals, committed_usd: Number(totals.committed_usd) },
      policy,
      pagination: { page, limit, total: totals.total, totalPages: Math.max(1, Math.ceil(totals.total / limit)) }
    });
  } catch (error) {
    console.error("Error consultando uso de IA:", error);
    return res.status(500).json({ error: "Error consultando uso de IA" });
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
  listUsers,
  updateUserRole,
  listClinicalCatalogs,
  createClinicalCatalogItem,
  updateClinicalCatalogItem,
  listNutritionRules,
  saveNutritionRule,
  listRestrictionsAdmin,
  saveRestrictionAdmin,
  listVisionUsage,
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient
};
