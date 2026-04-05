import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validacionCarrito = [
  body("carrito")
    .isArray({ max: 50 })
    .withMessage("El carrito debe ser un arreglo valido"),
  body("carrito.*.productoId")
    .notEmpty()
    .withMessage("Cada item del carrito debe incluir productoId")
    .isMongoId()
    .withMessage("productoId debe ser un ID valido"),
  body("carrito.*.nombre")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage("El nombre del producto no es valido"),
  body("carrito.*.precio")
    .optional()
    .isFloat({ min: 0, max: 1000000 })
    .withMessage("El precio del producto no es valido"),
  body("carrito.*.cantidad")
    .isInt({ min: 1, max: 50 })
    .withMessage("La cantidad debe ser un entero entre 1 y 50"),
  body("carrito.*.imagenUrl")
    .optional({ checkFalsy: true })
    .isURL({
      protocols: ["http", "https"],
      require_protocol: true,
    })
    .withMessage("La URL de imagen no es valida"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionCarrito;
