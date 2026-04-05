import { body } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validarPaymentId = (value) => /^\d+$/.test(String(value || "").trim());

export const validacionCrearPreferencia = [
  body("pedidoId")
    .notEmpty()
    .withMessage("Falta el ID del pedido")
    .isMongoId()
    .withMessage("El ID del pedido no es valido"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export const validacionResultadoPago = [
  body("paymentId")
    .notEmpty()
    .withMessage("Falta el ID del pago")
    .custom(validarPaymentId)
    .withMessage("El ID del pago no es valido"),
  body("preferenceId")
    .optional()
    .isString()
    .isLength({ min: 5, max: 200 })
    .withMessage("La preferencia de pago no es valida"),
  (req, res, next) => resultadoValidacion(req, res, next),
];
