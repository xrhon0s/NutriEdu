const crypto = require("crypto");

const createRequestContext = ({ logger = console.log, now = Date.now, randomUUID = crypto.randomUUID } = {}) => (req, res, next) => {
  const startedAt = now();
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  res.on("finish", () => {
    const statusCode = res.statusCode;
    logger(JSON.stringify({
      timestamp: new Date(now()).toISOString(),
      level: statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
      event: "http_request",
      requestId,
      method: req.method,
      path: String(req.originalUrl || req.url || "").split("?")[0],
      statusCode,
      durationMs: Math.max(0, now() - startedAt),
      userId: req.user?.id || null
    }));
  });
  next();
};

module.exports = { createRequestContext, requestContext: createRequestContext() };
