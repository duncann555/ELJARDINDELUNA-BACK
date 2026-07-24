const REQUIRED_VARIABLES = [
  "MONGODB_URI",
  "FRONTEND_URL",
  "BACKEND_PUBLIC_URL",
  "MERCADO_PAGO_MODE",
  "JWT_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "SHIPPING_COST",
];

const hasValue = (key) => String(process.env[key] || "").trim().length > 0;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const assertUrl = (key, { production }) => {
  let url;
  try {
    url = new URL(String(process.env[key] || "").trim());
  } catch {
    throw new Error(`${key} debe ser una URL válida`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${key} debe usar HTTP o HTTPS`);
  }
  if (production && url.protocol !== "https:") {
    throw new Error(`${key} debe usar HTTPS en producción`);
  }
};

const assertNumber = (key, { min, max }) => {
  const value = Number(process.env[key]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} debe ser un número entre ${min} y ${max}`);
  }
};

const assertPublicHttpsUrl = (key) => {
  const url = new URL(String(process.env[key] || "").trim());
  if (url.protocol !== "https:" || LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new Error(
      `${key} debe ser una URL HTTPS pública cuando Mercado Pago está configurado`,
    );
  }
};

const validateRuntimeEnv = () => {
  const environment = String(process.env.NODE_ENV || "development").trim();
  const production = environment === "production";
  const validEnvironments = ["development", "test", "production"];

  if (!validEnvironments.includes(environment)) {
    throw new Error("NODE_ENV debe ser development, test o production");
  }

  const missing = REQUIRED_VARIABLES.filter((key) => !hasValue(key));
  if (missing.length > 0) {
    throw new Error(`Faltan variables obligatorias: ${missing.join(", ")}`);
  }

  assertUrl("FRONTEND_URL", { production });
  assertUrl("BACKEND_PUBLIC_URL", { production });

  const corsOrigins = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("invalid-protocol");
      }
      if (production && parsed.protocol !== "https:") {
        throw new Error("not-https");
      }
    } catch {
      throw new Error("CORS_ORIGINS contiene un origen inválido");
    }
  }

  if (!["sandbox", "production"].includes(process.env.MERCADO_PAGO_MODE)) {
    throw new Error("MERCADO_PAGO_MODE debe ser sandbox o production");
  }
  if (production && process.env.MERCADO_PAGO_MODE !== "production") {
    throw new Error(
      "MERCADO_PAGO_MODE debe ser production cuando NODE_ENV=production",
    );
  }
  const mercadoPagoKeys = [
    "MERCADO_PAGO_ACCESS_TOKEN",
    "MERCADO_PAGO_WEBHOOK_SECRET",
  ];
  const configuredMercadoPago = mercadoPagoKeys.filter(hasValue);
  if (
    configuredMercadoPago.length > 0 &&
    configuredMercadoPago.length !== mercadoPagoKeys.length
  ) {
    throw new Error(
      "MERCADO_PAGO_ACCESS_TOKEN y MERCADO_PAGO_WEBHOOK_SECRET deben configurarse juntas",
    );
  }
  if (configuredMercadoPago.length === mercadoPagoKeys.length) {
    assertPublicHttpsUrl("FRONTEND_URL");
    assertPublicHttpsUrl("BACKEND_PUBLIC_URL");
  }
  if (
    production &&
    (!hasValue("MERCADO_PAGO_ACCESS_TOKEN") ||
      !hasValue("MERCADO_PAGO_WEBHOOK_SECRET"))
  ) {
    throw new Error(
      "MERCADO_PAGO_ACCESS_TOKEN y MERCADO_PAGO_WEBHOOK_SECRET son obligatorias en producción",
    );
  }
  if (
    production &&
    /^TEST-/i.test(String(process.env.MERCADO_PAGO_ACCESS_TOKEN).trim())
  ) {
    throw new Error(
      "MERCADO_PAGO_ACCESS_TOKEN no puede ser una credencial TEST- en producción",
    );
  }
  if (String(process.env.JWT_SECRET).length < 32) {
    throw new Error("JWT_SECRET debe contener al menos 32 caracteres");
  }
  if (
    hasValue("MERCADO_PAGO_WEBHOOK_SECRET") &&
    String(process.env.MERCADO_PAGO_WEBHOOK_SECRET).length < 16
  ) {
    throw new Error(
      "MERCADO_PAGO_WEBHOOK_SECRET debe contener al menos 16 caracteres",
    );
  }
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(process.env.ADMIN_PASSWORD_HASH)) {
    throw new Error("ADMIN_PASSWORD_HASH debe ser un hash bcrypt válido");
  }
  const bcryptCost = Number(
    String(process.env.ADMIN_PASSWORD_HASH).slice(4, 6),
  );
  if (production && bcryptCost < 10) {
    throw new Error(
      "ADMIN_PASSWORD_HASH debe usar un costo bcrypt de al menos 10 en producción",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL)) {
    throw new Error("ADMIN_EMAIL no es válido");
  }

  const tokenDuration = String(
    process.env.ADMIN_TOKEN_EXPIRES_IN || "30m",
  ).trim();
  const durationMatch = tokenDuration.match(/^(\d+)(s|m|h)$/);
  const durationMultiplier = { s: 1, m: 60, h: 3600 };
  const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * durationMultiplier[durationMatch[2]]
    : Number.NaN;
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 300 ||
    durationSeconds > 3600
  ) {
    throw new Error(
      "ADMIN_TOKEN_EXPIRES_IN debe durar entre 5 minutos y 1 hora",
    );
  }

  assertNumber("SHIPPING_COST", { min: 0, max: 100000000 });
  if (
    Math.abs(
      Number(process.env.SHIPPING_COST) * 100 -
        Math.round(Number(process.env.SHIPPING_COST) * 100),
    ) >= 1e-8
  ) {
    throw new Error("SHIPPING_COST admite como máximo dos decimales");
  }
  const cloudinaryKeys = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const configuredCloudinary = cloudinaryKeys.filter(hasValue);
  if (
    configuredCloudinary.length > 0 &&
    configuredCloudinary.length !== cloudinaryKeys.length
  ) {
    throw new Error(
      "Las tres variables CLOUDINARY_* deben configurarse juntas",
    );
  }

  return true;
};

export default validateRuntimeEnv;
export { validateRuntimeEnv };
