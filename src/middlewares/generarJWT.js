import jwt from "jsonwebtoken";
import {
  esRolAdministrador,
  getAdminPasswordVersion,
  getAdminTokenExpiresIn,
} from "../helpers/adminAuth.js";

const JWT_ISSUER = "el-jardin-de-luna-backend";

const generarJWT = (uid, nombre, rol, email) => {
  return new Promise((resolve, reject) => {
    const secret = process.env.SECRETJWT;
    const esAdmin = esRolAdministrador(rol);
    const payload = {
      uid,
      nombre,
      rol,
      email,
      ...(esAdmin ? { adminPasswordVersion: getAdminPasswordVersion() } : {}),
    };
    const tokenError = new Error("No se pudo generar el token");

    if (!secret) {
      reject(tokenError);
      return;
    }

    jwt.sign(
      payload,
      secret,
      {
        expiresIn: esAdmin ? getAdminTokenExpiresIn() : "4h",
        algorithm: "HS256",
        issuer: JWT_ISSUER,
        subject: String(uid),
      },
      (err, token) => {
        if (err || !token) {
          console.error("[jwt] Error al generar token:", err || tokenError);
          reject(tokenError);
          return;
        }

        resolve(token);
      },
    );
  });
};

export default generarJWT;
