import { body, param } from "express-validator";
import { ORDER_STATUSES } from "../constants/pedidos.js";
import resultadoValidacion from "./resultadoValidacion.js";

export const validarIdPedido = [
  param("id").isMongoId().withMessage("El ID de pedido no es válido."),
  resultadoValidacion,
];

export const validarEstadoOperativo = [
  param("id").isMongoId().withMessage("El ID de pedido no es válido."),
  body("estadoOperativo")
    .isIn(ORDER_STATUSES)
    .withMessage("El estado operativo no es válido."),
  resultadoValidacion,
];
