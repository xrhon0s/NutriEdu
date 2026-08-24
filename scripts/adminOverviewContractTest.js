const assert = require("node:assert/strict");

process.env.VISION_PROVIDER = "disabled";
process.env.VISION_MONTHLY_BUDGET_USD = "5";

const fakePool = {
  async query(sql) {
    if (sql.includes("AS users")) {
      return { rows: [{
        users: 10,
        profiles: 7,
        recipes: 36,
        ingredients: 24,
        restrictions: 12,
        active_goals: 8,
        active_conditions: 9,
        active_rules: 14,
        unread_notifications: 3
      }] };
    }
    if (sql.includes("AS analyses")) {
      return { rows: [{ analyses: 4, succeeded: 3, failed: 1, pending: 0, committed_usd: "0.0123" }] };
    }
    if (sql.includes("to_regclass")) return { rows: [{ migration_table: null }] };
    throw new Error(`Unexpected admin overview query: ${sql}`);
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: fakePool };
const { getOperationsOverview } = require("../controllers/adminController");

let responseStatus = 200;
let responseBody;
const response = {
  status(status) { responseStatus = status; return this; },
  json(body) { responseBody = body; return body; }
};

getOperationsOverview({}, response).then(() => {
  assert.equal(responseStatus, 200);
  assert.equal(responseBody.counts.profileCoveragePercent, 70);
  assert.equal(responseBody.vision.configured, false);
  assert.equal(responseBody.vision.committedUsd, 0.0123);
  assert.equal(responseBody.vision.monthlyBudgetUsd, 5);
  assert.ok(responseBody.migrations.some((migration) => migration.version === "007"));
  assert.ok(responseBody.migrations.every((migration) => migration.recorded === false));
  assert.equal("users" in responseBody, false, "The overview must not expose user rows");
  assert.equal(JSON.stringify(responseBody).includes("password"), false);
  assert.equal(JSON.stringify(responseBody).includes("token"), false);
  console.log(JSON.stringify({
    ok: true,
    profileCoveragePercent: responseBody.counts.profileCoveragePercent,
    migrationCount: responseBody.migrations.length,
    committedUsd: responseBody.vision.committedUsd,
    sensitiveFieldsExcluded: true
  }, null, 2));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
