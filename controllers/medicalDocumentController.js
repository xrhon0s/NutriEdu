const crypto = require("crypto");
const {
  MedicalDocumentValidationError,
  getAcceptedFindings,
  validateAcceptedFindingIds,
  validateMedicalDocumentExtraction
} = require("../services/medicalDocument/medicalDocumentSchema");
const {
  MedicalDocumentApplicationError,
  applyMedicalDocumentApplication,
  previewMedicalDocumentApplication,
  saveMedicalDocumentReview
} = require("../services/medicalDocument/medicalDocumentApplicationService");
const {
  RETENTION_POLICY,
  deleteUnappliedMedicalDocumentReview,
  getMedicalDocumentHistoryDetail,
  listMedicalDocumentHistory: listMedicalDocumentHistoryService
} = require("../services/medicalDocument/medicalDocumentHistoryService");

const VALID_SOURCES = new Set(["camera", "file"]);
const VALID_DOCUMENT_TYPES = new Set([
  "prescription",
  "lab_result",
  "nutrition_order",
  "medical_summary",
  "other"
]);

const intakeMedicalDocument = (req, res) => {
  const validationError = getDocumentRequestError(req);
  if (validationError) {
    return res.status(validationError.status).json({
      code: validationError.code,
      message: validationError.message
    });
  }

  return res.json({
    requestId: crypto.randomUUID(),
    schemaVersion: "1.0",
    status: "validated",
    document: {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      source: req.body.source,
      documentType: req.body.documentType,
      capturedAt: req.body.capturedAt || null
    },
    consent: {
      granted: true,
      version: "1.0",
      purpose: "medical_document_extraction"
    },
    retention: {
      retained: false,
      reason: "Document storage and extraction are not configured"
    },
    extraction: null,
    profileUpdated: false,
    nextStep: "document_extraction_provider_required"
  });
};

const reviewMedicalDocumentExtraction = async (req, res) => {
  try {
    const requestId = requiredRequestId(req.body.requestId);
    const extraction = validateMedicalDocumentExtraction(req.body.extraction);
    const acceptedFindingIds = validateAcceptedFindingIds(req.body.acceptedFindingIds, extraction);
    const acceptedFindings = getAcceptedFindings(extraction, acceptedFindingIds);

    const review = await saveMedicalDocumentReview({
      userId: req.user.id,
      requestId,
      extraction,
      acceptedFindingIds,
      acceptedFindings
    });

    return res.json({
      reviewId: Number(review.id),
      requestId,
      schemaVersion: "1.0",
      status: "reviewed",
      extraction,
      acceptedFindingIds,
      acceptedFindings,
      acceptedCount: acceptedFindingIds.length,
      profileUpdated: false,
      auditReady: true,
      reviewedAt: review.reviewed_at,
      nextStep: "explicit_profile_apply_required"
    });
  } catch (error) {
    if (error instanceof MedicalDocumentValidationError) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    if (error instanceof MedicalDocumentApplicationError) {
      return res.status(error.status).json({ code: error.code, message: error.message });
    }
    if (error.code === "42P01" || error.code === "42703") {
      return res.status(503).json({
        code: "MEDICAL_DOCUMENT_AUDIT_MIGRATION_REQUIRED",
        message: "La auditoria medica aun no esta instalada. Ejecuta las migraciones medicas pendientes"
      });
    }
    console.error("Medical document review failed", error);
    return res.status(500).json({ message: "No pudimos revisar los hallazgos del documento" });
  }
};

const previewMedicalDocumentProfileApplication = async (req, res) => {
  try {
    const preview = await previewMedicalDocumentApplication(req.user.id, requiredReviewId(req.params.reviewId));
    return res.json(preview);
  } catch (error) {
    return handleApplicationError(error, res, "No pudimos preparar los cambios del perfil");
  }
};

const applyMedicalDocumentToProfile = async (req, res) => {
  try {
    const result = await applyMedicalDocumentApplication({
      userId: req.user.id,
      reviewId: requiredReviewId(req.params.reviewId),
      previewHash: req.body.previewHash,
      confirmationVersion: req.body.confirmationVersion
    });
    return res.json(result);
  } catch (error) {
    return handleApplicationError(error, res, "No pudimos aplicar los cambios al perfil");
  }
};

const getMedicalDocumentRetentionPolicy = (_req, res) => res.json(RETENTION_POLICY);

const listMedicalDocumentHistory = async (req, res) => {
  try {
    const history = await listMedicalDocumentHistoryService(
      req.user.id,
      req.query.cursor,
      req.query.limit
    );
    return res.json(history);
  } catch (error) {
    return handleApplicationError(error, res, "No pudimos consultar el historial medico");
  }
};

const getMedicalDocumentHistory = async (req, res) => {
  try {
    const detail = await getMedicalDocumentHistoryDetail(
      req.user.id,
      requiredReviewId(req.params.reviewId)
    );
    return res.json(detail);
  } catch (error) {
    return handleApplicationError(error, res, "No pudimos consultar esta revision medica");
  }
};

const deleteMedicalDocumentHistory = async (req, res) => {
  try {
    const result = await deleteUnappliedMedicalDocumentReview(
      req.user.id,
      requiredReviewId(req.params.reviewId)
    );
    return res.json(result);
  } catch (error) {
    return handleApplicationError(error, res, "No pudimos eliminar esta revision medica");
  }
};

const handleApplicationError = (error, res, fallbackMessage) => {
  if (error instanceof MedicalDocumentValidationError || error instanceof MedicalDocumentApplicationError) {
    return res.status(error.status || 400).json({ code: error.code, message: error.message });
  }
  if (error.code === "42P01" || error.code === "42703") {
    return res.status(503).json({
      code: "MEDICAL_DOCUMENT_AUDIT_MIGRATION_REQUIRED",
      message: "Ejecuta las migraciones medicas pendientes para habilitar esta operacion"
    });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage });
};

const requiredRequestId = (value) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw new MedicalDocumentValidationError("La solicitud de documento no es valida");
  }
  return value.trim();
};

const requiredReviewId = (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new MedicalDocumentApplicationError("La revision no es valida", "INVALID_REVIEW_ID");
  }
  return parsed;
};

const getDocumentRequestError = (req) => {
  if (!req.file) {
    return { status: 400, code: "MEDICAL_DOCUMENT_REQUIRED", message: "Debes adjuntar un documento" };
  }
  if (req.body.consent !== "true" || req.body.consentVersion !== "1.0") {
    return {
      status: 400,
      code: "MEDICAL_DOCUMENT_CONSENT_REQUIRED",
      message: "Debes autorizar el procesamiento de este documento medico"
    };
  }
  if (!VALID_SOURCES.has(req.body.source)) {
    return { status: 400, code: "INVALID_DOCUMENT_SOURCE", message: "La fuente debe ser camera o file" };
  }
  if (!VALID_DOCUMENT_TYPES.has(req.body.documentType)) {
    return { status: 400, code: "INVALID_DOCUMENT_TYPE", message: "Selecciona un tipo de documento valido" };
  }
  if (!hasValidDocumentSignature(req.file.buffer, req.file.mimetype)) {
    return {
      status: 415,
      code: "INVALID_DOCUMENT_CONTENT",
      message: "El contenido no coincide con un PDF, JPEG o PNG valido"
    };
  }
  return null;
};

const hasValidDocumentSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  if (mimeType === "application/pdf") return buffer.toString("ascii", 0, 5) === "%PDF-";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return false;
};

module.exports = {
  applyMedicalDocumentToProfile,
  deleteMedicalDocumentHistory,
  getMedicalDocumentHistory,
  getMedicalDocumentRetentionPolicy,
  intakeMedicalDocument,
  listMedicalDocumentHistory,
  previewMedicalDocumentProfileApplication,
  reviewMedicalDocumentExtraction
};
