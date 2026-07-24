import { Router } from "express";
import { crearCheckoutMercadoPago } from "../controllers/checkout.controllers.js";
import validarCheckout from "../middlewares/validacionCheckout.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";
import noStore from "../middlewares/noStore.js";

const router = Router();
const checkoutLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 20,
  message: "Demasiados intentos de checkout. Probá nuevamente más tarde.",
  keyPrefix: "checkout",
});

router.post(
  "/mercadopago",
  checkoutLimiter,
  noStore,
  validarCheckout,
  asyncHandler(crearCheckoutMercadoPago),
);

export default router;
