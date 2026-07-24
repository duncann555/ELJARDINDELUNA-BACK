import { Router } from "express";
import { obtenerEstadoPublicoPedido } from "../controllers/pedidos.controllers.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import noStore from "../middlewares/noStore.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";

const router = Router();
const orderStatusLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 30,
  message: "Demasiadas consultas de pedido. Probá nuevamente más tarde.",
  keyPrefix: "order-status",
});

router.get(
  "/:numero/estado",
  orderStatusLimiter,
  noStore,
  asyncHandler(obtenerEstadoPublicoPedido),
);

export default router;
