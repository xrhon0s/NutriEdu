const pool = require("../database/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");


//======================= Funcion de Register ==============================
const registerUser = async (req, res) => {
 try {

  const { nombre, email, password } = req.body;

  // Validar campos vacíos
  if (!nombre || !email || !password) {
   return res.status(400).json({
    message: "Todos los campos son obligatorios"
   });
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!emailRegex.test(email)) {
   return res.status(400).json({
    message: "Correo electrónico inválido"
   });
  }

  // Verificar si el email ya existe
  const existingUser = await pool.query(
   "SELECT * FROM usuarios WHERE email = $1",
   [email]
  );

  if (existingUser.rows.length > 0) {
   return res.status(400).json({
    message: "El correo ya está registrado"
   });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await pool.query(
   "INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id, nombre, email, fecha_registro",
   [nombre, email, hashedPassword]
  );

  res.status(201).json({
   message: "Usuario creado",
   user: result.rows[0]
  });

 } catch (error) {

  console.error(error);

  res.status(500).json({
   error: "Error al registrar usuario"
  });

 }
};
//======================= Funcion de LogIn ==============================
const loginUser = async (req, res) => {
 try {

  const { email, password } = req.body;

  const result = await pool.query(
   "SELECT * FROM usuarios WHERE email = $1",
   [email]
  );

  if (result.rows.length === 0) {
   return res.status(401).json({ message: "Usuario no encontrado" });
  }

  const user = result.rows[0];

  const validPassword = await bcrypt.compare(password, user.password_hash);

  if (!validPassword) {
   return res.status(401).json({ message: "Contraseña incorrecta" });
  }

  const token = jwt.sign(
   { id: user.id, email: user.email },
   process.env.JWT_SECRET,
   { expiresIn: "1h" }
  );

  res.json({
  message: "Login exitoso",
  token,
  user: {
    id: user.id,
    nombre: user.nombre,
    email: user.email
  }
});
  

 } catch (error) {
  console.error(error);
  res.status(500).json({ error: "Error en login" });
 }
}

//======================= Funcion de addRestrictions ==============================

const addRestrictions = async (req, res) => {
  try {
    const { userId, restricciones } = req.body;

    const existing = await pool.query(
      "SELECT * FROM usuario_restricciones WHERE usuario_id = $1",
      [userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        message: "Este usuario ya tiene restricciones registradas"
      });
    }

    for (const restriccion of restricciones) {
      await pool.query(
        "INSERT INTO usuario_restricciones (usuario_id, restriccion_id) VALUES ($1, $2)",
        [userId, restriccion]
      );
    }

    res.json({
      message: "Restricciones guardadas correctamente"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error guardando restricciones"
    });
  }
};
//======================= Funcion de getUserRestrictions ==============================
const getUserRestrictions = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT ur.restriccion_id, r.nombre
       FROM usuario_restricciones ur
       JOIN restricciones r ON ur.restriccion_id = r.id
       WHERE ur.usuario_id = $1`,
      [userId]
    );

    res.json({
      hasRestrictions: result.rows.length > 0,
      restrictions: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error obteniendo restricciones",
    });
  }
};

module.exports = { registerUser, loginUser, addRestrictions, getUserRestrictions };