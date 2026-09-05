const express = require("express");
const multer = require("multer");
const {
  applyMedicalDocumentToProfile,
  deleteMedicalDocumentHistory,
  getMedicalDocumentHistory,
  getMedicalDocumentRetentionPolicy,
  intakeMedicalDocument,
  listMedicalDocumentHistory,
  previewMedicalDocumentProfileApplication,
  reviewMedicalDocumentExtraction
} = require("../controllers/medicalDocumentController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_DOCUMENT_TYPES.has(file.mimetype)) {
      const error = new Error("Usa un documento PDF, JPEG o PNG");
      error.statusCode = 415;
      return callback(error);
    }
    callback(null, true);
  }
});

const receiveDocument = (req, res, next) => {
  upload.single("document")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "El documento supera el limite de 10 MB" });
    }
    return res.status(error.statusCode || 400).json({
      message: error.message || "No pudimos procesar el documento"
    });
  });
};

router.use(verifyToken);
router.post("/intake", receiveDocument, intakeMedicalDocument);
router.post("/review", reviewMedicalDocumentExtraction);
router.get("/retention-policy", getMedicalDocumentRetentionPolicy);
router.get("/history", listMedicalDocumentHistory);
router.get("/history/:reviewId", getMedicalDocumentHistory);
router.delete("/history/:reviewId", deleteMedicalDocumentHistory);
router.get("/reviews/:reviewId/preview", previewMedicalDocumentProfileApplication);
router.post("/reviews/:reviewId/apply", applyMedicalDocumentToProfile);

module.exports = router;
