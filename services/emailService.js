const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const fromEmail = process.env.RESEND_FROM_EMAIL || "NutriEdu <onboarding@resend.dev>";

const getFrontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const sendEmail = async ({ to, subject, html, text }) => {
  if (!resend) {
    console.warn(`RESEND_API_KEY is not configured. Skipping email to ${to}: ${subject}`);
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject,
    html,
    text
  });

  if (error) {
    throw error;
  }

  return data;
};

const sendWelcomeEmail = async ({ to, name }) => {
  const displayName = name || "usuario";
  const htmlName = escapeHtml(displayName);
  const appUrl = getFrontendUrl();

  return sendEmail({
    to,
    subject: "Bienvenido a NutriEdu",
    text: `Hola ${displayName}, bienvenido a NutriEdu. Empieza configurando tus restricciones alimentarias en ${appUrl}/profile`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <h1 style="color: #15803d;">Bienvenido a NutriEdu</h1>
        <p>Hola ${htmlName}, tu cuenta fue creada correctamente.</p>
        <p>Configura tus restricciones alimentarias para recibir recetas y planes más seguros para ti.</p>
        <p>
          <a href="${appUrl}/profile" style="background: #16a34a; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Completar mi perfil
          </a>
        </p>
      </div>
    `
  });
};

const sendPasswordResetEmail = async ({ to, name, token }) => {
  const displayName = name || "usuario";
  const htmlName = escapeHtml(displayName);
  const resetUrl = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  return sendEmail({
    to,
    subject: "Restablece tu contraseña de NutriEdu",
    text: `Hola ${displayName}, restablece tu contraseña aquí: ${resetUrl}. Este enlace vence en 1 hora.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <h1 style="color: #15803d;">Restablece tu contraseña</h1>
        <p>Hola ${htmlName}, recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Este enlace vence en 1 hora. Si no hiciste esta solicitud, puedes ignorar este correo.</p>
        <p>
          <a href="${resetUrl}" style="background: #16a34a; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Crear nueva contraseña
          </a>
        </p>
      </div>
    `
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail
};
