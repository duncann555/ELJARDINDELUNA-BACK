import nodemailer from "nodemailer";

const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_STORE_NAME = "El Jardin de Luna";
const DEFAULT_FROM_NAME = "El Jard\u00EDn de Luna";

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getStoreName = () =>
  String(process.env.PASSWORD_RESET_STORE_NAME || DEFAULT_STORE_NAME).trim() ||
  DEFAULT_STORE_NAME;

const getMailUser = () => String(process.env.MAIL_USER || "").trim();

const getMailPass = () =>
  String(process.env.MAIL_PASS || "")
    .replace(/\s+/g, "")
    .trim();

const getFromAddress = () => {
  const mailUser = getMailUser();

  if (!mailUser) {
    return "";
  }

  return `"${DEFAULT_FROM_NAME}" <${mailUser}>`;
};

const canUseGmailTransport = () => Boolean(getMailUser() && getMailPass());

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: getMailUser(),
        pass: getMailPass(),
      },
    });
  }

  return transporter;
};

const buildPasswordResetEmailHtml = ({ nombre, resetUrl, storeName }) => {
  const escapedName = escapeHtml(nombre || "Hola");
  const escapedUrl = escapeHtml(resetUrl);
  const escapedStore = escapeHtml(storeName);

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Restablece tu contrasena de ${escapedStore} con este enlace seguro.
    </div>
    <div style="background:#f5f1e8;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dcc8;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,0.08);">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#22324a 0%,#2d643f 100%);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.86;">${escapedStore}</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Recuperar contrase\u00F1a</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;line-height:1.7;">Hola ${escapedName},</p>
          <p style="margin:0 0 16px;line-height:1.7;">
            recibimos una solicitud para restablecer la contrase\u00F1a de tu cuenta en ${escapedStore}.
          </p>
          <p style="margin:0 0 24px;line-height:1.7;">
            Si fuiste vos, usa el siguiente bot\u00F3n para definir una nueva clave. Por seguridad, el enlace vence pronto.
          </p>
          <div style="margin:0 0 28px;text-align:center;">
            <a href="${escapedUrl}" style="background:#2d643f;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;display:inline-block;font-weight:700;">
              Restablecer contrase\u00F1a
            </a>
          </div>
          <p style="margin:0 0 12px;line-height:1.7;">
            Si el bot\u00F3n no funciona, copia y pega este enlace en tu navegador:
          </p>
          <p style="margin:0 0 24px;word-break:break-all;color:#22324a;font-size:14px;line-height:1.7;">
            ${escapedUrl}
          </p>
          <p style="margin:0;line-height:1.7;color:#4b5563;">
            Si no pediste este cambio, puedes ignorar este correo con tranquilidad.
          </p>
        </div>
      </div>
    </div>
  `;
};

const buildPasswordResetEmailText = ({ nombre, resetUrl, storeName }) =>
  `${nombre || "Hola"}, recibimos una solicitud para cambiar la contrase\u00F1a de tu cuenta en ${storeName}.\n\nUsa este enlace para restablecerla:\n${resetUrl}\n\nSi no pediste este cambio, puedes ignorar este correo.`;

export const enviarEmailReset = async ({ email, nombre, resetLink }) => {
  const storeName = getStoreName();

  if (!canUseGmailTransport()) {
    const previewMessage = `[email][reset-password][preview] ${email}: ${resetLink}`;

    if (!isProduction) {
      console.info(previewMessage);
    } else {
      console.error(
        "[email][reset-password] MAIL_USER/MAIL_PASS no estan configurados",
      );
    }

    return {
      delivered: false,
      previewUrl: isProduction ? "" : resetLink,
      provider: "preview",
    };
  }

  const mailOptions = {
    from: getFromAddress(),
    to: email,
    replyTo: getMailUser(),
    subject: "Recuperar contrase\u00F1a",
    html: buildPasswordResetEmailHtml({
      nombre,
      resetUrl: resetLink,
      storeName,
    }),
    text: buildPasswordResetEmailText({
      nombre,
      resetUrl: resetLink,
      storeName,
    }),
  };

  try {
    await getTransporter().sendMail(mailOptions);
  } catch (error) {
    console.error("[email][reset-password] Error enviando correo con Gmail:", error);

    return {
      delivered: false,
      previewUrl: isProduction ? "" : resetLink,
      provider: "gmail",
      error,
    };
  }

  return {
    delivered: true,
    provider: "gmail",
  };
};

export const sendPasswordResetEmail = async ({ toEmail, nombre, resetUrl }) =>
  enviarEmailReset({
    email: toEmail,
    nombre,
    resetLink: resetUrl,
  });
