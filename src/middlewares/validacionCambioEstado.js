import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const ESTADOS_PEDIDO_VALIDOS = [
  "En espera de pago",
  "Preparando env\u00edo",
  "Despachado",
  "Entregado",
  "Cancelado",
];

const validacionCambioEstado = [
  body("estadoPedido")
    .optional()
    .trim()
    .isIn(ESTADOS_PEDIDO_VALIDOS)
    .withMessage("Estado de pedido no valido"),
  body("trackingId")
    .optional()
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage("Tracking no valido"),
  body().custom((_, { req }) => {
    const tieneEstado =
      typeof req.body?.estadoPedido === "string" &&
      req.body.estadoPedido.trim().length > 0;
    const tieneTracking =
      typeof req.body?.trackingId === "string" &&
      req.body.trackingId.trim().length > 0;

    if (!tieneEstado && !tieneTracking) {
      throw new Error("Debes enviar estadoPedido o trackingId");
    }

    return true;
  }),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionCambioEstado;
