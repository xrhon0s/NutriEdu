require("dotenv").config();

const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const pool = require("../database/db");

const apiUrl = process.env.SMOKE_API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `recommendation-smoke-${runId}@example.test`;
const password = `Smoke-${runId}-Aa1`;
let userId;

const request = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  } catch (error) {
    throw new Error(
      `No se pudo conectar con la API en ${apiUrl}. Inicia el backend con "npm run dev" en otra terminal.`,
      { cause: error }
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
};

const assertDatabaseAvailable = async () => {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    const target = process.env.DATABASE_URL
      ? "DATABASE_URL"
      : `${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}`;
    throw new Error(
      `No se pudo conectar con PostgreSQL usando ${target}. Verifica que la base esté encendida y que el archivo .env sea correcto.`,
      { cause: error }
    );
  }
};

const run = async () => {
  await assertDatabaseAvailable();
  const passwordHash = await bcrypt.hash(password, 10);
  const userResult = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ["Recommendation Architecture Smoke", email, passwordHash]
  );
  userId = userResult.rows[0].id;

  const login = await request("/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  const headers = { Authorization: `Bearer ${login.token}` };

  await request("/profile", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      fecha_nacimiento: "1996-01-15",
      sexo: "male",
      estatura_cm: 178,
      peso_kg: 78,
      nivel_actividad: "moderate",
      condicion_fisica: "active",
      habitos_alimentarios: { meals_per_day: 3 },
      preferencias_alimentarias: { diet_style: "omnivore", cooking_time: "short" },
      notas: "Perfil temporal para smoke test de arquitectura"
    })
  });

  await request("/profile/goals", {
    method: "PUT",
    headers,
    body: JSON.stringify({ goals: ["gain_muscle"] })
  });

  await request("/profile/targets", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      calories_min: 2100,
      calories_max: 2400,
      protein_min_g: 90,
      calculation_source: "manual"
    })
  });

  const profile = await request("/profile", { headers });
  const result = await request("/recipes/recommendations?limit=6&offset=0", { headers });

  assert.equal(profile.goals[0].code, "gain_muscle");
  assert.equal(result.profileContext.recommendationStrategy.code, "gain_muscle");
  assert.ok(Array.isArray(result.recipes));
  assert.ok(result.recipes.length > 0, "The catalog should provide at least one eligible recipe");
  assert.equal(result.pagination.limit, 6);
  assert.equal(result.pagination.offset, 0);
  result.recipes.forEach((recipe) => {
    assert.equal(recipe.recommendation.strategy.code, "gain_muscle");
    assert.ok(recipe.recommendation.score >= 0 && recipe.recommendation.score <= 100);
    assert.ok(["suitable", "suitable_with_adjustments", "review_required"].includes(recipe.recommendation.status));
  });
  for (let index = 1; index < result.recipes.length; index += 1) {
    assert.ok(
      result.recipes[index - 1].recommendation.score >= result.recipes[index].recommendation.score,
      "Recommendations should be ordered by descending score"
    );
  }

  console.log(JSON.stringify({
    ok: true,
    authenticatedLogin: true,
    profilePersisted: true,
    goalPersisted: true,
    targetPersisted: true,
    recommendationCount: result.recipes.length,
    totalEligibleRecipes: result.pagination.total,
    strategy: result.profileContext.recommendationStrategy.code,
    deterministicOrder: true,
    explainableResponse: result.recipes.every((recipe) => Array.isArray(recipe.recommendation.reasons))
  }, null, 2));
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (userId) {
      await pool.query("DELETE FROM usuarios WHERE id = $1", [userId]).catch((error) => {
        console.error("Could not remove recommendation smoke user", error);
        process.exitCode = 1;
      });
    }
    await pool.end();
  });
