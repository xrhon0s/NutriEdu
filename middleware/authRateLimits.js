const { rateLimit } = require("express-rate-limit");

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const authRateLimitPolicy = Object.freeze({
  login: {
    windowMs: positiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    limit: positiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10),
    skipSuccessfulRequests: true,
    message: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde."
  },
  register: {
    windowMs: positiveInteger(process.env.REGISTER_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
    limit: positiveInteger(process.env.REGISTER_RATE_LIMIT_MAX, 10),
    message: "Demasiadas cuentas creadas desde esta conexión. Intenta nuevamente más tarde."
  },
  forgotPassword: {
    windowMs: positiveInteger(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
    limit: positiveInteger(process.env.PASSWORD_RESET_RATE_LIMIT_MAX, 5),
    message: "Demasiadas solicitudes de recuperación. Intenta nuevamente más tarde."
  },
  resetPassword: {
    windowMs: positiveInteger(process.env.PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    limit: positiveInteger(process.env.PASSWORD_CHANGE_RATE_LIMIT_MAX, 10),
    message: "Demasiados intentos de cambio de contraseña. Intenta nuevamente más tarde."
  }
});

const buildRateLimitPayload = (req, policy, now = Date.now()) => {
  const resetTime = req.rateLimit?.resetTime?.getTime();
  return {
    code: "RATE_LIMITED",
    message: policy.message,
    retryAfterSeconds: resetTime ? Math.max(1, Math.ceil((resetTime - now) / 1000)) : null
  };
};

const createAuthRateLimiter = (policy) => rateLimit({
  windowMs: policy.windowMs,
  limit: policy.limit,
  skipSuccessfulRequests: Boolean(policy.skipSuccessfulRequests),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler(req, res) {
    return res.status(429).json(buildRateLimitPayload(req, policy));
  }
});

module.exports = {
  authRateLimitPolicy,
  buildRateLimitPayload,
  createAuthRateLimiter,
  loginRateLimit: createAuthRateLimiter(authRateLimitPolicy.login),
  registerRateLimit: createAuthRateLimiter(authRateLimitPolicy.register),
  forgotPasswordRateLimit: createAuthRateLimiter(authRateLimitPolicy.forgotPassword),
  resetPasswordRateLimit: createAuthRateLimiter(authRateLimitPolicy.resetPassword)
};
