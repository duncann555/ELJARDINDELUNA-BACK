import { body, param } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validarActivoProducto = [
  param("id").isMongoId().withMessage("El ID de producto no es válido."),
  body("active")
    .isBoolean()
    .withMessage("active debe ser verdadero o falso.")
    .toBoolean(),
  resultadoValidacion,
];

export default validarActivoProducto;
