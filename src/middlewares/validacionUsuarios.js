import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";
import {
  validarApellidoUsuario,
  validarEmailUsuario,
  validarNombreUsuario,
  validarPasswordUsuario,
  validarTelefonoUsuario,
} from "./sharedUserValidations.js";

const validacionUsuarios = [
  validarNombreUsuario(),
  validarApellidoUsuario(),
  validarTelefonoUsuario(),
  validarEmailUsuario(),
  validarPasswordUsuario(),
  body("rol")
    .not()
    .exists()
    .withMessage("No puedes asignar el rol al registrarte"),
  body("estado")
    .not()
    .exists()
    .withMessage("No puedes definir el estado al registrarte"),
  resultadoValidacion,
];

export default validacionUsuarios;
