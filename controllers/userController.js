const pool = require("../database/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendPasswordResetEmail, sendWelcomeEmail } = require("../services/emailService");
const { createInAppNotification } = require("../services/notificationService");
const { validatePassword } = require("../utils/passwordPolicy");

const hashResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const ensurePasswordResetTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};


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

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
   return res.status(400).json({
    code: "WEAK_PASSWORD",
    message: passwordValidation.message,
    requirements: passwordValidation.checks
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

  sendWelcomeEmail({
    to: result.rows[0].email,
    name: result.rows[0].nombre
  }).catch((emailError) => {
    console.error("Error enviando correo de bienvenida:", emailError);
  });

  createInAppNotification(pool, {
    userId: result.rows[0].id,
    category: "security",
    eventType: "welcome",
    title: "Bienvenido a NutriEdu",
    body: "Tu cuenta esta lista. Completa tu perfil para personalizar recetas y alertas.",
    destination: "/profile"
  }).catch((notificationError) => {
    console.error("Error creando notificacion de bienvenida:", notificationError);
  });

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
   { id: user.id, email: user.email, rol: user.rol },
   process.env.JWT_SECRET,
   { expiresIn: "1h" }
  );

  res.json({
  message: "Login exitoso",
  token,
  user: {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol
  }
});
  

 } catch (error) {
  console.error(error);
  res.status(500).json({ error: "Error en login" });
 }
}

//======================= Funcion de forgotPassword ==============================
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "El correo electrónico es obligatorio" });
    }

    await ensurePasswordResetTable();

    const result = await pool.query(
      "SELECT id, nombre, email FROM usuarios WHERE email = $1",
      [email]
    );

    const genericMessage = {
      message: "Si el correo existe, enviaremos instrucciones para restablecer la contraseña"
    };

    if (result.rows.length === 0) {
      return res.json(genericMessage);
    }

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);

    await pool.query(
      "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE usuario_id = $1 AND used_at IS NULL",
      [user.id]
    );

    await pool.query(
      `INSERT INTO password_reset_tokens (usuario_id, token_hash, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [user.id, tokenHash]
    );

    await sendPasswordResetEmail({
      to: user.email,
      name: user.nombre,
      token
    });

    return res.json(genericMessage);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error solicitando restablecimiento de contraseña" });
  }
};

//======================= Funcion de resetPassword ==============================
const resetPassword = async (req, res) => {
  let client;

  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token y contraseña son obligatorios" });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        code: "WEAK_PASSWORD",
        message: passwordValidation.message,
        requirements: passwordValidation.checks
      });
    }

    await ensurePasswordResetTable();

    const tokenHash = hashResetToken(token);
    const result = await pool.query(
      `SELECT id, usuario_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "El enlace de restablecimiento es inválido o expiró" });
    }

    const resetToken = result.rows[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    client = await pool.connect();
    await client.query("BEGIN");

    await client.query(
      "UPDATE usuarios SET password_hash = $1 WHERE id = $2",
      [hashedPassword, resetToken.usuario_id]
    );

    await client.query(
      "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1",
      [resetToken.id]
    );

    await client.query("COMMIT");

    return res.json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error(error);
    return res.status(500).json({ error: "Error restableciendo contraseña" });
  } finally {
    if (client) {
      client.release();
    }
  }
};

//======================= Funcion de addRestrictions ==============================

const addRestrictions = async (req, res) => {
  try {
    const { restricciones } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(restricciones)) {
      return res.status(400).json({
        message: "Datos de restricciones inválidos"
      });
    }

    await pool.query(
      "DELETE FROM usuario_restricciones WHERE usuario_id = $1",
      [userId]
    );

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
    const userId = req.user.id;

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

//======================= Funcion de getAllRestrictions ==============================
const getAllRestrictions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id AS restriccion_id, nombre
       FROM restricciones
       WHERE is_active = TRUE
       ORDER BY id`
    );

    res.json({ restrictions: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo todas las restricciones" });
  }
};

const deleteAccount = async (req, res) => {
  let client;

  try {
    const { password, confirmation } = req.body;
    if (typeof password !== "string" || !password || confirmation !== "DELETE_MY_ACCOUNT") {
      return res.status(400).json({
        code: "ACCOUNT_DELETION_CONFIRMATION_REQUIRED",
        message: "Confirma la eliminacion e ingresa tu contrasena"
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT id, password_hash, rol FROM usuarios WHERE id = $1 FOR UPDATE",
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).json({ code: "ACCOUNT_NOT_FOUND", message: "La cuenta ya no existe" });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await client.query("ROLLBACK");
      return res.status(401).json({ code: "INVALID_ACCOUNT_PASSWORD", message: "La contrasena no es correcta" });
    }

    if (user.rol === "administrador") {
      const adminCount = await client.query(
        "SELECT COUNT(*)::integer AS total FROM usuarios WHERE rol = 'administrador'"
      );
      if (adminCount.rows[0].total <= 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "LAST_ADMIN_ACCOUNT",
          message: "Asigna otro administrador antes de eliminar esta cuenta"
        });
      }
    }

    await client.query("DELETE FROM usuarios WHERE id = $1", [user.id]);
    await client.query("COMMIT");
    return res.json({
      status: "deleted",
      accountDeleted: true,
      deletedAt: new Date().toISOString()
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23503") {
      return res.status(409).json({
        code: "ACCOUNT_DELETION_DEPENDENCY",
        message: "La cuenta tiene datos relacionados que aun no permiten su eliminacion"
      });
    }
    console.error("Error eliminando cuenta", error);
    return res.status(500).json({ error: "Error eliminando la cuenta" });
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  addRestrictions,
  getUserRestrictions,
  getAllRestrictions,
  deleteAccount
};
