const { foodAnalysisJsonSchema, validateFoodAnalysis } = require("./foodAnalysisSchema");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

class VisionProviderError extends Error {
  constructor(message, code = "VISION_PROVIDER_ERROR") {
    super(message);
    this.name = "VisionProviderError";
    this.code = code;
  }
}

const createOpenAiVisionProvider = ({
  apiKey,
  model = "gpt-5-mini",
  imageDetail = "low",
  maxOutputTokens = 1400,
  reasoningEffort = "minimal",
  inputPricePerMillion = 0.25,
  outputPricePerMillion = 2
}) => ({
  name: "openai",
  model,
  async analyzeFoodImage({ buffer, mimeType }) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: reasoningEffort },
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt()
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${buffer.toString("base64")}`,
              detail: imageDetail
            }
          ]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "nutriedu_food_analysis",
            description: "Structured visual observations and approximate nutrition for one food image.",
            strict: true,
            schema: foodAnalysisJsonSchema
          }
        },
        max_output_tokens: maxOutputTokens
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const providerMessage = payload?.error?.message || `OpenAI respondió ${response.status}`;
      throw new VisionProviderError(providerMessage, "OPENAI_REQUEST_FAILED");
    }

    const outputText = getOutputText(payload);
    if (!outputText) {
      throw new VisionProviderError("OpenAI no devolvió un análisis estructurado", "OPENAI_EMPTY_OUTPUT");
    }

    try {
      return {
        analysis: validateFoodAnalysis(JSON.parse(outputText)),
        usage: normalizeUsage(payload.usage, { inputPricePerMillion, outputPricePerMillion })
      };
    } catch (error) {
      throw new VisionProviderError(`Respuesta visual inválida: ${error.message}`, "OPENAI_INVALID_OUTPUT");
    }
  }
});

const normalizeUsage = (usage, prices) => {
  const inputTokens = nonNegativeInteger(usage?.input_tokens);
  const outputTokens = nonNegativeInteger(usage?.output_tokens);
  const totalTokens = nonNegativeInteger(usage?.total_tokens) || inputTokens + outputTokens;
  const estimatedCostUsd = (
    inputTokens * prices.inputPricePerMillion
    + outputTokens * prices.outputPricePerMillion
  ) / 1_000_000;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6))
  };
};

const nonNegativeInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const getOutputText = (payload) => {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
};

const buildPrompt = () => `
Analiza una sola imagen de comida para NutriEdu. Responde en español y solo con el esquema solicitado.
Describe observaciones visuales, no diagnósticos ni consejos médicos. No afirmes ingredientes ocultos como seguros:
márcalos como inciertos y explica la incertidumbre. Las cantidades y nutrientes son estimaciones aproximadas.
Si la imagen no muestra comida, establece isFood=false, deja ingredientes vacíos y nutrientes en null.
`;

module.exports = { VisionProviderError, createOpenAiVisionProvider };
