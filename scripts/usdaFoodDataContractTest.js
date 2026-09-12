const assert = require("node:assert/strict");
const { getFdcFood, searchFdcFoods, updateIngredientFromFdc } = require("../services/usdaFoodDataService");

process.env.USDA_FDC_API_KEY = "contract-key";
const nutrients = [
  [1008, 165], [1003, 31], [1005, 0], [1004, 3.6],
  [1258, 1], [2000, 0], [1079, 0], [1093, 74]
].map(([nutrientId, value]) => ({ nutrientId, value }));
const food = { fdcId: 12345, description: "Chicken breast, cooked", dataType: "Foundation", foodCategory: "Poultry", publishedDate: "2026-04-30", foodNutrients: nutrients };
const response = (data) => ({ ok: true, status: 200, headers: { get: (name) => name.includes("remaining") ? "998" : "1000" }, async json() { return data; } });

const run = async () => {
  const search = await searchFdcFoods("chicken", async (url) => {
    assert.equal(url.searchParams.get("dataType"), "Foundation,SR Legacy");
    return response({ totalHits: 1, foods: [food] });
  });
  assert.equal(search.items[0].nutrientCoverage, 8);
  assert.equal(search.items[0].nutritionPer100g.protein_per_100g, 31);
  assert.equal(search.rateLimit.remaining, "998");

  const details = await getFdcFood(12345, async () => response(food));
  assert.equal(details.nutritionPer100g.sodium_mg_per_100g, 74);
  await assert.rejects(() => getFdcFood(12345, async () => response({ ...food, foodNutrients: nutrients.slice(0, 7) })), { code: "INCOMPLETE_FDC_PROFILE" });

  const pool = {
    async query(sql, params) {
      assert.match(sql, /nutrition_source='usda_fdc'/);
      assert.equal(params[0], 12345);
      assert.equal(params[10], 7);
      assert.equal(params[11], 9);
      return { rows: [{ id: 9, nombre: "pollo", fdc_id: 12345, nutrition_source: "usda_fdc" }] };
    }
  };
  const applied = await updateIngredientFromFdc(pool, { ingredientId: 9, fdcId: 12345, userId: 7, fetchImpl: async () => response(food) });
  assert.equal(applied.ingredient.fdc_id, 12345);

  console.log(JSON.stringify({ ok: true, foundationAndLegacyOnly: true, eightNutrientsMapped: true, incompleteRejected: true, reviewerPersisted: true }, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
