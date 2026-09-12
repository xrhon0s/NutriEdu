const { rateLimit } = require("express-rate-limit");
const { buildRateLimitPayload } = require("./authRateLimits");

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const uploadRateLimitPolicy = Object.freeze({
  foodImage: {
    windowMs: positiveInteger(process.env.FOOD_UPLOAD_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
    limit: positiveInteger(process.env.FOOD_UPLOAD_RATE_LIMIT_MAX, 20),
    message: "Alcanzaste el límite temporal de imágenes. Intenta nuevamente más tarde."
  },
  medicalDocument: {
    windowMs: positiveInteger(process.env.MEDICAL_UPLOAD_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
    limit: positiveInteger(process.env.MEDICAL_UPLOAD_RATE_LIMIT_MAX, 10),
    message: "Alcanzaste el límite temporal de documentos. Intenta nuevamente más tarde."
  }
});
const uploadUserKey = (req) => `user:${req.user.id}`;

const createUploadRateLimiter = (policy) => rateLimit({
  windowMs: policy.windowMs,
  limit: policy.limit,
  keyGenerator: uploadUserKey,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json(buildRateLimitPayload(req, policy))
});

module.exports = {
  uploadRateLimitPolicy,
  uploadUserKey,
  createUploadRateLimiter,
  foodImageUploadRateLimit: createUploadRateLimiter(uploadRateLimitPolicy.foodImage),
  medicalDocumentUploadRateLimit: createUploadRateLimiter(uploadRateLimitPolicy.medicalDocument)
};
