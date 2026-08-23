const assert = require("assert");
const { createOpenAiVisionProvider } = require("../services/vision/openAiVisionProvider");
const { validateFoodAnalysis } = require("../services/vision/foodAnalysisSchema");

const fixture = {
  isFood: true,
  notFoodReason: null,
  dish: {
    name: "Arroz con pollo",
    description: "Arroz, pollo y vegetales visibles",
    confidence: "high"
  },
  ingredients: [{
    name: "pollo",
    estimatedGrams: 120,
    confidence: "high",
    uncertain: false
  }],
  portion: {
    description: "Un plato mediano",
    estimatedGrams: 420,
    confidence: "medium"
  },
  nutrition: {
    calories: 620,
    protein_g: 38,
    carbs_g: 72,
    fat_g: 18,
    saturated_fat_g: 4,
    sugar_g: 6,
    fiber_g: 7,
    sodium_mg: 540,
    confidence: "low"
  },
  uncertainties: ["La cantidad de aceite no es visible"]
};

const run = async () => {
  const originalFetch = global.fetch;
  let capturedRequest;

  global.fetch = async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(fixture) }] }],
      usage: { input_tokens: 4000, output_tokens: 800, total_tokens: 4800 }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const provider = createOpenAiVisionProvider({ apiKey: "test-key", model: "test-vision-model" });
    const result = await provider.analyzeFoodImage({
      buffer: Buffer.from("fixture-image"),
      mimeType: "image/jpeg"
    });

    assert.equal(result.analysis.dish.name, fixture.dish.name);
    assert.equal(result.usage.estimatedCostUsd, 0.0026);
    assert.equal(capturedRequest.url, "https://api.openai.com/v1/responses");
    assert.equal(capturedRequest.body.model, "test-vision-model");
    assert.equal(capturedRequest.body.store, false);
    assert.equal(capturedRequest.body.max_output_tokens, 1400);
    assert.equal(capturedRequest.body.reasoning.effort, "minimal");
    assert.equal(capturedRequest.body.input[0].content[1].detail, "low");
    assert.equal(capturedRequest.body.text.format.type, "json_schema");
    assert.equal(capturedRequest.body.text.format.strict, true);
    assert.match(capturedRequest.body.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
    assert.throws(
      () => validateFoodAnalysis({
        ...fixture,
        nutrition: { ...fixture.nutrition, calories: 20001 }
      }),
      /fuera del rango permitido/
    );

    console.log(JSON.stringify({
      ok: true,
      provider: provider.name,
      schema: capturedRequest.body.text.format.name,
      store: capturedRequest.body.store,
      dish: result.analysis.dish.name,
      estimatedCostUsd: result.usage.estimatedCostUsd
    }, null, 2));
  } finally {
    global.fetch = originalFetch;
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
