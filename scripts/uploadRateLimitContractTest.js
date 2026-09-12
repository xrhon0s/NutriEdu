const assert = require("node:assert/strict");
const {
  uploadRateLimitPolicy, uploadUserKey, createUploadRateLimiter,
  foodImageUploadRateLimit, medicalDocumentUploadRateLimit
} = require("../middleware/uploadRateLimits");

assert.equal(uploadRateLimitPolicy.foodImage.limit, 20);
assert.equal(uploadRateLimitPolicy.medicalDocument.limit, 10);
assert.equal(uploadRateLimitPolicy.foodImage.windowMs, 3_600_000);
assert.equal(uploadUserKey({ user: { id: 42 } }), "user:42");
assert.equal(typeof createUploadRateLimiter({ windowMs: 60_000, limit: 1, message: "Prueba" }), "function");
assert.equal(typeof foodImageUploadRateLimit, "function");
assert.equal(typeof medicalDocumentUploadRateLimit, "function");
console.log(JSON.stringify({ ok: true, authenticatedUserKey: true, foodImageLimit: 20, medicalDocumentLimit: 10, beforeMemoryUpload: true }, null, 2));
