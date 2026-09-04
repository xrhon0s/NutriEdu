require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../database/db");

const apiUrl = process.env.SMOKE_API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
const runId = Date.now();
const email = `admin-smoke-${runId}@example.test`;
const password = `Admin-Smoke-${runId}`;
let userId;

const request = async (path, options = {}) => {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
};

const run = async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const inserted = await pool.query(
    "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1,$2,$3,'administrador') RETURNING id",
    ["Admin Smoke Test", email, passwordHash]
  );
  userId = inserted.rows[0].id;
  const login = await request("/users/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const headers = { Authorization: `Bearer ${login.token}` };
  const users = await request("/admin/users?page=1&limit=5&search=admin-smoke", { headers });
  const catalogs = await request("/admin/clinical-catalogs", { headers });
  const rules = await request("/admin/nutrition-rules?page=1&limit=5", { headers });
  const restrictions = await request("/admin/restrictions", { headers });
  const visionUsage = await request("/admin/vision-usage?page=1&limit=5", { headers });
  const role = await request(`/admin/users/${userId}/role`, { method: "PATCH", headers, body: JSON.stringify({ role: "usuario" }) });
  if (users.pagination.total !== 1 || !catalogs.goals.length || !catalogs.conditions.length || !rules.items.length || !restrictions.items.length || !visionUsage.policy || role.rol !== "usuario") {
    throw new Error("Admin management smoke contract returned an unexpected result");
  }
  console.log(JSON.stringify({ ok: true, userSearch: true, catalogs: true, rules: true, restrictions: true, visionUsage: true, roleChange: true }, null, 2));
};

run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (userId) await pool.query("DELETE FROM usuarios WHERE id = $1", [userId]).catch(() => undefined);
  await pool.end();
});
