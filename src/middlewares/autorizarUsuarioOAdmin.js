const autorizarUsuarioOAdmin =
  (paramName = "id") =>
  (req, res, next) => {
    const recursoId = req.params?.[paramName];

    if (req.rol === "Administrador" || req.usuarioId === recursoId) {
      return next();
    }

    return res.status(403).json({
      mensaje: "No tienes permisos para acceder a este recurso",
    });
  };

export default autorizarUsuarioOAdmin;
