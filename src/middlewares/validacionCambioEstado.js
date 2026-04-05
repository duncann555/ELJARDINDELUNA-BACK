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
    .trim()
    .isIn(ESTADOS_PEDIDO_VALIDOS)
  .withMessage("Estado de pedido no valido"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionCambioEstado;
