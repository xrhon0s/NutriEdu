const crypto = require("crypto");
const pool = require("../database/db");
const { evaluateFoodAnalysisForUser } = require("../services/nutritionRuleService");
const { FoodAnalysisValidationError, validateFoodAnalysis } = require("../services/vision/foodAnalysisSchema");
const { getVisionProvider } = require("../services/vision");
const {
  VisionUsageLimitError,
  completeVisionAnalysis,
  failVisionAnalysis,
  getVisionQuota,
  reserveVisionAnalysis
} = require("../services/visionUsageService");

const VALID_SOURCES = new Set(["camera", "library"]);
const PROVIDER_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const intakeFoodImage = (req, res) => {
  const validationError = getImageRequestError(req);
  if (validationError) return res.status(validationError.status).json({ message: validationError.message });
  const source = req.body.source;

  return res.json({
    requestId: crypto.randomUUID(),
    schemaVersion: "1.0",
    status: "validated",
    image: {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      source,
      capturedAt: req.body.capturedAt || null
    },
    retention: {
      retained: false,
      reason: "Image storage is not configured"
    },
    analysis: null,
    nextStep: "vision_provider_required"
  });
};

const getVisionStatus = async (req, res) => {
  try {
    const provider = getVisionProvider();
    const quota = provider ? await getVisionQuota(pool, req.user.id) : null;
    return res.json({
      configured: Boolean(provider),
      provider: provider ? provider.name : null,
      model: provider ? provider.model : null,
      schemaVersion: "1.0",
      quota
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "La configuración de visión no es válida" });
  }
};

const analyzeFoodImage = async (req, res) => {
  const validationError = getImageRequestError(req);
  if (validationError) return res.status(validationError.status).json({ message: validationError.message });

  if (req.body.consent !== "true" || req.body.consentVersion !== "1.0") {
    return res.status(400).json({
      code: "VISION_CONSENT_REQUIRED",
      message: "Debes autorizar el procesamiento externo de esta imagen"
    });
  }
  if (!PROVIDER_IMAGE_TYPES.has(req.file.mimetype)) {
    return res.status(415).json({ message: "Convierte la imagen a JPEG, PNG o WebP antes de analizarla" });
  }

  const requestId = crypto.randomUUID();
  let usageReserved = false;
  let usageCompleted = false;

  try {
    const provider = getVisionProvider();
    if (!provider) {
      return res.status(503).json({
        code: "VISION_PROVIDER_NOT_CONFIGURED",
        message: "El proveedor de análisis visual todavía no está configurado"
      });
    }

    await reserveVisionAnalysis(pool, {
      requestId,
      userId: req.user.id,
      provider: provider.name,
      model: provider.model
    });
    usageReserved = true;

    const providerResult = await provider.analyzeFoodImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype
    });
    const { analysis, usage } = providerResult;
    await completeVisionAnalysis(pool, requestId, usage);
    usageCompleted = true;

    const evaluation = await evaluateFoodAnalysisForUser(pool, {
      analysis,
      userId: req.user.id
    });
    const quota = await getVisionQuota(pool, req.user.id);

    return res.json({
      requestId,
      schemaVersion: "1.0",
      status: analysis.isFood ? "review_required" : "not_food",
      provider: { name: provider.name, model: provider.model },
      image: imageMetadata(req),
      retention: {
        retainedByNutriEdu: false,
        externalProcessing: true
      },
      analysis,
      evaluation,
      usage,
      quota
    });
  } catch (error) {
    if (usageReserved && !usageCompleted) {
      await failVisionAnalysis(pool, requestId, error.code).catch((usageError) => {
        console.error("Could not close vision usage reservation", usageError);
      });
    }
    if (error instanceof VisionUsageLimitError) {
      return res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
        retryAt: error.retryAt
      });
    }
    console.error("Food vision analysis failed", error);
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      code: error.code || "VISION_ANALYSIS_FAILED",
      message: timedOut
        ? "El análisis visual superó el tiempo de espera"
        : "No pudimos analizar la imagen en este momento"
    });
  }
};

const reviewFoodAnalysis = async (req, res) => {
  try {
    const analysis = validateFoodAnalysis(req.body.analysis);
    const evaluation = await evaluateFoodAnalysisForUser(pool, {
      analysis,
      userId: req.user.id
    });
    return res.json({
      requestId: req.body.requestId || crypto.randomUUID(),
      schemaVersion: "1.0",
      status: "reviewed",
      analysis,
      evaluation
    });
  } catch (error) {
    if (error instanceof FoodAnalysisValidationError) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    console.error("Food analysis review failed", error);
    return res.status(500).json({ message: "No pudimos reevaluar las correcciones" });
  }
};

const getImageRequestError = (req) => {
  if (!req.file) return { status: 400, message: "Debes adjuntar una imagen en el campo image" };
  if (!VALID_SOURCES.has(req.body.source)) return { status: 400, message: "La fuente debe ser camera o library" };
  if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
    return { status: 415, message: "El contenido del archivo no coincide con una imagen válida" };
  }
  return null;
};

const imageMetadata = (req) => ({
  fileName: req.file.originalname,
  mimeType: req.file.mimetype,
  sizeBytes: req.file.size,
  source: req.body.source,
  capturedAt: req.body.capturedAt || null
});

const hasValidImageSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    const brand = buffer.toString("ascii", 8, 12);
    return buffer.toString("ascii", 4, 8) === "ftyp"
      && new Set(["heic", "heix", "hevc", "hevx", "heif", "mif1", "msf1"]).has(brand);
  }
  return false;
};

module.exports = {
  analyzeFoodImage,
  getVisionStatus,
  intakeFoodImage,
  reviewFoodAnalysis
};
