const crypto = require("crypto");
const { EXTERNAL_KEY_PATTERN, NUTRIENT_FIELDS, NUTRITION_SOURCES } = require("./recipeCatalogTemplateService");

const RECIPE_NUTRIENTS = {
  calories: "calorias",
  proteinG: "protein_g",
  carbsG: "carbs_g",
  fatG: "fat_g",
  saturatedFatG: "saturated_fat_g",
  sugarG: "sugar_g",
  fiberG: "fiber_g",
  sodiumMg: "sodium_mg"
};

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const normalizedName = (value) => String(value || "").trim().toLocaleLowerCase("es");
const hashPayload = (payload) => crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const buildNutritionWorklist = (rows) => ({
  schemaVersion: "1.0",
  mode: "nutrition_patch",
  instructions: "Completa porcion, ocho nutrientes y una fuente verificable. Esta importacion no modifica los ingredientes de la receta.",
  recipes: rows.map((row) => ({
    externalKey: row.external_key || `legacy_recipe_${row.id}`,
    name: row.nombre,
    portion: { servingSizeG: numberOrNull(row.serving_size_g), servings: numberOrNull(row.servings) },
    nutritionPerServing: Object.fromEntries(
      Object.entries(RECIPE_NUTRIENTS).map(([target, source]) => [target, numberOrNull(row[source])])
    ),
    nutritionProvenance: {
      source: row.nutrition_source || "unknown",
      reference: row.nutrition_source_reference || null
    }
  }))
});

const validateNutritionPatch = (payload) => {
  const errors = [];
  const recipes = Array.isArray(payload?.recipes) ? payload.recipes : [];
  const add = (path, code, message) => errors.push({ path, code, message });
  if (payload?.schemaVersion !== "1.0") add("schemaVersion", "UNSUPPORTED_VERSION", "schemaVersion debe ser 1.0.");
  if (payload?.mode !== "nutrition_patch") add("mode", "INVALID_MODE", "mode debe ser nutrition_patch.");
  if (!recipes.length || recipes.length > 200) add("recipes", "INVALID_RECIPE_COUNT", "Incluye entre 1 y 200 recetas.");
  const keys = new Set();
  recipes.forEach((recipe, index) => {
    const path = `recipes[${index}]`;
    if (!EXTERNAL_KEY_PATTERN.test(recipe?.externalKey || "")) add(`${path}.externalKey`, "INVALID_EXTERNAL_KEY", "La clave externa no es valida.");
    if (keys.has(recipe?.externalKey)) add(`${path}.externalKey`, "DUPLICATE_EXTERNAL_KEY", "La clave externa esta repetida.");
    keys.add(recipe?.externalKey);
    if (typeof recipe?.name !== "string" || recipe.name.trim().length < 2 || recipe.name.trim().length > 160) add(`${path}.name`, "INVALID_NAME", "El nombre no es valido.");
    if (!Number.isFinite(recipe?.portion?.servingSizeG) || recipe.portion.servingSizeG <= 0) add(`${path}.portion.servingSizeG`, "INVALID_SERVING_SIZE", "El peso de la porcion debe ser positivo.");
    if (!Number.isFinite(recipe?.portion?.servings) || recipe.portion.servings <= 0) add(`${path}.portion.servings`, "INVALID_SERVINGS", "El numero de porciones debe ser positivo.");
    NUTRIENT_FIELDS.forEach((field) => {
      const value = recipe?.nutritionPerServing?.[field];
      if (!Number.isFinite(value) || value < 0 || (field === "calories" && value === 0)) add(`${path}.nutritionPerServing.${field}`, "INVALID_NUTRIENT", "Completa un valor numerico valido por porcion.");
    });
    const provenance = recipe?.nutritionProvenance;
    if (!NUTRITION_SOURCES.has(provenance?.source) || provenance.source === "unknown") add(`${path}.nutritionProvenance.source`, "UNVERIFIED_SOURCE", "Selecciona una fuente verificable distinta de unknown.");
    if (typeof provenance?.reference !== "string" || !provenance.reference.trim()) add(`${path}.nutritionProvenance.reference`, "MISSING_SOURCE_REFERENCE", "Agrega una referencia trazable.");
  });
  return { valid: errors.length === 0, errors, warnings: [], summary: { recipes: recipes.length } };
};

const resolveNutritionPatch = async (client, payload) => {
  const validation = validateNutritionPatch(payload);
  if (!validation.valid) return { ...validation, actions: [] };
  const keys = payload.recipes.map((recipe) => recipe.externalKey);
  const names = payload.recipes.map((recipe) => normalizedName(recipe.name));
  const existing = await client.query(
    `SELECT id, external_key, nombre FROM recetas
     WHERE external_key = ANY($1::text[]) OR LOWER(TRIM(nombre)) = ANY($2::text[])
     ORDER BY id`,
    [keys, names]
  );
  const errors = [];
  const actions = payload.recipes.map((recipe, index) => {
    const keyMatch = existing.rows.find((row) => row.external_key === recipe.externalKey);
    const nameMatches = existing.rows.filter((row) => normalizedName(row.nombre) === normalizedName(recipe.name));
    if (keyMatch && normalizedName(keyMatch.nombre) !== normalizedName(recipe.name)) {
      errors.push({ path: `recipes[${index}]`, code: "IDENTITY_CONFLICT", message: "La clave externa pertenece a otra receta." });
      return null;
    }
    if (!keyMatch && nameMatches.length !== 1) {
      errors.push({ path: `recipes[${index}]`, code: nameMatches.length ? "AMBIGUOUS_NAME" : "RECIPE_NOT_FOUND", message: "No se encontro una receta existente con identidad unica." });
      return null;
    }
    const match = keyMatch || nameMatches[0];
    if (match.external_key && match.external_key !== recipe.externalKey) {
      errors.push({ path: `recipes[${index}].externalKey`, code: "EXTERNAL_KEY_CONFLICT", message: "La receta ya utiliza otra clave externa." });
      return null;
    }
    return { index, existingId: Number(match.id), externalKey: recipe.externalKey, claimKey: !match.external_key };
  }).filter(Boolean);
  return { valid: errors.length === 0, errors, warnings: [], summary: { recipes: payload.recipes.length, recipesToUpdate: actions.length }, actions };
};

const getNutritionWorklist = async (pool, limit = 200) => {
  const boundedLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 200));
  const result = await pool.query(
    `SELECT r.id, r.external_key, r.nombre, r.serving_size_g, r.servings, r.calorias,
       r.protein_g, r.carbs_g, r.fat_g, r.saturated_fat_g, r.sugar_g, r.fiber_g, r.sodium_mg,
       r.nutrition_source, r.nutrition_source_reference
     FROM recetas r
     WHERE r.calorias IS NULL OR r.protein_g IS NULL OR r.carbs_g IS NULL OR r.fat_g IS NULL
        OR r.saturated_fat_g IS NULL OR r.sugar_g IS NULL OR r.fiber_g IS NULL OR r.sodium_mg IS NULL
        OR r.serving_size_g IS NULL OR r.nutrition_source = 'unknown' OR r.nutrition_reviewed_at IS NULL
     ORDER BY r.id
     LIMIT $1`,
    [boundedLimit]
  );
  return buildNutritionWorklist(result.rows);
};

const importNutritionPatch = async (pool, payload, userId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nutriedu_recipe_catalog_import'))");
    const preview = await resolveNutritionPatch(client, payload);
    if (!preview.valid) {
      await client.query("ROLLBACK");
      return { imported: false, ...preview };
    }
    for (const action of preview.actions) {
      const recipe = payload.recipes[action.index];
      const nutrition = recipe.nutritionPerServing;
      const provenance = recipe.nutritionProvenance;
      await client.query(
        `UPDATE recetas SET external_key=$1, serving_size_g=$2, servings=$3, calorias=$4,
         protein_g=$5, carbs_g=$6, fat_g=$7, saturated_fat_g=$8, sugar_g=$9,
         fiber_g=$10, sodium_mg=$11, nutrition_source=$12::varchar,
         nutrition_source_reference=$13, nutrition_reviewed_by=$14, nutrition_reviewed_at=CURRENT_TIMESTAMP
         WHERE id=$15`,
        [recipe.externalKey, recipe.portion.servingSizeG, recipe.portion.servings,
          nutrition.calories, nutrition.proteinG, nutrition.carbsG, nutrition.fatG,
          nutrition.saturatedFatG, nutrition.sugarG, nutrition.fiberG, nutrition.sodiumMg,
          provenance.source, provenance.reference.trim(), userId, action.existingId]
      );
    }
    const audit = await client.query(
      `INSERT INTO recipe_catalog_imports (imported_by, schema_version, payload_sha256, recipes_updated, report)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [userId, "nutrition-patch-1.0", hashPayload(payload), preview.actions.length,
        JSON.stringify({ mode: "nutrition_patch", summary: preview.summary })]
    );
    await client.query("COMMIT");
    return { imported: true, importId: Number(audit.rows[0].id), importedAt: audit.rows[0].created_at, counts: { recipesUpdated: preview.actions.length } };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { buildNutritionWorklist, getNutritionWorklist, importNutritionPatch, resolveNutritionPatch, validateNutritionPatch };
