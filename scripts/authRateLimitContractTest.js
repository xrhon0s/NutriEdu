const assert = require("node:assert/strict");
const {
  authRateLimitPolicy, buildRateLimitPayload, createAuthRateLimiter,
  loginRateLimit, registerRateLimit, forgotPasswordRateLimit, resetPasswordRateLimit
} = require("../middleware/authRateLimits");

const now = Date.parse("2026-09-12T12:00:00Z");
const payload = buildRateLimitPayload({ rateLimit: { resetTime: new Date(now + 45_000) } }, { message: "Límite de prueba" }, now);
assert.deepEqual(payload, { code: "RATE_LIMITED", message: "Límite de prueba", retryAfterSeconds: 45 });
assert.equal(authRateLimitPolicy.login.limit, 10);
assert.equal(authRateLimitPolicy.login.skipSuccessfulRequests, true);
assert.equal(authRateLimitPolicy.forgotPassword.limit, 5);
assert.equal(typeof createAuthRateLimiter({ windowMs: 60_000, limit: 2, message: "Prueba" }), "function");
[loginRateLimit, registerRateLimit, forgotPasswordRateLimit, resetPasswordRateLimit].forEach((middleware) => assert.equal(typeof middleware, "function"));
console.log(JSON.stringify({ ok: true, policies: 4, structured429: true, retryAfter: true, successfulLoginSkipped: true }, null, 2));
