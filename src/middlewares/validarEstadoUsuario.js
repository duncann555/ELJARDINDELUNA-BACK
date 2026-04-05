import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validarEstadoUsuario = [
  body("estado")
    .optional()
    .isIn(["Activo", "Suspendido"])
    .withMessage("El estado debe ser 'Activo' o 'Suspendido'"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validarEstadoUsuario;
