import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";
import { PEDIDO_ESTADOS } from "../constants/pedidos.js";
import { ESTADOS_PAGO_PEDIDO } from "../constants/pagos.js";

const validacionCambioEstado = [
  body("estadoPedido")
    .trim()
    .isIn(PEDIDO_ESTADOS)
    .withMessage("Estado de pedido no valido"),
  body("estadoPago")
    .optional()
    .trim()
    .isIn(ESTADOS_PAGO_PEDIDO)
    .withMessage("Estado de pago no valido"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionCambioEstado;
