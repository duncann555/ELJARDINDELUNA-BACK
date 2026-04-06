import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";
import { PEDIDO_ESTADOS } from "../constants/pedidos.js";

const validacionCambioEstado = [
  body("estadoPedido")
    .trim()
    .isIn(PEDIDO_ESTADOS)
  .withMessage("Estado de pedido no valido"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionCambioEstado;
