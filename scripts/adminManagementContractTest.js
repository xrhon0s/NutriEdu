const assert = require("node:assert/strict");

const fakePool = {
  async query(sql) {
    if (sql.includes("COUNT(*)::int AS total FROM usuarios")) return { rows: [{ total: 1 }] };
    if (sql.includes("has_profile")) {
      return { rows: [{ id: 7, nombre: "User Test", email: "user@example.test", rol: "usuario", fecha_registro: new Date().toISOString(), has_profile: true, goals_count: 2, conditions_count: 1, restrictions_count: 3 }] };
    }
    throw new Error(`Unexpected admin management query: ${sql}`);
  }
};

const databasePath = require.resolve("../database/db");
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: fakePool };
const { listUsers, updateUserRole, createClinicalCatalogItem } = require("../controllers/adminController");

const invoke = async (handler, request) => {
  let status = 200;
  let body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; return value; } };
  await handler(request, response);
  return { status, body };
};

const run = async () => {
  const users = await invoke(listUsers, { query: { page: "1", limit: "15", search: "user" } });
  assert.equal(users.status, 200);
  assert.equal(users.body.pagination.total, 1);
  assert.equal(users.body.items[0].goals_count, 2);
  assert.equal("password_hash" in users.body.items[0], false);

  const invalidRole = await invoke(updateUserRole, { params: { id: "7" }, body: { role: "owner" } });
  assert.equal(invalidRole.status, 400);

  const invalidCatalog = await invoke(createClinicalCatalogItem, { params: { catalog: "unknown" }, body: {} });
  assert.equal(invalidCatalog.status, 400);

  console.log(JSON.stringify({ ok: true, pagination: true, sensitiveFieldsExcluded: true, invalidRoleRejected: true, catalogAllowlistEnforced: true }, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
