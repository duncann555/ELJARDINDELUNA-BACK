import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";
import { validarPasswordUsuario } from "./sharedUserValidations.js";

const validacionResetPassword = [
  body("token")
    .trim()
    .notEmpty()
    .withMessage("El token de recuperacion es obligatorio")
    .isLength({ min: 20, max: 200 })
    .withMessage("El token de recuperacion no es valido"),
  validarPasswordUsuario(),
  resultadoValidacion,
];

export default validacionResetPassword;
