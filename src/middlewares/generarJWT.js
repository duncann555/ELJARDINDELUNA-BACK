import jwt from "jsonwebtoken";

const JWT_ISSUER = "el-jardin-de-luna-backend";

const generarJWT = (uid, nombre, rol, email) => {
  return new Promise((resolve, reject) => {
    const secret = process.env.SECRETJWT;
    const payload = { uid, nombre, rol, email };
    const tokenError = new Error("No se pudo generar el token");

    if (!secret) {
      reject(tokenError);
      return;
    }

    jwt.sign(
      payload,
      secret,
      {
        expiresIn: "4h",
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
