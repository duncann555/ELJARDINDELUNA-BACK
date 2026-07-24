import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validarLoginAdmin = [
  body("email")
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage("El correo electrónico no es válido.")
    .isLength({ max: 160 })
    .withMessage("El correo electrónico es demasiado largo."),
  body("password")
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage("La contraseña no es válida."),
  resultadoValidacion,
];

export default validarLoginAdmin;
