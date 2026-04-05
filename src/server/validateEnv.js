const hasValue = (key) => String(process.env[key] || "").trim().length > 0;

const DEFAULT_PRODUCTION_FRONTEND_URL =
  "https://eljardindeluna-frontend.vercel.app";

const PRODUCTION_REQUIRED_ENV = ["MONGODB", "SECRETJWT"];

const normalizeUrlValue = (value, { allowLocalhost = false } = {}) => {
  const rawValue = String(value || "").trim().replace(/\/+$/, "");

  if (!rawValue) {
    return "";
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  const isLocalhostValue =
    rawValue === "localhost" ||
    rawValue === "127.0.0.1" ||
    rawValue.startsWith("localhost:") ||
    rawValue.startsWith("127.0.0.1:");

  if (allowLocalhost && isLocalhostValue) {
    return `http://${rawValue}`;
  }

  return `https://${rawValue}`;
};

const validateHttpsUrl = (key, { allowLocalhost = false } = {}) => {
  const rawValue = normalizeUrlValue(process.env[key], { allowLocalhost });

  if (!rawValue) {
    return;
  }

  process.env[key] = rawValue;

  let parsedUrl;

  try {
    parsedUrl = new URL(rawValue);
  } catch {
    throw new Error(`La variable ${key} no contiene una URL valida`);
  }

  const isLocalhost =
    parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";

  if (allowLocalhost && isLocalhost) {
    return;
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`La variable ${key} debe usar https en produccion`);
  }
};

const ensureProductionFrontendUrl = () => {
  if (!hasValue("FRONTEND_URL")) {
    process.env.FRONTEND_URL = DEFAULT_PRODUCTION_FRONTEND_URL;
    console.warn(
      `[env] FRONTEND_URL no esta configurada. Se usara ${DEFAULT_PRODUCTION_FRONTEND_URL}`,
    );
    return;
  }

  try {
    validateHttpsUrl("FRONTEND_URL", { allowLocalhost: false });
  } catch (error) {
    process.env.FRONTEND_URL = DEFAULT_PRODUCTION_FRONTEND_URL;
    console.warn(
      `[env] ${error.message}. Se usara ${DEFAULT_PRODUCTION_FRONTEND_URL}`,
    );
  }
};

export const validateRuntimeEnv = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const missingRequired = PRODUCTION_REQUIRED_ENV.filter((key) => !hasValue(key));

  if (isProduction && missingRequired.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias para produccion: ${missingRequired.join(", ")}`,
    );
  }

  if (hasValue("MAIL_USER") !== hasValue("MAIL_PASS")) {
    console.warn(
      "[env] MAIL_USER y MAIL_PASS deben configurarse juntos para enviar correos",
    );
  }

  if (!hasValue("MP_ACCESS_TOKEN")) {
    console.warn(
      "[env] MP_ACCESS_TOKEN no esta configurado. Mercado Pago no podra iniciar cobros.",
    );
  }

  if (
    !hasValue("CLOUDINARY_CLOUD_NAME") ||
    !hasValue("CLOUDINARY_API_KEY") ||
    !hasValue("CLOUDINARY_API_SECRET")
  ) {
    console.warn(
      "[env] Cloudinary no esta completamente configurado. Las cargas de imagenes pueden fallar.",
    );
  }

  if (isProduction) {
    ensureProductionFrontendUrl();
  } else {
    validateHttpsUrl("FRONTEND_URL", { allowLocalhost: true });
  }

  if (!hasValue("ADMIN_EMAIL")) {
    console.warn(
      "[env] ADMIN_EMAIL no esta configurado. La cuenta admin no se filtrara en el listado de usuarios.",
    );
  }
};

export default validateRuntimeEnv;
