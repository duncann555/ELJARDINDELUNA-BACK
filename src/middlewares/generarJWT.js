import jwt from "jsonwebtoken";
import {
  ADMIN_JWT_AUDIENCE,
  ADMIN_JWT_ISSUER,
  ADMIN_ROLE,
  getAdminEmail,
  getAdminTokenExpiresIn,
  getAdminTokenVersion,
} from "../helpers/adminAuth.js";
import AppError from "../helpers/AppError.js";

const generarAdminJWT = () => {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new AppError(
      500,
      "JWT_NOT_CONFIGURED",
      "La autenticación administrativa no está configurada.",
    );
  }

  return jwt.sign(
    {
      role: ADMIN_ROLE,
      email: getAdminEmail(),
      tokenVersion: getAdminTokenVersion(),
    },
    secret,
    {
      algorithm: "HS256",
      issuer: ADMIN_JWT_ISSUER,
      audience: ADMIN_JWT_AUDIENCE,
      subject: "admin",
      expiresIn: getAdminTokenExpiresIn(),
    },
  );
};

export default generarAdminJWT;
