require("dotenv").config();

const express = require("express");
const cors = require("cors");

const userRoutes = require("./routes/userRoutes");
const recipeRoutes = require("./routes/recipeRoutes");
const plannerRoutes = require("./routes/plannerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const profileRoutes = require("./routes/profileRoutes");
const foodAnalysisRoutes = require("./routes/foodAnalysisRoutes");
const medicalDocumentRoutes = require("./routes/medicalDocumentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const { requestContext } = require("./middleware/requestContext");

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT || 3000;
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS, 10) || (process.env.NODE_ENV === "production" ? 1 : 0);
if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(requestContext);
app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = origin?.replace(/\/$/, "");

    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    const error = new Error("Origen no permitido por CORS");
    error.status = 403;
    error.code = "CORS_ORIGIN_DENIED";
    return callback(error);
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));

app.use("/api/recipes", recipeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/planner", plannerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/food-analysis", foodAnalysisRoutes);
app.use("/api/medical-documents", medicalDocumentRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((_req, res) => res.status(404).json({ code: "NOT_FOUND", message: "Ruta no encontrada" }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ code: "PAYLOAD_TOO_LARGE", message: "El archivo JSON supera el limite de 2 MB", requestId: req.requestId });
  }
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: status >= 500 ? "error" : "warn", event: status >= 500 ? "unhandled_error" : "request_error", requestId: req.requestId, code: error?.code || "INTERNAL_ERROR", message: error?.message || "Unknown error" }));
  return res.status(status).json({ code: error?.code || "INTERNAL_ERROR", message: status >= 500 ? "Ocurrió un error interno" : error.message, requestId: req.requestId });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
