const FDC_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const ALLOWED_DATA_TYPES = new Set(["Foundation", "SR Legacy"]);
const NUTRIENT_IDS = {
  calories_per_100g: 1008,
  protein_per_100g: 1003,
  carbs_per_100g: 1005,
  fat_per_100g: 1004,
  saturated_fat_per_100g: 1258,
  sugar_per_100g: 2000,
  fiber_per_100g: 1079,
  sodium_mg_per_100g: 1093
};

const fdcError = (code, message, status = 502, details = null) => Object.assign(new Error(message), { code, status, details });
const apiKey = () => {
  const value = process.env.USDA_FDC_API_KEY?.trim();
  if (!value) throw fdcError("FDC_NOT_CONFIGURED", "FoodData Central no esta configurado en el backend.", 503);
  return value;
};

const requestFdc = async (path, params = {}, fetchImpl = fetch) => {
  const url = new URL(`${FDC_BASE_URL}${path}`);
  url.search = new URLSearchParams({ api_key: apiKey(), ...params }).toString();
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  } catch (error) {
    throw fdcError("FDC_UNAVAILABLE", "FoodData Central no respondio a tiempo.", 502, error.message);
  }
  if (!response.ok) {
    const status = response.status === 429 ? 429 : 502;
    throw fdcError(response.status === 429 ? "FDC_RATE_LIMIT" : "FDC_UPSTREAM_ERROR", response.status === 429 ? "Se alcanzo temporalmente el limite de FoodData Central." : "FoodData Central rechazo la solicitud.", status);
  }
  return { data: await response.json(), rateLimit: { limit: response.headers.get("x-ratelimit-limit"), remaining: response.headers.get("x-ratelimit-remaining") } };
};

const nutritionFromFood = (food) => {
  const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : [];
  return Object.fromEntries(Object.entries(NUTRIENT_IDS).map(([field, nutrientId]) => {
    const nutrient = nutrients.find((item) => Number(item.nutrientId ?? item.nutrient?.id) === nutrientId);
    const raw = nutrient?.value ?? nutrient?.amount;
    const value = raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Number(raw);
    return [field, value];
  }));
};

const mapFoodCandidate = (food) => {
  const nutrition = nutritionFromFood(food);
  return {
    fdcId: Number(food.fdcId),
    description: food.description,
    dataType: food.dataType,
    foodCategory: typeof food.foodCategory === "string" ? food.foodCategory : food.foodCategory?.description || null,
    publishedDate: food.publishedDate || null,
    nutritionPer100g: nutrition,
    nutrientCoverage: Object.values(nutrition).filter((value) => value !== null).length
  };
};

const searchFdcFoods = async (query, fetchImpl = fetch) => {
  const normalized = typeof query === "string" ? query.trim().slice(0, 120) : "";
  if (normalized.length < 2) throw fdcError("INVALID_FDC_QUERY", "Escribe al menos dos caracteres para buscar.", 400);
  const { data, rateLimit } = await requestFdc("/foods/search", { query: normalized, pageSize: "10", dataType: "Foundation,SR Legacy" }, fetchImpl);
  const items = (Array.isArray(data.foods) ? data.foods : []).filter((food) => ALLOWED_DATA_TYPES.has(food.dataType)).map(mapFoodCandidate);
  return { items, total: Number(data.totalHits) || items.length, rateLimit };
};

const getFdcFood = async (fdcId, fetchImpl = fetch) => {
  const id = Number(fdcId);
  if (!Number.isSafeInteger(id) || id <= 0) throw fdcError("INVALID_FDC_ID", "El identificador FDC no es valido.", 400);
  const { data, rateLimit } = await requestFdc(`/food/${id}`, {}, fetchImpl);
  if (!ALLOWED_DATA_TYPES.has(data.dataType)) throw fdcError("UNSUPPORTED_FDC_TYPE", "Selecciona un alimento Foundation o SR Legacy.", 422);
  const candidate = mapFoodCandidate(data);
  const missing = Object.entries(candidate.nutritionPer100g).filter(([, value]) => value === null).map(([field]) => field);
  if (missing.length) throw fdcError("INCOMPLETE_FDC_PROFILE", "El alimento seleccionado no contiene los ocho nutrientes requeridos.", 422, { missing });
  return { ...candidate, rateLimit };
};

const updateIngredientFromFdc = async (pool, { ingredientId, fdcId, userId, fetchImpl = fetch }) => {
  const food = await getFdcFood(fdcId, fetchImpl);
  const nutrition = food.nutritionPer100g;
  const reference = `USDA FoodData Central FDC ${food.fdcId}: https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}`;
  const result = await pool.query(
    `UPDATE ingredientes SET fdc_id=$1, calories_per_100g=$2, protein_per_100g=$3,
       carbs_per_100g=$4, fat_per_100g=$5, saturated_fat_per_100g=$6,
       sugar_per_100g=$7, fiber_per_100g=$8, sodium_mg_per_100g=$9,
       nutrition_source='usda_fdc', nutrition_source_reference=$10,
       nutrition_reviewed_by=$11, nutrition_reviewed_at=CURRENT_TIMESTAMP
     WHERE id=$12 RETURNING *`,
    [food.fdcId, nutrition.calories_per_100g, nutrition.protein_per_100g,
      nutrition.carbs_per_100g, nutrition.fat_per_100g, nutrition.saturated_fat_per_100g,
      nutrition.sugar_per_100g, nutrition.fiber_per_100g, nutrition.sodium_mg_per_100g,
      reference, userId, ingredientId]
  );
  if (!result.rows[0]) throw fdcError("INGREDIENT_NOT_FOUND", "Ingrediente no encontrado.", 404);
  return { ingredient: result.rows[0], selectedFood: food };
};

module.exports = { getFdcFood, mapFoodCandidate, nutritionFromFood, searchFdcFoods, updateIngredientFromFdc };
