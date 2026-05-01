import { createHash, timingSafeEqual } from "crypto";

const ADMIN_ROLE = "Administrador";
const DEFAULT_ADMIN_TOKEN_EXPIRES_IN = "30m";

export const esRolAdministrador = (rol) => rol === ADMIN_ROLE;

export const obtenerAdminPassword = () =>
  String(process.env.ADMIN_PASSWORD || "");

export const adminPasswordConfigurada = () =>
  obtenerAdminPassword().trim().length > 0;

export const getAdminTokenExpiresIn = () =>
  String(process.env.ADMIN_TOKEN_EXPIRES_IN || DEFAULT_ADMIN_TOKEN_EXPIRES_IN);

export const getAdminPasswordVersion = () => {
  const password = obtenerAdminPassword();

  if (!password) return "";

  return createHash("sha256").update(password).digest("hex");
};

export const logAdminPasswordStatus = () => {
  const password = obtenerAdminPassword();

  console.log("ADMIN_PASSWORD configurada:", Boolean(password));
  console.log("ADMIN_PASSWORD length:", password.length);
};

export const compararAdminPassword = (candidatePassword) => {
  const configuredPassword = obtenerAdminPassword();
  const candidate = String(candidatePassword || "");

  if (!configuredPassword || !candidate) {
    return false;
  }

  const configuredBuffer = Buffer.from(configuredPassword);
  const candidateBuffer = Buffer.from(candidate);

  if (configuredBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(configuredBuffer, candidateBuffer);
};

export const adminTokenVersionVigente = (tokenVersion) => {
  const currentVersion = getAdminPasswordVersion();

  return Boolean(currentVersion && tokenVersion && tokenVersion === currentVersion);
};
