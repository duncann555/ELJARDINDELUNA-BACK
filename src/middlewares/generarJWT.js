import jwt from "jsonwebtoken";

const JWT_ISSUER = "el-jardin-de-luna-backend";

const generarJWT = (uid, nombre, rol, email) => {
  return new Promise((resolve, reject) => {
    const secret = process.env.SECRETJWT;
    const payload = { uid, nombre, rol, email };

    if (!secret) {
      reject("No se pudo generar el token");
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
        if (err) {
          console.log(err);
          reject("No se pudo generar el token");
          return;
        }

        resolve(token);
      },
    );
  });
};

export default generarJWT;
