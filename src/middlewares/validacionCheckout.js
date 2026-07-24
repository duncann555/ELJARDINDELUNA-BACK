import { body, header } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";
import {
  DELIVERY_METHOD_HOME,
  DELIVERY_METHODS,
} from "../constants/pedidos.js";

const validarCheckout = [
  header("Idempotency-Key")
    .trim()
    .isLength({ min: 16, max: 200 })
    .withMessage("Idempotency-Key debe tener entre 16 y 200 caracteres.")
    .matches(/^[A-Za-z0-9._:-]+$/)
    .withMessage("Idempotency-Key contiene caracteres no válidos."),
  body("cliente")
    .isObject()
    .withMessage("Los datos del cliente son obligatorios."),
  body("cliente.nombre")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("El nombre debe tener entre 2 y 50 caracteres."),
  body("cliente.apellido")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("El apellido debe tener entre 2 y 50 caracteres."),
  body("cliente.telefono")
    .customSanitizer((value) => String(value || "").replace(/\D/g, ""))
    .matches(/^\d{8,15}$/)
    .withMessage("El teléfono debe tener entre 8 y 15 dígitos."),
  body("cliente.email")
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage("El correo electrónico no es válido.")
    .isLength({ max: 160 })
    .withMessage("El correo electrónico es demasiado largo."),
  body("entrega")
    .isObject()
    .withMessage("Los datos de entrega son obligatorios."),
  body("entrega.metodo")
    .isIn(DELIVERY_METHODS)
    .withMessage("El método de entrega no es válido."),
  body("entrega").custom((delivery) => {
    if (delivery?.metodo !== DELIVERY_METHOD_HOME) return true;

    const requiredFields = [
      ["provincia", "La provincia es obligatoria."],
      ["localidad", "La localidad es obligatoria."],
      ["codigoPostal", "El código postal es obligatorio."],
      ["direccion", "La dirección es obligatoria."],
    ];
    for (const [field, message] of requiredFields) {
      if (!String(delivery?.[field] || "").trim()) throw new Error(message);
    }
    return true;
  }),
  body("entrega.provincia")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 100 })
    .withMessage("La provincia es demasiado larga."),
  body("entrega.localidad")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 100 })
    .withMessage("La localidad es demasiado larga."),
  body("entrega.codigoPostal")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 12 })
    .withMessage("El código postal es demasiado largo.")
    .matches(/^[A-Za-z0-9 -]*$/)
    .withMessage("El código postal no es válido."),
  body("entrega.direccion")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 180 })
    .withMessage("La dirección es demasiado larga."),
  body("entrega.aclaraciones")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Las aclaraciones son demasiado largas."),
  body("productos")
    .isArray({ min: 1, max: 50 })
    .withMessage("El carrito debe contener entre 1 y 50 líneas."),
  body("productos.*.productoId")
    .isMongoId()
    .withMessage("Uno de los productos no tiene un ID válido."),
  body("productos.*.cantidad")
    .isInt({ min: 1, max: 50 })
    .withMessage("La cantidad debe ser un entero entre 1 y 50.")
    .toInt(),
  resultadoValidacion,
];

export default validarCheckout;
