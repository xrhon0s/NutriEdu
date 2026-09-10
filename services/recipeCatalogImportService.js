const crypto = require("crypto");
const {
  EXTERNAL_KEY_PATTERN,
  NUTRIENT_FIELDS,
  NUTRITION_SOURCES,
  validateRecipeTemplate
} = require("./recipeCatalogTemplateService");
const { FOOD_GROUP_SET, SUBSTITUTION_GROUP_SET } = require("./ingredientTaxonomy");
const MAX_RECIPES = 200;
const MAX_INGREDIENTS = 500;

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
const INGREDIENT_NUTRIENTS = {
  calories: "calories_per_100g",
  proteinG: "protein_per_100g",
  carbsG: "carbs_per_100g",
  fatG: "fat_per_100g",
  saturatedFatG: "saturated_fat_per_100g",
  sugarG: "sugar_per_100g",
  fiberG: "fiber_per_100g",
  sodiumMg: "sodium_mg_per_100g"
};

const normalizedName = (value) => String(value || "").trim().toLocaleLowerCase("es");
const finiteOrNull = (value) => value === null || value === undefined || value === "" ? null : Number(value);
const hashPayload = (payload) => crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const validateIngredientDefinition = (ingredient, index) => {
  const errors = [];
  const warnings = [];
  const path = `ingredients[${index}]`;
  const error = (field, code, message) => errors.push({ path: `${path}.${field}`, code, message });
  const warning = (field, code, message) => warnings.push({ path: `${path}.${field}`, code, message });

  if (!ingredient || typeof ingredient !== "object" || Array.isArray(ingredient)) {
    return { errors: [{ path, code: "INVALID_INGREDIENT", message: "El ingrediente debe ser un objeto." }], warnings };
  }
  if (!EXTERNAL_KEY_PATTERN.test(ingredient.externalKey || "")) error("externalKey", "INVALID_EXTERNAL_KEY", "La clave externa no es valida.");
  if (typeof ingredient.name !== "string" || ingredient.name.trim().length < 2 || ingredient.name.trim().length > 160) error("name", "INVALID_NAME", "El nombre debe tener entre 2 y 160 caracteres.");
  if (!FOOD_GROUP_SET.has(ingredient.foodGroup)) error("foodGroup", "INVALID_FOOD_GROUP", "El grupo alimentario no pertenece al catalogo permitido.");
  if (ingredient.substitutionGroup === undefined) warning("substitutionGroup", "MISSING_SUBSTITUTION_GROUP", "Sin grupo de sustitución no se sugerirán alternativas.");
  else if (!SUBSTITUTION_GROUP_SET.has(ingredient.substitutionGroup)) error("substitutionGroup", "INVALID_SUBSTITUTION_GROUP", "El grupo de sustitución no pertenece al catálogo permitido.");
  if (ingredient.fdcId !== null && ingredient.fdcId !== undefined && (!Number.isSafeInteger(ingredient.fdcId) || ingredient.fdcId <= 0)) error("fdcId", "INVALID_FDC_ID", "fdcId debe ser un entero positivo.");

  const nutrition = ingredient.nutritionPer100g;
  if (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition)) {
    warning("nutritionPer100g", "MISSING_NUTRITION", "Sin nutrientes por 100 g no se podran recalcular recetas.");
  } else {
    NUTRIENT_FIELDS.forEach((field) => {
      const value = nutrition[field];
      if (value === null || value === undefined || value === "") warning(`nutritionPer100g.${field}`, "MISSING_NUTRIENT", "Dato nutricional pendiente.");
      else if (typeof value !== "number" || !Number.isFinite(value) || value < 0) error(`nutritionPer100g.${field}`, "INVALID_NUTRIENT", "El valor debe ser numerico y no negativo.");
    });
  }

  const provenance = ingredient.nutritionProvenance;
  if (!provenance || !NUTRITION_SOURCES.has(provenance.source)) error("nutritionProvenance.source", "INVALID_NUTRITION_SOURCE", "La fuente nutricional no es valida.");
  else if (provenance.source !== "unknown" && (typeof provenance.reference !== "string" || !provenance.reference.trim())) error("nutritionProvenance.reference", "MISSING_SOURCE_REFERENCE", "La fuente necesita una referencia trazable.");
  return { errors, warnings };
};

const validateRecipeCatalog = (payload) => {
  const errors = [];
  const warnings = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: [{ path: "$", code: "INVALID_CATALOG", message: "El catalogo debe ser un objeto JSON." }], warnings, summary: null };
  }
  if (payload.schemaVersion !== "1.0") errors.push({ path: "schemaVersion", code: "UNSUPPORTED_VERSION", message: "schemaVersion debe ser 1.0." });
  if (!Array.isArray(payload.recipes) || payload.recipes.length === 0 || payload.recipes.length > MAX_RECIPES) errors.push({ path: "recipes", code: "INVALID_RECIPE_COUNT", message: `Incluye entre 1 y ${MAX_RECIPES} recetas.` });
  if (!Array.isArray(payload.ingredients) || payload.ingredients.length > MAX_INGREDIENTS) errors.push({ path: "ingredients", code: "INVALID_INGREDIENT_COUNT", message: `Incluye entre 0 y ${MAX_INGREDIENTS} definiciones de ingredientes.` });

  const ingredients = Array.isArray(payload.ingredients) ? payload.ingredients : [];
  const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
  const ingredientKeys = new Set();
  const ingredientNames = new Map();
  ingredients.forEach((ingredient, index) => {
    const result = validateIngredientDefinition(ingredient, index);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (ingredientKeys.has(ingredient?.externalKey)) errors.push({ path: `ingredients[${index}].externalKey`, code: "DUPLICATE_EXTERNAL_KEY", message: "La clave externa esta repetida en el catalogo." });
    ingredientKeys.add(ingredient?.externalKey);
    const name = normalizedName(ingredient?.name);
    if (name && ingredientNames.has(name) && ingredientNames.get(name) !== ingredient?.externalKey) errors.push({ path: `ingredients[${index}].name`, code: "DUPLICATE_NAME", message: "El nombre esta asociado con otra clave externa del mismo catalogo." });
    if (name) ingredientNames.set(name, ingredient?.externalKey);
  });

  const recipeKeys = new Set();
  const recipeNames = new Map();
  const referenceKeys = new Map();
  const referenceNames = new Map();
  let recommendationReadyRecipes = 0;
  recipes.forEach((recipe, index) => {
    const result = validateRecipeTemplate(recipe);
    if (result.summary?.recommendationReady) recommendationReadyRecipes += 1;
    errors.push(...result.errors.map((item) => ({ ...item, path: `recipes[${index}].${item.path}` })));
    warnings.push(...result.warnings.map((item) => ({ ...item, path: `recipes[${index}].${item.path}` })));
    if (recipeKeys.has(recipe?.externalKey)) errors.push({ path: `recipes[${index}].externalKey`, code: "DUPLICATE_EXTERNAL_KEY", message: "La clave externa esta repetida en el catalogo." });
    recipeKeys.add(recipe?.externalKey);
    const name = normalizedName(recipe?.name);
    if (name && recipeNames.has(name) && recipeNames.get(name) !== recipe?.externalKey) errors.push({ path: `recipes[${index}].name`, code: "DUPLICATE_NAME", message: "El nombre esta asociado con otra clave externa del mismo catalogo." });
    if (name) recipeNames.set(name, recipe?.externalKey);
    if (Array.isArray(recipe?.ingredients)) {
      recipe.ingredients.forEach((reference, ingredientIndex) => {
        const referenceName = normalizedName(reference.name);
        if (referenceKeys.has(reference.externalKey) && referenceKeys.get(reference.externalKey) !== referenceName) {
          errors.push({ path: `recipes[${index}].ingredients[${ingredientIndex}]`, code: "INGREDIENT_KEY_MISMATCH", message: "La misma clave de ingrediente usa nombres diferentes." });
        }
        if (referenceName && referenceNames.has(referenceName) && referenceNames.get(referenceName) !== reference.externalKey) {
          errors.push({ path: `recipes[${index}].ingredients[${ingredientIndex}]`, code: "INGREDIENT_NAME_KEY_MISMATCH", message: "El mismo nombre de ingrediente usa claves diferentes." });
        }
        referenceKeys.set(reference.externalKey, referenceName);
        if (referenceName) referenceNames.set(referenceName, reference.externalKey);
        const definition = ingredients.find((ingredient) => ingredient.externalKey === reference.externalKey);
        if (definition && normalizedName(definition.name) !== normalizedName(reference.name)) {
          errors.push({
            path: `recipes[${index}].ingredients[${ingredientIndex}].name`,
            code: "INGREDIENT_NAME_MISMATCH",
            message: "El nombre no coincide con la definicion que usa esa clave externa."
          });
        }
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: { recipes: recipes.length, ingredientDefinitions: ingredients.length, recommendationReadyRecipes }
  };
};

const loadExisting = async (client, table, items) => {
  const keys = [...new Set(items.map((item) => item.externalKey).filter(Boolean))];
  const names = [...new Set(items.map((item) => normalizedName(item.name)).filter(Boolean))];
  if (!keys.length && !names.length) return [];
  const result = await client.query(
    `SELECT id, external_key, nombre FROM ${table}
     WHERE external_key = ANY($1::text[]) OR LOWER(TRIM(nombre)) = ANY($2::text[])
     ORDER BY id`,
    [keys, names]
  );
  return result.rows;
};

const resolveActions = (items, existingRows, entity) => {
  const actions = [];
  const errors = [];
  items.forEach((item, index) => {
    const keyMatch = existingRows.find((row) => row.external_key === item.externalKey);
    if (keyMatch) {
      const nameCollision = existingRows.find((row) => row.id !== keyMatch.id && normalizedName(row.nombre) === normalizedName(item.name));
      if (nameCollision) {
        errors.push({ path: `${entity}[${index}].name`, code: "EXISTING_NAME_CONFLICT", message: "Otro registro existente ya utiliza ese nombre." });
        return;
      }
      actions.push({ entity, index, externalKey: item.externalKey, name: item.name, action: "update", existingId: Number(keyMatch.id) });
      return;
    }
    const nameMatches = existingRows.filter((row) => normalizedName(row.nombre) === normalizedName(item.name));
    if (nameMatches.length > 1) {
      errors.push({ path: `${entity}[${index}].name`, code: "AMBIGUOUS_EXISTING_NAME", message: "Existen varios registros con ese nombre; asigna la clave manualmente antes de importar." });
      return;
    }
    if (nameMatches.length === 1 && nameMatches[0].external_key && nameMatches[0].external_key !== item.externalKey) {
      errors.push({ path: `${entity}[${index}].externalKey`, code: "EXTERNAL_KEY_CONFLICT", message: "El nombre ya pertenece a otra clave externa." });
      return;
    }
    actions.push({ entity, index, externalKey: item.externalKey, name: item.name, action: nameMatches.length ? "claim_and_update" : "create", existingId: nameMatches.length ? Number(nameMatches[0].id) : null });
  });
  return { actions, errors };
};

const buildRecipeCatalogPreview = async (client, payload) => {
  const validation = validateRecipeCatalog(payload);
  const emptyActions = { recipes: [], ingredients: [], referenceClaims: [] };
  if (!validation.valid) return { ...validation, actions: emptyActions };

  const recipeIngredientRefs = payload.recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ({ externalKey: ingredient.externalKey, name: ingredient.name })));
  const ingredientCandidates = [...payload.ingredients];
  recipeIngredientRefs.forEach((reference) => {
    if (!ingredientCandidates.some((ingredient) => ingredient.externalKey === reference.externalKey)) ingredientCandidates.push(reference);
  });
  const [existingRecipes, existingIngredients] = await Promise.all([
    loadExisting(client, "recetas", payload.recipes),
    loadExisting(client, "ingredientes", ingredientCandidates)
  ]);
  const recipeResolution = resolveActions(payload.recipes, existingRecipes, "recipes");
  const ingredientResolution = resolveActions(payload.ingredients, existingIngredients, "ingredients");
  const errors = [...validation.errors, ...recipeResolution.errors, ...ingredientResolution.errors];
  const referenceClaims = [];

  recipeIngredientRefs.forEach((reference) => {
    const defined = payload.ingredients.some((ingredient) => ingredient.externalKey === reference.externalKey);
    if (defined) return;
    const keyMatch = existingIngredients.find((row) => row.external_key === reference.externalKey);
    if (keyMatch) {
      if (normalizedName(keyMatch.nombre) !== normalizedName(reference.name)) errors.push({ path: `ingredient:${reference.externalKey}`, code: "INGREDIENT_NAME_MISMATCH", message: "La clave existente pertenece a otro nombre de ingrediente." });
      return;
    }
    const nameMatches = existingIngredients.filter((row) => normalizedName(row.nombre) === normalizedName(reference.name));
    if (nameMatches.length > 1) errors.push({ path: `ingredient:${reference.externalKey}`, code: "AMBIGUOUS_EXISTING_NAME", message: "Existen varios ingredientes con ese nombre." });
    else if (nameMatches.length === 1 && nameMatches[0].external_key && nameMatches[0].external_key !== reference.externalKey) errors.push({ path: `ingredient:${reference.externalKey}`, code: "EXTERNAL_KEY_CONFLICT", message: "El nombre ya pertenece a otra clave externa." });
    else if (nameMatches.length === 1 && !referenceClaims.some((claim) => claim.externalKey === reference.externalKey)) referenceClaims.push({ externalKey: reference.externalKey, existingId: Number(nameMatches[0].id), name: reference.name });
    else errors.push({ path: `ingredient:${reference.externalKey}`, code: "INGREDIENT_DEFINITION_REQUIRED", message: "El ingrediente no existe y necesita una definicion en ingredients." });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings: validation.warnings,
    summary: {
      ...validation.summary,
      recipesToCreate: recipeResolution.actions.filter((item) => item.action === "create").length,
      recipesToUpdate: recipeResolution.actions.filter((item) => item.action !== "create").length,
      ingredientsToCreate: ingredientResolution.actions.filter((item) => item.action === "create").length,
      ingredientsToUpdate: ingredientResolution.actions.filter((item) => item.action !== "create").length
    },
    actions: { recipes: recipeResolution.actions, ingredients: ingredientResolution.actions, referenceClaims }
  };
};

const upsertIngredient = async (client, ingredient, action, userId) => {
  const nutrition = ingredient.nutritionPer100g || {};
  const provenance = ingredient.nutritionProvenance;
  const values = [
    ingredient.externalKey, ingredient.name.trim(), ingredient.foodGroup,
    ingredient.substitutionGroup || "other", ingredient.fdcId || null,
    ...Object.keys(INGREDIENT_NUTRIENTS).map((key) => finiteOrNull(nutrition[key])),
    provenance.source, provenance.reference?.trim() || null, userId
  ];
  if (action.existingId) {
    await client.query(
      `UPDATE ingredientes SET external_key=$1, nombre=$2, food_group=$3, substitution_group=$4, fdc_id=$5,
       calories_per_100g=$6, protein_per_100g=$7, carbs_per_100g=$8, fat_per_100g=$9,
       saturated_fat_per_100g=$10, sugar_per_100g=$11, fiber_per_100g=$12,
       sodium_mg_per_100g=$13, nutrition_source=$14::varchar, nutrition_source_reference=$15,
       nutrition_reviewed_by=CASE WHEN $14::varchar='unknown'::varchar THEN NULL ELSE $16::integer END,
       nutrition_reviewed_at=CASE WHEN $14::varchar='unknown'::varchar THEN NULL ELSE CURRENT_TIMESTAMP END
       WHERE id=$17`,
      [...values, action.existingId]
    );
    return action.existingId;
  }
  const result = await client.query(
    `INSERT INTO ingredientes (
       external_key, nombre, food_group, substitution_group, fdc_id, calories_per_100g, protein_per_100g,
       carbs_per_100g, fat_per_100g, saturated_fat_per_100g, sugar_per_100g,
       fiber_per_100g, sodium_mg_per_100g, nutrition_source, nutrition_source_reference,
       nutrition_reviewed_by, nutrition_reviewed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::varchar,$15,
       CASE WHEN $14::varchar='unknown'::varchar THEN NULL ELSE $16::integer END,
       CASE WHEN $14::varchar='unknown'::varchar THEN NULL ELSE CURRENT_TIMESTAMP END)
     RETURNING id`,
    values
  );
  return Number(result.rows[0].id);
};

const upsertRecipe = async (client, recipe, action, userId) => {
  const nutrition = recipe.nutritionPerServing;
  const provenance = recipe.nutritionProvenance;
  const values = [
    recipe.externalKey, recipe.name.trim(), recipe.description.trim(),
    ...Object.keys(RECIPE_NUTRIENTS).map((key) => finiteOrNull(nutrition[key])),
    recipe.preparationMinutes, recipe.healthLevel, recipe.portion.servingSizeG,
    recipe.portion.servings, provenance.source, provenance.reference?.trim() || null, userId
  ];
  if (action.existingId) {
    await client.query(
      `UPDATE recetas SET external_key=$1, nombre=$2, descripcion=$3, calorias=$4,
       protein_g=$5, carbs_g=$6, fat_g=$7, saturated_fat_g=$8, sugar_g=$9,
       fiber_g=$10, sodium_mg=$11, tiempo_preparacion=$12, nivel_salud=$13,
       serving_size_g=$14, servings=$15, nutrition_source=$16::varchar,
       nutrition_source_reference=$17,
       nutrition_reviewed_by=CASE WHEN $16::varchar='unknown'::varchar THEN NULL ELSE $18::integer END,
       nutrition_reviewed_at=CASE WHEN $16::varchar='unknown'::varchar THEN NULL ELSE CURRENT_TIMESTAMP END
       WHERE id=$19`,
      [...values, action.existingId]
    );
    return action.existingId;
  }
  const result = await client.query(
    `INSERT INTO recetas (
       external_key, nombre, descripcion, calorias, protein_g, carbs_g, fat_g,
       saturated_fat_g, sugar_g, fiber_g, sodium_mg, tiempo_preparacion,
       nivel_salud, serving_size_g, servings, nutrition_source,
       nutrition_source_reference, nutrition_reviewed_by, nutrition_reviewed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::varchar,$17,
       CASE WHEN $16::varchar='unknown'::varchar THEN NULL ELSE $18::integer END,
       CASE WHEN $16::varchar='unknown'::varchar THEN NULL ELSE CURRENT_TIMESTAMP END)
     RETURNING id`,
    values
  );
  return Number(result.rows[0].id);
};

const importRecipeCatalog = async (pool, payload, userId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nutriedu_recipe_catalog_import'))");
    const preview = await buildRecipeCatalogPreview(client, payload);
    if (!preview.valid) {
      await client.query("ROLLBACK");
      return { imported: false, ...preview };
    }

    const ingredientIds = new Map();
    for (const action of preview.actions.ingredients) {
      const ingredient = payload.ingredients[action.index];
      ingredientIds.set(ingredient.externalKey, await upsertIngredient(client, ingredient, action, userId));
    }
    for (const claim of preview.actions.referenceClaims) {
      await client.query("UPDATE ingredientes SET external_key=$1 WHERE id=$2", [claim.externalKey, claim.existingId]);
      ingredientIds.set(claim.externalKey, claim.existingId);
    }
    const unresolvedRefs = payload.recipes.flatMap((recipe) => recipe.ingredients)
      .filter((reference) => !ingredientIds.has(reference.externalKey));
    if (unresolvedRefs.length) {
      const existing = await loadExisting(client, "ingredientes", unresolvedRefs);
      unresolvedRefs.forEach((reference) => {
        const row = existing.find((item) => item.external_key === reference.externalKey || normalizedName(item.nombre) === normalizedName(reference.name));
        if (row) ingredientIds.set(reference.externalKey, Number(row.id));
      });
    }

    for (const action of preview.actions.recipes) {
      const recipe = payload.recipes[action.index];
      const recipeId = await upsertRecipe(client, recipe, action, userId);
      await client.query("DELETE FROM receta_ingredientes WHERE receta_id=$1", [recipeId]);
      for (const ingredient of recipe.ingredients) {
        await client.query(
          `INSERT INTO receta_ingredientes (receta_id, ingrediente_id, amount, unit, amount_g)
           VALUES ($1,$2,$3,$4,$5)`,
          [recipeId, ingredientIds.get(ingredient.externalKey), ingredient.amount, ingredient.unit.trim(), ingredient.amountG]
        );
      }
    }

    const counts = {
      recipesCreated: preview.summary.recipesToCreate,
      recipesUpdated: preview.summary.recipesToUpdate,
      ingredientsCreated: preview.summary.ingredientsToCreate,
      ingredientsUpdated: preview.summary.ingredientsToUpdate
    };
    const audit = await client.query(
      `INSERT INTO recipe_catalog_imports (
         imported_by, schema_version, payload_sha256, recipes_created,
         recipes_updated, ingredients_created, ingredients_updated, report
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
      [userId, payload.schemaVersion, hashPayload(payload), counts.recipesCreated,
        counts.recipesUpdated, counts.ingredientsCreated, counts.ingredientsUpdated,
        JSON.stringify({ summary: preview.summary, warnings: preview.warnings })]
    );
    await client.query("COMMIT");
    return { imported: true, importId: Number(audit.rows[0].id), importedAt: audit.rows[0].created_at, counts, warnings: preview.warnings };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  buildRecipeCatalogPreview,
  importRecipeCatalog,
  validateRecipeCatalog
};
