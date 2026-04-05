import { query } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";
import {
  CODIGO_POSTAL_REGEX,
  crearValidacionesDatosEnvio,
  crearValidacionesProductosPedido,
} from "./sharedOrderValidations.js";

export const validacionBusquedaLocalidades = [
  query("q")
    .optional()
    .trim()
    .isLength({ min: 3, max: 80 })
    .withMessage("La busqueda debe tener entre 3 y 80 caracteres"),
  query("codigoPostal")
    .optional()
    .trim()
    .matches(CODIGO_POSTAL_REGEX)
    .withMessage("El codigo postal no es valido"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage("El limite debe estar entre 1 y 20"),
  query().custom((_, { req }) => {
    const q = String(req.query?.q || "").trim();
    const codigoPostal = String(req.query?.codigoPostal || "").trim();

    if (!q && !codigoPostal) {
      throw new Error("Debes enviar q o codigoPostal");
    }

    return true;
  }),
  resultadoValidacion,
];

export const validacionCotizacionEnvio = [
  ...crearValidacionesProductosPedido({ maxItems: 20 }),
  ...crearValidacionesDatosEnvio(),
  resultadoValidacion,
];
