import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

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
    .isLength({ min: 8, max: 16 })
    .withMessage("La contrasena debe contener entre 8 y 16 caracteres"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionLogin;
