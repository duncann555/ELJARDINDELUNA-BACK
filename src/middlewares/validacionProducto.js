import { body, param } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

export const validarProducto = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage("El nombre debe tener entre 2 y 120 caracteres."),
  body("slug")
    .optional({ values: "falsy" })
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("El slug solo admite minúsculas, números y guiones."),
  body("botanicalName")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 180 })
    .withMessage("El nombre botánico es demasiado largo."),
  body("category")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("La categoría debe tener entre 2 y 100 caracteres."),
  body("description")
    .trim()
    .isLength({ min: 10, max: 4000 })
    .withMessage("La descripción debe tener entre 10 y 4000 caracteres."),
  body("presentation")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 240 })
    .withMessage("La presentación es demasiado larga."),
  body("ingredients")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 4000 })
    .withMessage("Los ingredientes son demasiado largos."),
  body("warnings")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 4000 })
    .withMessage("Las advertencias son demasiado largas."),
  body("price")
    .isFloat({ min: 0, max: 100000000 })
    .withMessage("El precio debe ser un número no negativo.")
    .custom(
      (value) =>
        Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) <
        1e-8,
    )
    .withMessage("El precio admite como máximo dos decimales.")
    .toFloat(),
  body("stock")
    .isInt({ min: 0, max: 1000000 })
    .withMessage("El stock debe ser un entero no negativo.")
    .toInt(),
  body("active")
    .optional()
    .isBoolean()
    .withMessage("active debe ser verdadero o falso.")
    .toBoolean(),
  body("images")
    .optional()
    .custom((value) => {
      let images = value;
      if (typeof value === "string" && value.trim().startsWith("[")) {
        images = JSON.parse(value);
      } else if (typeof value === "string") {
        images = [value];
      }
      if (!Array.isArray(images) || images.length > 8) return false;
      return images.every((image) => {
        try {
          if (String(image).length > 2048) return false;
          return ["http:", "https:"].includes(
            new URL(String(image)).protocol,
          );
        } catch {
          return false;
        }
      });
    })
    .withMessage("Las imágenes no tienen un formato válido."),
  resultadoValidacion,
];

export const validarIdProducto = [
  param("id").isMongoId().withMessage("El ID de producto no es válido."),
  resultadoValidacion,
];

export default validarProducto;
