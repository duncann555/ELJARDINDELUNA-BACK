import jwt from "jsonwebtoken";

const JWT_ISSUER = "essenzia-backend";

const obtenerTokenDesdeRequest = (req) => {
  const tokenHeader = req.header("x-token");

  if (tokenHeader) {
    return tokenHeader;
  }

  const authorization = req.header("Authorization") || "";

  if (authorization.startsWith("Bearer ")) {
    return authorization.slice(7).trim();
  }

  return "";
};

const verificarJWT = (req, res, next) => {
  try {
    const token = obtenerTokenDesdeRequest(req);
    const secret = process.env.SECRETJWT;

    if (!token) {
      return res.status(401).json({ mensaje: "No hay token en la peticion" });
    }

    if (!secret) {
      return res.status(500).json({ mensaje: "La autenticacion no esta configurada" });
    }

    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
    });

    req.usuarioId = payload.uid;
    req.rol = payload.rol;
    req.email = payload.email;

    next();
  } catch {
    return res.status(401).json({ mensaje: "El token no es valido" });
  }
};

export default verificarJWT;
