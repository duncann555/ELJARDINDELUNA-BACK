import { Router } from "express";
import {
  cotizarEnvio,
  listarLocalidades,
} from "../controllers/envios.controllers.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";
import {
  validacionBusquedaLocalidades,
  validacionCotizacionEnvio,
} from "../middlewares/validacionEnvios.js";

const router = Router();
const enviosRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.SHIPPING_RATE_LIMIT_MAX || 30),
  message: "Se alcanzo el limite temporal para consultas de envio",
  keyPrefix: "envios",
});

router.get(
  "/localidades",
  enviosRateLimit,
  validacionBusquedaLocalidades,
  listarLocalidades,
);

router.post(
  "/cotizar",
  enviosRateLimit,
  validacionCotizacionEnvio,
  cotizarEnvio,
);

export default router;
