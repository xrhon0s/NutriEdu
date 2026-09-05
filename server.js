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

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = origin?.replace(/\/$/, "");

    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error("Origen no permitido por CORS"));
  },
  credentials: true
}));
app.use(express.json());

app.use("/api/recipes", recipeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/planner", plannerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/food-analysis", foodAnalysisRoutes);
app.use("/api/medical-documents", medicalDocumentRoutes);
app.use("/api/notifications", notificationRoutes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
