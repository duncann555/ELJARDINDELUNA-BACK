import { validationResult } from "express-validator";

const resultadoValidacion = (req, res, next) => {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    return res.status(400).json({
      mensaje: "Hay datos no validos en la solicitud",
      errors: errores.array(),
    });
  }
  next();
};

export default resultadoValidacion;
