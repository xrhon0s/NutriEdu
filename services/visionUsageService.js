class VisionUsageLimitError extends Error {
  constructor(message, code, statusCode = 429, retryAt = null) {
    super(message);
    this.name = "VisionUsageLimitError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryAt = retryAt;
  }
}

const getVisionUsagePolicy = () => ({
  dailyLimitPerUser: positiveInteger(process.env.VISION_DAILY_LIMIT_PER_USER, 5),
  monthlyBudgetUsd: positiveNumber(process.env.VISION_MONTHLY_BUDGET_USD, 5),
  reservationUsd: positiveNumber(process.env.VISION_COST_RESERVE_USD, 0.01)
});

const reserveVisionAnalysis = async (pool, { requestId, userId, provider, model }) => {
  const policy = getVisionUsagePolicy();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nutriedu-vision-usage'))");

    const usage = await queryUsage(client, userId);
    if (usage.dailyUsed >= policy.dailyLimitPerUser) {
      throw new VisionUsageLimitError(
        "Alcanzaste el limite diario de analisis. Intenta de nuevo manana.",
        "VISION_DAILY_LIMIT_REACHED",
        429,
        nextUtcDay()
      );
    }
    if (usage.monthlyCommittedUsd + policy.reservationUsd > policy.monthlyBudgetUsd) {
      throw new VisionUsageLimitError(
        "El analisis visual alcanzo temporalmente su presupuesto mensual.",
        "VISION_MONTHLY_BUDGET_REACHED",
        503,
        nextUtcMonth()
      );
    }

    await client.query(
      `INSERT INTO vision_analysis_usage (
         request_id, usuario_id, provider, model, status, reserved_cost_usd
       ) VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [requestId, userId, provider, model, policy.reservationUsd]
    );
    await client.query("COMMIT");
    return buildQuota(usage.dailyUsed + 1, policy);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const completeVisionAnalysis = async (pool, requestId, usage) => {
  await pool.query(
    `UPDATE vision_analysis_usage
     SET status = 'succeeded', input_tokens = $2, output_tokens = $3,
         total_tokens = $4, estimated_cost_usd = $5, completed_at = CURRENT_TIMESTAMP
     WHERE request_id = $1`,
    [
      requestId,
      usage.inputTokens,
      usage.outputTokens,
      usage.totalTokens,
      usage.estimatedCostUsd
    ]
  );
};

const failVisionAnalysis = async (pool, requestId, errorCode) => {
  await pool.query(
    `UPDATE vision_analysis_usage
     SET status = 'failed', reserved_cost_usd = 0, error_code = $2,
         completed_at = CURRENT_TIMESTAMP
     WHERE request_id = $1 AND status = 'pending'`,
    [requestId, errorCode || "VISION_ANALYSIS_FAILED"]
  );
};

const getVisionQuota = async (pool, userId) => {
  const policy = getVisionUsagePolicy();
  const usage = await queryUsage(pool, userId);
  return buildQuota(usage.dailyUsed, policy);
};

const queryUsage = async (queryable, userId) => {
  const result = await queryable.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE usuario_id = $1
           AND created_at >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
       )::int AS daily_used,
       COALESCE(SUM(
         CASE
           WHEN status = 'pending' THEN reserved_cost_usd
           WHEN status = 'succeeded' THEN estimated_cost_usd
           ELSE 0
         END
       ), 0)::numeric AS monthly_committed_usd
     FROM vision_analysis_usage
     WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    [userId]
  );

  return {
    dailyUsed: Number(result.rows[0].daily_used),
    monthlyCommittedUsd: Number(result.rows[0].monthly_committed_usd)
  };
};

const buildQuota = (dailyUsed, policy) => ({
  dailyLimit: policy.dailyLimitPerUser,
  dailyUsed,
  dailyRemaining: Math.max(policy.dailyLimitPerUser - dailyUsed, 0),
  resetsAt: nextUtcDay()
});

const nextUtcDay = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
};

const nextUtcMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
};

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  VisionUsageLimitError,
  completeVisionAnalysis,
  failVisionAnalysis,
  getVisionQuota,
  getVisionUsagePolicy,
  reserveVisionAnalysis
};
