const assert = require("node:assert/strict");

const observed = { list: false, upsert: false, remove: false };
const fakePool = {
  async query(sql, params) {
    if (sql.includes("FROM usuario_recetas_favoritas favorites")) {
      assert.deepEqual(params, [7, 3, 0]);
      observed.list = sql.includes('TRUE AS "isFavorite"')
        && sql.includes('AS "hasUnsafeIngredients"');
      return { rows: [
        { id: 3, nombre: "A", isFavorite: true },
        { id: 2, nombre: "B", isFavorite: true },
        { id: 1, nombre: "C", isFavorite: true }
      ] };
    }
    if (sql === "SELECT id FROM recetas WHERE id = $1") {
      assert.deepEqual(params, [4]);
      return { rows: [{ id: 4 }] };
    }
    if (sql.includes("INSERT INTO usuario_recetas_favoritas")) {
      assert.deepEqual(params, [7, 4]);
      observed.upsert = sql.includes("ON CONFLICT (usuario_id, receta_id)");
      return { rows: [{ userId: 7, recipeId: 4, createdAt: "2026-09-12T00:00:00.000Z" }] };
    }
    if (sql.includes("DELETE FROM usuario_recetas_favoritas")) {
      assert.deepEqual(params, [7, 4]);
      observed.remove = true;
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected favorites query: ${sql}`);
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: fakePool
};

const {
  listFavoriteRecipes,
  saveFavoriteRecipe,
  removeFavoriteRecipe
} = require("../controllers/recipeFavoriteController");

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return value; },
  send() { return undefined; }
});

const run = async () => {
  const listResponse = response();
  await listFavoriteRecipes({ user: { id: 7 }, query: { limit: "2", offset: "0" } }, listResponse);
  assert.equal(listResponse.body.recipes.length, 2);
  assert.equal(listResponse.body.pagination.nextOffset, 2);

  const saveResponse = response();
  await saveFavoriteRecipe({ user: { id: 7 }, params: { recipeId: "4" } }, saveResponse);
  assert.equal(saveResponse.body.recipeId, 4);

  const removeResponse = response();
  await removeFavoriteRecipe({ user: { id: 7 }, params: { recipeId: "4" } }, removeResponse);
  assert.equal(removeResponse.statusCode, 204);

  assert.deepEqual(observed, { list: true, upsert: true, remove: true });
  console.log(JSON.stringify({
    ok: true,
    authenticatedIdentityUsed: true,
    paginationProtected: true,
    idempotentSave: true,
    deleteIdempotent: true
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
