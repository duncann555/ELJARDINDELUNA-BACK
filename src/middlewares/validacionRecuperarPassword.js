import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validacionRecuperarPassword = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("El email es un dato obligatorio")
    .isLength({ min: 6, max: 120 })
    .withMessage("El email debe contener entre 6 y 120 caracteres")
    .isEmail()
    .withMessage("El email ingresado no es valido")
    .normalizeEmail(),
  resultadoValidacion,
];

export default validacionRecuperarPassword;
