import { Router } from "express";
import { recibirWebhookMercadoPago } from "../controllers/pagos.controllers.js";
import asyncHandler from "../middlewares/asyncHandler.js";

const router = Router();

router.post(
  "/mercadopago/webhook",
  asyncHandler(recibirWebhookMercadoPago),
);

export default router;
