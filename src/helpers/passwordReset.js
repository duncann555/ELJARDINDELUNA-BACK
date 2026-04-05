import { createHash, randomBytes } from "node:crypto";

const DEFAULT_FRONTEND_URL = "http://localhost:5173";
const DEFAULT_RESET_TTL_MINUTES = 30;

const sanitizeBaseUrl = (value) => {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_FRONTEND_URL;
};

export const getPasswordResetTokenTtlMinutes = () => {
  const configuredValue = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES);

  if (!Number.isFinite(configuredValue) || configuredValue <= 0) {
    return DEFAULT_RESET_TTL_MINUTES;
  }

  return configuredValue;
};

export const generatePasswordResetToken = () => randomBytes(32).toString("hex");

export const hashPasswordResetToken = (token) =>
  createHash("sha256").update(String(token || "")).digest("hex");

export const buildPasswordResetExpiryDate = () =>
  new Date(Date.now() + getPasswordResetTokenTtlMinutes() * 60 * 1000);

export const buildPasswordResetUrl = (token) => {
  const frontendBaseUrl = sanitizeBaseUrl(process.env.FRONTEND_URL);
  return `${frontendBaseUrl}/restablecer-password?token=${encodeURIComponent(token)}`;
};
