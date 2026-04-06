import { Router } from "express";
import {
  crearPreferencia,
  recibirWebhookMercadoPago,
  registrarResultadoPago,
} from "../controllers/pagos.controllers.js";
import verificarJWT from "../middlewares/verificarJWT.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";
import {
  validacionCrearPreferencia,
  validacionResultadoPago,
} from "../middlewares/validacionPagos.js";

const router = Router();
const pagosRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.PAYMENT_RATE_LIMIT_MAX || 20),
  message: "Se alcanzo el limite temporal para operaciones de pago",
  keyPrefix: "pagos",
});

router.post("/webhook", pagosRateLimit, recibirWebhookMercadoPago);

router.post(
  "/checkout",
  verificarJWT,
  pagosRateLimit,
  validacionCrearPreferencia,
  crearPreferencia,
);

router.patch(
  "/resultado",
  verificarJWT,
  pagosRateLimit,
  validacionResultadoPago,
  registrarResultadoPago,
);

export default router;
