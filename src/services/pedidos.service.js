import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import Pedido from "../models/pedido.js";
import AppError from "../helpers/AppError.js";
import {
  ORDER_STATUS_PENDING,
  resolveOperationalStatus,
} from "../constants/pedidos.js";
import {
  buildCompatibleCustomer,
  buildCompatibleDelivery,
  resolveHistoricalPaymentProvider,
} from "../helpers/legacyOrderCompatibility.js";

const normalizeText = (value) => String(value || "").trim();
const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const buildRequestFingerprint = (payload) =>
  createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

export const buildOrderToken = (orderNumber) => {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new AppError(
      500,
      "ORDER_TOKEN_NOT_CONFIGURED",
      "El acceso al pedido no está configurado.",
    );
  }

  const number = normalizeText(orderNumber).toUpperCase();
  const signature = createHmac("sha256", secret)
    .update(`order-access:${number}`)
    .digest("base64url");
  return `${Buffer.from(number).toString("base64url")}.${signature}`;
};

export const verifyOrderToken = (orderNumber, candidateToken) => {
  const expected = buildOrderToken(orderNumber);
  const candidate = normalizeText(candidateToken);
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);

  return (
    expectedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(expectedBuffer, candidateBuffer)
  );
};

export const toOrderSummaryDTO = (order) => ({
  numero: order.numero,
  externalReference: order.externalReference,
  subtotal: Number(order.subtotal || 0),
  costoEnvio: Number(order.costoEnvio || 0),
  total: Number(order.total || 0),
  estadoPago: order.estadoPago,
  estadoOperativo: order.estadoOperativo,
});

export const toPublicOrderStatusDTO = (order) => ({
  numero: order.numero,
  externalReference: order.externalReference,
  subtotal: Number(order.subtotal || 0),
  costoEnvio: Number(order.costoEnvio || 0),
  total: Number(order.total || 0),
  estadoPago: order.estadoPago,
  estadoOperativo: order.estadoOperativo,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export const toAdminOrderDTO = (order) => {
  const source =
    typeof order?.toObject === "function" ? order.toObject() : order || {};
  const legacyCustomer = source.datosCliente || {};
  const legacyDelivery = {
    ...(source.envio || {}),
    ...(source.datosEnvio || {}),
  };
  const customer =
    source.cliente ||
    buildCompatibleCustomer({
      customer: legacyCustomer,
      delivery: legacyDelivery,
      fallbackEmail: source.emailComprador,
    });
  const delivery =
    source.entrega || buildCompatibleDelivery(legacyDelivery);

  return {
    id: String(source._id || source.id || ""),
    numero: source.numero || `EJL-LEGACY-${String(source._id).toUpperCase()}`,
    externalReference:
      source.externalReference || String(source._id || ""),
    cliente: customer,
    entrega: delivery,
    productos: (source.productos || []).map((item) => ({
      productoId: String(item.producto || ""),
      name: item.name || item.nombre || "",
      price: numberOrNull(item.price ?? item.precioUnitario ?? item.precio),
      quantity: numberOrNull(item.quantity ?? item.cantidad),
      subtotal: numberOrNull(
        item.subtotal ??
          Number(item.price ?? item.precioUnitario ?? item.precio) *
            Number(item.quantity ?? item.cantidad),
      ),
    })),
    subtotal: numberOrNull(source.subtotal),
    descuento: numberOrNull(source.descuento ?? 0),
    costoEnvio: numberOrNull(source.costoEnvio ?? source.envio?.costo ?? 0),
    total: numberOrNull(source.total),
    estadoPago:
      source.estadoPago || source.pago?.estado || "pending",
    estadoOperativo:
      resolveOperationalStatus(
        source.estadoOperativo,
        source.estadoPedido,
      ) || ORDER_STATUS_PENDING,
    pago: {
      provider: resolveHistoricalPaymentProvider(source),
      preferenceId: source.pago?.preferenceId || "",
      preferenceValidFrom: source.pago?.preferenceValidFrom || null,
      preferenceExpiresAt: source.pago?.preferenceExpiresAt || null,
      paymentId: source.pago?.paymentId || "",
      additionalPaymentIds: Array.isArray(source.pago?.additionalPaymentIds)
        ? source.pago.additionalPaymentIds.map(String)
        : [],
      refundedAmount: numberOrNull(source.pago?.refundedAmount ?? 0),
      statusDetail: source.pago?.statusDetail || source.pago?.statusDetalle || "",
    },
    requiresReview: Boolean(source.requiresReview),
    reviewReason: source.reviewReason || "",
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

export const findOrderByNumber = async (number) => {
  const order = await Pedido.findOne({
    numero: normalizeText(number).toUpperCase(),
  });
  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  }
  return order;
};
