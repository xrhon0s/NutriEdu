const assert = require("assert");
const {
  VisionUsageLimitError,
  completeVisionAnalysis,
  failVisionAnalysis,
  getVisionQuota,
  reserveVisionAnalysis
} = require("../services/visionUsageService");

const createFakePool = () => {
  const records = [];

  const query = async (sql, params = []) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory)/.test(sql)) return { rows: [] };

    if (sql.includes("COUNT(*) FILTER")) {
      const userId = params[0];
      return {
        rows: [{
          daily_used: records.filter((record) => record.userId === userId).length,
          monthly_committed_usd: records.reduce((total, record) => {
            if (record.status === "pending") return total + record.reservedCostUsd;
            if (record.status === "succeeded") return total + record.estimatedCostUsd;
            return total;
          }, 0)
        }]
      };
    }

    if (sql.includes("INSERT INTO vision_analysis_usage")) {
      records.push({
        requestId: params[0],
        userId: params[1],
        status: "pending",
        reservedCostUsd: Number(params[4]),
        estimatedCostUsd: 0
      });
      return { rows: [] };
    }

    const record = records.find((item) => item.requestId === params[0]);
    if (sql.includes("status = 'succeeded'")) {
      record.status = "succeeded";
      record.estimatedCostUsd = Number(params[4]);
      return { rows: [] };
    }
    if (sql.includes("status = 'failed'")) {
      record.status = "failed";
      record.reservedCostUsd = 0;
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in fake pool: ${sql}`);
  };

  return {
    records,
    query,
    async connect() {
      return { query, release() {} };
    }
  };
};

const expectLimit = async (operation, expectedCode) => {
  await assert.rejects(operation, (error) => {
    assert(error instanceof VisionUsageLimitError);
    assert.equal(error.code, expectedCode);
    return true;
  });
};

const run = async () => {
  process.env.VISION_DAILY_LIMIT_PER_USER = "2";
  process.env.VISION_MONTHLY_BUDGET_USD = "0.02";
  process.env.VISION_COST_RESERVE_USD = "0.01";

  const pool = createFakePool();
  const request = (requestId, userId) => reserveVisionAnalysis(pool, {
    requestId,
    userId,
    provider: "openai",
    model: "gpt-5-mini"
  });

  const firstQuota = await request("00000000-0000-4000-8000-000000000001", 1);
  assert.equal(firstQuota.dailyRemaining, 1);
  await completeVisionAnalysis(pool, "00000000-0000-4000-8000-000000000001", {
    inputTokens: 4000,
    outputTokens: 800,
    totalTokens: 4800,
    estimatedCostUsd: 0.0026
  });

  await request("00000000-0000-4000-8000-000000000002", 1);
  assert.equal((await getVisionQuota(pool, 1)).dailyRemaining, 0);
  await expectLimit(
    () => request("00000000-0000-4000-8000-000000000003", 1),
    "VISION_DAILY_LIMIT_REACHED"
  );
  await expectLimit(
    () => request("00000000-0000-4000-8000-000000000004", 2),
    "VISION_MONTHLY_BUDGET_REACHED"
  );

  await failVisionAnalysis(pool, "00000000-0000-4000-8000-000000000002", "TEST_FAILURE");
  const recoveredQuota = await request("00000000-0000-4000-8000-000000000005", 2);
  assert.equal(recoveredQuota.dailyRemaining, 1);

  console.log(JSON.stringify({
    ok: true,
    dailyLimitEnforced: true,
    monthlyBudgetEnforced: true,
    failedReservationReleased: true
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
