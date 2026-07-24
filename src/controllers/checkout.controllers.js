import {
  getCheckoutConfiguration,
  iniciarCheckout,
} from "../services/checkout.service.js";

export const obtenerConfiguracionCheckout = (_req, res) =>
  res.json({ data: getCheckoutConfiguration() });

export const crearCheckoutMercadoPago = async (req, res) => {
  const result = await iniciarCheckout({
    payload: req.validated,
    idempotencyKey: req.get("Idempotency-Key"),
  });

  return res.status(201).json({ data: result });
};
