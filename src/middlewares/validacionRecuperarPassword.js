import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validacionRecuperarPassword = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("El email es un dato obligatorio")
    .isEmail()
    .withMessage("El email ingresado no es valido")
    .normalizeEmail(),
  resultadoValidacion,
];

export default validacionRecuperarPassword;
