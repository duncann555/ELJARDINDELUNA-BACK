import { randomBytes } from "node:crypto";
import Pedido from "../models/pedido.js";
import AppError from "../helpers/AppError.js";
import {
  DELIVERY_METHOD_HOME,
  ORDER_STATUS_PENDING,
  STOCK_STATE_PENDING,
} from "../constants/pedidos.js";
import {
  CURRENCY_ARS,
  MERCADO_PAGO_PROVIDER,
  PAYMENT_STATUS_PENDING,
} from "../constants/pagos.js";
import {
  agruparLineasProducto,
  obtenerSnapshotsProductos,
} from "./pedidoInventory.service.js";
import {
  buildOrderToken,
  buildRequestFingerprint,
  toOrderSummaryDTO,
} from "./pedidos.service.js";
import {
  crearPreferenciaMercadoPago,
  MERCADO_PAGO_PREFERENCE_TTL_MS,
} from "./mercadoPago.service.js";
import { roundMoney } from "../helpers/money.js";

const normalizeText = (value) => String(value || "").trim();
const emptyPreferenceFilter = {
  $or: [
    { "pago.preferenceId": { $exists: false } },
    { "pago.preferenceId": "" },
    { "pago.preferenceId": null },
  ],
};

export const getShippingCost = (deliveryMethod) =>
  deliveryMethod === DELIVERY_METHOD_HOME
    ? roundMoney(process.env.SHIPPING_COST)
    : 0;

export const getCheckoutConfiguration = () => ({
  entrega: {
    costoDomicilio: getShippingCost(DELIVERY_METHOD_HOME),
    retiroDisponible: true,
  },
});

export const normalizeCheckoutPayload = (payload) => {
  const groupedProducts = agruparLineasProducto(payload.productos).sort((a, b) =>
    a.productoId.localeCompare(b.productoId),
  );
  const homeDelivery = payload.entrega.metodo === DELIVERY_METHOD_HOME;

  return {
    cliente: {
      nombre: normalizeText(payload.cliente.nombre),
      apellido: normalizeText(payload.cliente.apellido),
      telefono: normalizeText(payload.cliente.telefono).replace(/\D/g, ""),
      email: normalizeText(payload.cliente.email).toLowerCase(),
    },
    entrega: {
      metodo: payload.entrega.metodo,
      provincia: homeDelivery ? normalizeText(payload.entrega.provincia) : "",
      localidad: homeDelivery ? normalizeText(payload.entrega.localidad) : "",
      codigoPostal: homeDelivery
        ? normalizeText(payload.entrega.codigoPostal)
        : "",
      direccion: homeDelivery ? normalizeText(payload.entrega.direccion) : "",
      aclaraciones: normalizeText(payload.entrega.aclaraciones),
    },
    productos: groupedProducts,
  };
};

export const calcularTotalesCheckout = ({ productSnapshots, deliveryMethod }) => {
  const subtotal = roundMoney(
    productSnapshots.reduce(
      (total, item) => total + Number(item.subtotal || 0),
      0,
    ),
  );
  const costoEnvio = getShippingCost(deliveryMethod);
  return {
    subtotal,
    costoEnvio,
    total: roundMoney(subtotal + costoEnvio),
  };
};

export const generateOrderNumber = (now = new Date()) => {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `EJL-${date}-${randomBytes(12).toString("hex").toUpperCase()}`;
};

const assertIdempotentRequestMatches = (order, fingerprint) => {
  if (order.requestFingerprint !== fingerprint) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "La clave de idempotencia ya fue usada con otros datos.",
    );
  }
};

const createPendingOrder = async ({
  payload,
  idempotencyKey,
  fingerprint,
}) => {
  const products = await obtenerSnapshotsProductos({
    items: payload.productos,
  });
  const totals = calcularTotalesCheckout({
    productSnapshots: products,
    deliveryMethod: payload.entrega.metodo,
  });
  const number = generateOrderNumber();
  const preferenceValidFrom = new Date();
  const preferenceExpiresAt = new Date(
    preferenceValidFrom.getTime() + MERCADO_PAGO_PREFERENCE_TTL_MS,
  );

  return Pedido.create({
    numero: number,
    externalReference: number,
    idempotencyKey,
    requestFingerprint: fingerprint,
    cliente: payload.cliente,
    entrega: payload.entrega,
    productos: products,
    ...totals,
    descuento: 0,
    estadoPago: PAYMENT_STATUS_PENDING,
    estadoOperativo: ORDER_STATUS_PENDING,
    stockState: STOCK_STATE_PENDING,
    pago: {
      provider: MERCADO_PAGO_PROVIDER,
      currency: CURRENCY_ARS,
      preferenceValidFrom,
      preferenceExpiresAt,
    },
    preferenceCreationState: "pending",
  });
};

export const claimPreferenceCreation = async (orderId) => {
  const claimToken = randomBytes(16).toString("hex");
  const staleClaim = new Date(Date.now() - 2 * 60_000);
  const order = await Pedido.findOneAndUpdate(
    {
      _id: orderId,
      ...emptyPreferenceFilter,
      $and: [
        {
          $or: [
            { preferenceCreationState: { $in: ["pending", "failed"] } },
            {
              preferenceCreationState: "creating",
              preferenceClaimedAt: { $lte: staleClaim },
            },
          ],
        },
      ],
    },
    {
      $set: {
        preferenceCreationState: "creating",
        preferenceClaimedAt: new Date(),
        preferenceClaimToken: claimToken,
        preferenceErrorCode: "",
      },
    },
    { new: true },
  );

  return order ? { order, claimToken } : null;
};

export const ensurePreferenceForOrder = async ({
  order,
  idempotencyKey,
  createPreference,
  claimPreference = claimPreferenceCreation,
  findOrderById = (id) => Pedido.findById(id),
  persistPreference = ({ orderId, claimToken, payment, total }) =>
    Pedido.findOneAndUpdate(
      {
        _id: orderId,
        preferenceCreationState: "creating",
        preferenceClaimToken: claimToken,
        ...emptyPreferenceFilter,
      },
      {
        $set: {
          "pago.preferenceId": payment.preferenceId,
          "pago.checkoutUrl": payment.checkoutUrl,
          "pago.amount": total,
          "pago.preferenceExpiresAt": payment.expiresAt,
          preferenceCreationState: "created",
          preferenceErrorCode: "",
        },
        $unset: {
          preferenceClaimToken: 1,
          preferenceClaimedAt: 1,
        },
      },
      { new: true, runValidators: true },
    ),
  markPreferenceFailed = ({ orderId, claimToken, errorCode }) =>
    Pedido.findOneAndUpdate(
      {
        _id: orderId,
        preferenceCreationState: "creating",
        preferenceClaimToken: claimToken,
        ...emptyPreferenceFilter,
      },
      {
        $set: {
          preferenceCreationState: "failed",
          preferenceErrorCode: errorCode,
        },
        $unset: {
          preferenceClaimToken: 1,
          preferenceClaimedAt: 1,
        },
      },
    ),
}) => {
  if (order.pago?.preferenceId && order.pago?.checkoutUrl) return order;

  const claim = await claimPreference(order._id);
  if (!claim) {
    const currentOrder = await findOrderById(order._id);
    if (currentOrder?.pago?.preferenceId && currentOrder?.pago?.checkoutUrl) {
      return currentOrder;
    }
    throw new AppError(
      409,
      "CHECKOUT_IN_PROGRESS",
      "El checkout ya se está procesando. Reintentá en unos segundos.",
    );
  }

  try {
    const payment = await createPreference({
      order: claim.order,
      idempotencyKey,
    });
    const updatedOrder = await persistPreference({
      orderId: claim.order._id,
      claimToken: claim.claimToken,
      payment,
      total: claim.order.total,
    });
    if (updatedOrder) return updatedOrder;

    const currentOrder = await findOrderById(claim.order._id);
    if (currentOrder?.pago?.preferenceId && currentOrder?.pago?.checkoutUrl) {
      return currentOrder;
    }
    throw new AppError(
      409,
      "CHECKOUT_STATE_CHANGED",
      "El estado del checkout cambió durante la operación.",
    );
  } catch (error) {
    await markPreferenceFailed({
      orderId: claim.order._id,
      claimToken: claim.claimToken,
      errorCode:
        typeof error?.code === "string"
          ? error.code.slice(0, 120)
          : "MERCADO_PAGO_ERROR",
    });

    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      "MERCADO_PAGO_UNAVAILABLE",
      "No se pudo iniciar el pago. Reintentá en unos segundos.",
    );
  }
};

export const iniciarCheckout = async ({
  payload,
  idempotencyKey,
  createPreference = crearPreferenciaMercadoPago,
}) => {
  const normalizedPayload = normalizeCheckoutPayload(payload);
  const fingerprint = buildRequestFingerprint(normalizedPayload);
  let order = await Pedido.findOne({ idempotencyKey });

  if (order) {
    assertIdempotentRequestMatches(order, fingerprint);
  } else {
    try {
      order = await createPendingOrder({
        payload: normalizedPayload,
        idempotencyKey,
        fingerprint,
      });
    } catch (error) {
      if (Number(error?.code) !== 11000) throw error;
      order = await Pedido.findOne({ idempotencyKey });
      if (!order) throw error;
      assertIdempotentRequestMatches(order, fingerprint);
    }
  }

  order = await ensurePreferenceForOrder({
    order,
    idempotencyKey,
    createPreference,
  });

  return {
    pedido: toOrderSummaryDTO(order),
    pago: {
      preferenceId: order.pago.preferenceId,
      checkoutUrl: order.pago.checkoutUrl,
      expiresAt: order.pago.preferenceExpiresAt || null,
    },
    orderToken: buildOrderToken(order.numero),
  };
};
