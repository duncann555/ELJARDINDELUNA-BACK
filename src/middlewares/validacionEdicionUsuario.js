import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";
import {
  validarApellidoUsuario,
  validarEmailUsuario,
  validarNombreUsuario,
  validarPasswordUsuario,
  validarTelefonoUsuario,
} from "./sharedUserValidations.js";

const validacionEdicionUsuario = [
  validarNombreUsuario(),
  validarApellidoUsuario(),
  validarTelefonoUsuario(),
  validarEmailUsuario({ allowCurrentUser: true }),
  validarPasswordUsuario({ optional: true }),
  body("rol")
    .optional()
    .isIn(["Administrador", "Usuario"])
    .withMessage("El rol debe ser 'Administrador' o 'Usuario'"),
  resultadoValidacion,
];

export default validacionEdicionUsuario;
