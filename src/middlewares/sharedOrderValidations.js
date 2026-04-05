import { body } from "express-validator";

export const CODIGO_POSTAL_REGEX = /^[A-Za-z0-9-]{3,10}$/;
export const TELEFONO_REGEX = /^\d{8,15}$/;

export const crearValidacionesProductosPedido = ({ maxItems = 50 } = {}) => [
  body("productos")
    .isArray({ min: 1, max: maxItems })
    .withMessage(`Debes enviar entre 1 y ${maxItems} productos`),
  body("productos.*.producto")
    .notEmpty()
    .withMessage("El ID del producto es obligatorio")
    .isMongoId()
    .withMessage("El ID del producto no es valido"),
  body("productos.*.cantidad")
    .isInt({ min: 1, max: 50 })
    .withMessage("La cantidad debe ser un entero entre 1 y 50"),
];

export const crearValidacionesDatosEnvio = ({
  maxDomicilio = 160,
} = {}) => [
  body("envio.provincia")
    .trim()
    .notEmpty()
    .withMessage("La provincia es obligatoria")
    .isLength({ min: 2, max: 80 })
    .withMessage("La provincia no es valida"),
  body("envio.ciudad")
    .trim()
    .notEmpty()
    .withMessage("La ciudad es obligatoria")
    .isLength({ min: 2, max: 80 })
    .withMessage("La ciudad no es valida"),
  body("envio.domicilio")
    .trim()
    .notEmpty()
    .withMessage("El domicilio es obligatorio")
    .isLength({ min: 5, max: maxDomicilio })
    .withMessage("El domicilio no es valido"),
  body("envio.celular")
    .customSanitizer((value) => String(value || "").replace(/\D/g, ""))
    .notEmpty()
    .withMessage("El celular es obligatorio")
    .matches(TELEFONO_REGEX)
    .withMessage("El celular no es valido"),
  body("envio.entreCalles")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 120 })
    .withMessage("Entre calles no es valido"),
  body("envio.referencia")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 180 })
    .withMessage("La referencia no es valida"),
  body("envio.codigoPostal")
    .trim()
    .notEmpty()
    .withMessage("El codigo postal es obligatorio")
    .matches(CODIGO_POSTAL_REGEX)
    .withMessage("El codigo postal no es valido"),
];
