const { createOpenAiVisionProvider } = require("./openAiVisionProvider");

const getVisionProvider = () => {
  const providerName = (process.env.VISION_PROVIDER || "disabled").toLowerCase();
  if (providerName === "disabled") return null;

  if (providerName === "openai") {
    if (!process.env.OPENAI_API_KEY) return null;
    return createOpenAiVisionProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_VISION_MODEL || "gpt-5-mini",
      imageDetail: process.env.OPENAI_VISION_IMAGE_DETAIL === "high" ? "high" : "low",
      maxOutputTokens: positiveInteger(process.env.OPENAI_VISION_MAX_OUTPUT_TOKENS, 1400),
      reasoningEffort: allowedReasoningEffort(process.env.OPENAI_VISION_REASONING_EFFORT),
      inputPricePerMillion: positiveNumber(process.env.OPENAI_VISION_INPUT_USD_PER_MILLION, 0.25),
      outputPricePerMillion: positiveNumber(process.env.OPENAI_VISION_OUTPUT_USD_PER_MILLION, 2)
    });
  }

  const error = new Error(`Proveedor de visión no soportado: ${providerName}`);
  error.code = "UNSUPPORTED_VISION_PROVIDER";
  throw error;
};

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const allowedReasoningEffort = (value) => {
  const normalized = (value || "minimal").toLowerCase();
  return new Set(["minimal", "low", "medium", "high"]).has(normalized) ? normalized : "minimal";
};

module.exports = { getVisionProvider };
