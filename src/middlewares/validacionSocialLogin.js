import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";
import { validarTelefonoUsuario } from "./sharedUserValidations.js";

const validacionSocialLogin = [
  body("provider")
    .trim()
    .notEmpty()
    .withMessage("El proveedor social es obligatorio")
    .isIn(["google", "facebook"])
    .withMessage("El proveedor social no es valido"),
  body("idToken")
    .trim()
    .notEmpty()
    .withMessage("El token de autenticacion social es obligatorio"),
  validarTelefonoUsuario({ optional: true }),
  resultadoValidacion,
];

export default validacionSocialLogin;
