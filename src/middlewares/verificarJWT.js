import jwt from "jsonwebtoken";
import {
  ADMIN_JWT_AUDIENCE,
  ADMIN_JWT_ISSUER,
  ADMIN_ROLE,
  getAdminEmail,
  isCurrentAdminTokenVersion,
} from "../helpers/adminAuth.js";

const unauthorized = (res) =>
  res.status(401).json({
    error: {
      code: "INVALID_ADMIN_SESSION",
      message: "La sesión administrativa no es válida.",
    },
  });

const verificarAdminJWT = (req, res, next) => {
  const authorization = String(req.get("Authorization") || "");
  if (!authorization.startsWith("Bearer ")) return unauthorized(res);

  const token = authorization.slice(7).trim();
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    return res.status(500).json({
      error: {
        code: "JWT_NOT_CONFIGURED",
        message: "La autenticación administrativa no está configurada.",
      },
    });
  }

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: ADMIN_JWT_ISSUER,
      audience: ADMIN_JWT_AUDIENCE,
      subject: "admin",
    });

    if (
      payload.role !== ADMIN_ROLE ||
      payload.email !== getAdminEmail() ||
      !isCurrentAdminTokenVersion(payload.tokenVersion)
    ) {
      return unauthorized(res);
    }

    req.admin = { email: payload.email };
    return next();
  } catch {
    return unauthorized(res);
  }
};

export default verificarAdminJWT;
