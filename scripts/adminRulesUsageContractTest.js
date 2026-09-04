const assert = require("node:assert/strict");

const fakePool = {
  async query(sql) {
    if (sql.includes("COUNT(*)::int AS total FROM reglas_nutricionales")) return { rows: [{ total: 1 }] };
    if (sql.includes("FROM reglas_nutricionales") && sql.includes("LIMIT")) return { rows: [{ id: 1, scope_type: "global", scope_code: "default", nutrient: "fiber_g", is_active: true }] };
    if (sql.includes("COUNT(DISTINCT ur.usuario_id)")) return { rows: [{ id: 1, nombre: "gluten", is_active: true, users_count: 2, ingredients_count: 4 }] };
    if (sql.includes("COUNT(*)::int AS total") && sql.includes("FROM vision_analysis_usage")) return { rows: [{ total: 1, succeeded: 1, failed: 0, pending: 0, total_tokens: 120, committed_usd: "0.0025" }] };
    if (sql.includes("v.request_id") && sql.includes("FROM vision_analysis_usage")) return { rows: [{ request_id: "00000000-0000-0000-0000-000000000001", status: "succeeded", total_tokens: 120 }] };
    throw new Error(`Unexpected admin phase 2 query: ${sql}`);
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: fakePool };
const { listNutritionRules, listRestrictionsAdmin, listVisionUsage, saveNutritionRule, saveRestrictionAdmin } = require("../controllers/adminController");

const invoke = async (handler, request) => {
  let status = 200;
  let body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; return value; } };
  await handler(request, response);
  return { status, body };
};

const run = async () => {
  const rules = await invoke(listNutritionRules, { query: { page: "1", limit: "20" } });
  assert.equal(rules.status, 200);
  assert.equal(rules.body.pagination.total, 1);
  assert.ok(rules.body.options.nutrients.includes("sodium_mg"));

  const restrictions = await invoke(listRestrictionsAdmin, { query: {} });
  assert.equal(restrictions.body.items[0].users_count, 2);

  const usage = await invoke(listVisionUsage, { query: { status: "succeeded" } });
  assert.equal(usage.body.summary.committed_usd, 0.0025);
  assert.equal(usage.body.items[0].total_tokens, 120);

  const invalidRule = await invoke(saveNutritionRule, { params: {}, body: { scopeType: "system" } });
  assert.equal(invalidRule.status, 400);
  const invalidRestriction = await invoke(saveRestrictionAdmin, { params: {}, body: { nombre: "x" } });
  assert.equal(invalidRestriction.status, 400);

  console.log(JSON.stringify({ ok: true, rulesPagination: true, ruleAllowlist: true, restrictionMetrics: true, usageAudit: true, invalidInputsRejected: true }, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
