import AppError from "../helpers/AppError.js";
import {
  obtenerPagoMercadoPago,
  verifyMercadoPagoWebhookSignature,
} from "../services/mercadoPago.service.js";
import { syncVerifiedMercadoPagoPayment } from "../services/paymentSync.service.js";

const extractWebhookDataId = (req) =>
  String(
    req.body?.data?.id ||
      req.query?.["data.id"] ||
      req.body?.id ||
      req.query?.id ||
      "",
  ).trim();

const isPaymentEvent = (req) => {
  const type = String(
    req.body?.type || req.body?.topic || req.query?.type || req.query?.topic || "",
  );
  const action = String(req.body?.action || "");
  return type === "payment" || action.startsWith("payment.");
};

export const recibirWebhookMercadoPago = async (req, res) => {
  if (!String(process.env.MERCADO_PAGO_WEBHOOK_SECRET || "").trim()) {
    throw new AppError(
      503,
      "MERCADO_PAGO_NOT_CONFIGURED",
      "Mercado Pago no está configurado.",
    );
  }

  const dataId = extractWebhookDataId(req);
  const validSignature = verifyMercadoPagoWebhookSignature({
    signatureHeader: req.get("x-signature"),
    requestId: req.get("x-request-id"),
    dataId,
  });

  if (!validSignature) {
    throw new AppError(
      401,
      "INVALID_WEBHOOK_SIGNATURE",
      "La firma del webhook no es válida.",
    );
  }

  if (!isPaymentEvent(req)) {
    return res.status(200).json({ data: { received: true, ignored: true } });
  }

  const payment = await obtenerPagoMercadoPago(dataId);

  try {
    const order = await syncVerifiedMercadoPagoPayment({ payment });
    return res.status(200).json({
      data: {
        received: true,
        orderNumber: order?.numero || null,
      },
    });
  } catch (error) {
    if (error?.code === "ORDER_NOT_FOUND") {
      const externalReference = String(
        payment?.external_reference || "",
      ).trim();
      if (/^EJL-/i.test(externalReference)) {
        throw new AppError(
          503,
          "PAYMENT_ORDER_NOT_READY",
          "El pedido todavía no está disponible para procesar el pago.",
        );
      }
      return res.status(200).json({
        data: { received: true, ignored: true },
      });
    }
    throw error;
  }
};
