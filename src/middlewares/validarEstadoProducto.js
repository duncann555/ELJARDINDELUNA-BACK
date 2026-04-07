import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validarEstadoProducto = [
  body("estado")
    .notEmpty()
    .withMessage("El estado es obligatorio")
    .isIn(["Activo", "Inactivo"])
    .withMessage("El estado debe ser 'Activo' o 'Inactivo'"),
  resultadoValidacion,
];

export default validarEstadoProducto;
