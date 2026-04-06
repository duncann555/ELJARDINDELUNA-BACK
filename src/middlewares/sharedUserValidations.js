import { body } from "express-validator";
import Usuario from "../models/usuario.js";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 40;

export const validarNombreUsuario = () =>
  body("nombre")
    .trim()
    .notEmpty()
    .withMessage("El nombre es un dato obligatorio")
    .isLength({ min: 2, max: 50 })
    .withMessage("El nombre debe contener entre 2 y 50 caracteres");

export const validarApellidoUsuario = () =>
  body("apellido")
    .trim()
    .notEmpty()
    .withMessage("El apellido es un dato obligatorio")
    .isLength({ min: 2, max: 50 })
    .withMessage("El apellido debe contener entre 2 y 50 caracteres");

export const validarTelefonoUsuario = ({ optional = false } = {}) => {
  const chain = body("telefono").trim();

  if (optional) {
    chain.optional({ values: "falsy" });
  } else {
    chain.notEmpty().withMessage("El telefono es un dato obligatorio");
  }

  return chain
    .isNumeric()
    .withMessage("El telefono debe contener solo numeros")
    .isLength({ min: 8, max: 15 })
    .withMessage("El telefono debe contener entre 8 y 15 digitos");
};

export const validarEmailUsuario = ({ allowCurrentUser = false } = {}) =>
  body("email")
    .trim()
    .notEmpty()
    .withMessage("El email es un dato obligatorio")
    .isLength({ min: 6, max: 120 })
    .withMessage("El email debe contener entre 6 y 120 caracteres")
    .isEmail()
    .withMessage("El email ingresado no es valido")
    .normalizeEmail()
    .custom(async (valor, { req }) => {
      const filtro = { email: valor };

      if (allowCurrentUser && req.params?.id) {
        filtro._id = { $ne: req.params.id };
      }

      const correoExistente = await Usuario.findOne(filtro);

      if (correoExistente) {
        throw new Error("El correo ingresado ya existe");
      }

      return true;
    });

export const validarPasswordUsuario = ({ optional = false } = {}) => {
  const chain = body("password");

  if (optional) {
    chain.optional();
  } else {
    chain.notEmpty().withMessage("La contrasena es un dato obligatorio");
  }

  return chain
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(
      `La contrasena debe contener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    )
    .isLength({ max: PASSWORD_MAX_LENGTH })
    .withMessage(
      `La contrasena no puede superar los ${PASSWORD_MAX_LENGTH} caracteres`,
    );
};

