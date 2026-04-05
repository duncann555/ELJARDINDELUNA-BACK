import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validacionLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("El email es un dato obligatorio")
    .isEmail()
    .withMessage("El email ingresado no es valido")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("La contrasena es un dato obligatorio")
    .isLength({ min: 8, max: 128 })
    .withMessage("La contrasena debe contener entre 8 y 128 caracteres"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionLogin;
