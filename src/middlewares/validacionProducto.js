import { body } from "express-validator";
import Producto from "../models/producto.js";
import resultadoValidacion from "./resultadoValidacion.js";
import {
  PRODUCTO_CATEGORIAS,
  PRODUCTO_ESTADOS,
} from "../constants/productos.js";

export const validacionProducto = [
  body("nombre")
    .trim()
    .notEmpty()
    .withMessage("El nombre del producto es obligatorio")
    .isLength({ min: 3, max: 100 })
    .withMessage(
      "El nombre del producto debe contener entre 3 y 100 caracteres",
    )
    .custom(async (valor, { req }) => {
      const productoExistente = await Producto.findOne({ nombre: valor });

      if (!productoExistente) {
        return true;
      }

      if (req.params.id && productoExistente._id.toString() === req.params.id) {
        return true;
      }

      throw new Error("Ya existe un producto con este nombre");
    }),
  body("categoria")
    .trim()
    .notEmpty()
    .withMessage("La categoria es un dato obligatorio")
    .isIn(PRODUCTO_CATEGORIAS)
    .withMessage(
      `La categoria debe ser valida (${PRODUCTO_CATEGORIAS.join(", ")})`,
    ),
  body("stock")
    .notEmpty()
    .withMessage("El stock es un dato obligatorio")
    .isInt({ min: 0 })
    .withMessage("El stock debe ser un numero entero mayor o igual a 0"),
  body("descripcion")
    .trim()
    .notEmpty()
    .withMessage("La descripcion es un dato obligatorio")
    .isLength({ min: 10, max: 1000 })
    .withMessage("La descripcion debe contener entre 10 y 1000 caracteres"),
  body("estado")
    .optional()
    .isIn(PRODUCTO_ESTADOS)
    .withMessage("El estado debe ser 'Activo' o 'Inactivo'"),
  body("precio")
    .notEmpty()
    .withMessage("El precio es un dato obligatorio")
    .isFloat({ min: 0, max: 1000000 })
    .withMessage("El precio debe ser un numero valido entre 0 y 1.000.000"),
  body("oferta").optional().isBoolean(),
  body("destacado").optional().isBoolean(),
  resultadoValidacion,
];
