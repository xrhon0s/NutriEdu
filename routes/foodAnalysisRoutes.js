const express = require("express");
const multer = require("multer");
const {
  analyzeFoodImage,
  getVisionStatus,
  intakeFoodImage,
  reviewFoodAnalysis
} = require("../controllers/foodAnalysisController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      const error = new Error("Formato de imagen no permitido");
      error.statusCode = 415;
      return callback(error);
    }
    callback(null, true);
  }
});

const receiveImage = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "La imagen supera el limite de 8 MB" });
    }
    return res.status(error.statusCode || 400).json({
      message: error.message || "No pudimos procesar la imagen"
    });
  });
};

router.use(verifyToken);
router.get("/status", getVisionStatus);
router.post("/intake", receiveImage, intakeFoodImage);
router.post("/analyze", receiveImage, analyzeFoodImage);
router.post("/review", reviewFoodAnalysis);

module.exports = router;
