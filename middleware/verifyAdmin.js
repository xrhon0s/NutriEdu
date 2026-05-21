// middleware/verifyAdmin.js
const pool = require("../database/db");

const verifyAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const result = await pool.query(
      "SELECT rol FROM usuarios WHERE id=$1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const rol = result.rows[0].rol;

    if (rol !== "administrador") {
      return res.status(403).json({ message: "No autorizado" });
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error verificando admin" });
  }
};

module.exports = verifyAdmin;
