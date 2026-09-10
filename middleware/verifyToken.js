const jwt = require("jsonwebtoken");
const pool = require("../database/db");

module.exports = async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token requerido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      "SELECT id, email, rol FROM usuarios WHERE id = $1",
      [decoded.id]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ message: "La cuenta ya no existe" });
    }
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name !== "JsonWebTokenError" && error.name !== "TokenExpiredError") {
      console.error("Error verificando token", error);
      return res.status(500).json({ message: "No pudimos verificar la sesion" });
    }
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};
