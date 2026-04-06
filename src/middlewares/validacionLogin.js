import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 40;

const validacionLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("El email es un dato obligatorio")
    .isLength({ min: 6, max: 120 })
    .withMessage("El email debe contener entre 6 y 120 caracteres")
    .isEmail()
    .withMessage("El email ingresado no es valido")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("La contrasena es un dato obligatorio")
    .isLength({ min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })
    .withMessage(
      `La contrasena debe contener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres`,
    ),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionLogin;
