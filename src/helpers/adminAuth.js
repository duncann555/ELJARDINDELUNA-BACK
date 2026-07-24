import { createHash } from "node:crypto";
import bcrypt from "bcrypt";

export const ADMIN_ROLE = "admin";
export const ADMIN_JWT_ISSUER = "el-jardin-de-luna-backend";
export const ADMIN_JWT_AUDIENCE = "el-jardin-de-luna-admin";

export const getAdminEmail = () =>
  String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

export const getAdminPasswordHash = () =>
  String(process.env.ADMIN_PASSWORD_HASH || "").trim();

export const compareAdminPassword = (password) => {
  const passwordHash = getAdminPasswordHash();
  if (!passwordHash || typeof password !== "string") return false;
  return bcrypt.compare(password, passwordHash);
};

export const getAdminTokenVersion = () => {
  const passwordHash = getAdminPasswordHash();
  return passwordHash
    ? createHash("sha256").update(passwordHash).digest("hex")
    : "";
};

export const isCurrentAdminTokenVersion = (candidate) => {
  const current = getAdminTokenVersion();
  return Boolean(current && candidate && current === candidate);
};

export const getAdminTokenExpiresIn = () =>
  String(process.env.ADMIN_TOKEN_EXPIRES_IN || "30m").trim();
