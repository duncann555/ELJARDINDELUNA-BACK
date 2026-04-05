export const EsAdmin = (req, res, next) => {
  // Verificamos si verificarJWT hizo su trabajo
  if (!req.rol) {
    return res.status(500).json({ 
      mensaje: "Se quiere verificar el rol sin validar el token primero" 
    });
  }

  if (req.rol !== "Administrador") {
    return res.status(403).json({ 
      mensaje: "Acceso denegado: Se requiere rol de Administrador" 
    });
  }

  next();
};