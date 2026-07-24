import { createHash, createHmac } from "node:crypto";
import { WebhookSignatureValidator } from "mercadopago";
import AppError from "../helpers/AppError.js";
import {
  CURRENCY_ARS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_PENDING,
} from "../constants/pagos.js";
import {
  assertPublicHttpsUrl,
  getMercadoPagoAccessToken,
  getMercadoPagoMode,
  getPreferenceClient,
  MP_MODE_SANDBOX,
} from "../server/mercadoPago.config.js";

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
export const MERCADO_PAGO_PREFERENCE_TTL_MS = 30 * 60_000;

const normalizeProviderCode = (value) => {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(normalized) ? normalized : "";
};

export const toMercadoPagoPreferenceError = (error) => {
  if (error instanceof AppError) return error;

  const providerStatus = Number(
    error?.status || error?.statusCode || error?.api_response?.status,
  );
  const providerCode =
    normalizeProviderCode(error?.error) ||
    normalizeProviderCode(error?.cause?.[0]?.code) ||
    normalizeProviderCode(error?.code);
  const rejected =
    Number.isInteger(providerStatus) &&
    providerStatus >= 400 &&
    providerStatus < 500;
  const appError = new AppError(
    502,
    rejected
      ? "MERCADO_PAGO_PREFERENCE_REJECTED"
      : "MERCADO_PAGO_UNAVAILABLE",
    rejected
      ? "Mercado Pago rechazó la configuración del pago."
      : "Mercado Pago no está disponible temporalmente.",
  );

  if (Number.isInteger(providerStatus)) {
    appError.providerStatus = providerStatus;
  }
  if (providerCode) {
    appError.providerCode = providerCode;
  }
  return appError;
};

const asValidDate = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const resolvePreferenceValidityWindow = ({
  order,
  now = new Date(),
}) => {
  const validFrom =
    asValidDate(order?.pago?.preferenceValidFrom) ||
    asValidDate(order?.createdAt) ||
    asValidDate(now);
  const storedValidUntil = asValidDate(order?.pago?.preferenceExpiresAt);
  const validUntil =
    storedValidUntil && storedValidUntil > validFrom
      ? storedValidUntil
      : new Date(validFrom.getTime() + MERCADO_PAGO_PREFERENCE_TTL_MS);

  return { validFrom, validUntil };
};

export const buildMercadoPagoIdempotencyKey = (idempotencyKey) =>
  `order-${createHash("sha256")
    .update(String(idempotencyKey || ""))
    .digest("hex")
    .slice(0, 58)}`;

export const buildMercadoPagoSignatureManifest = ({
  dataId,
  requestId,
  timestamp,
}) =>
  `id:${String(dataId || "").toLowerCase()};request-id:${String(
    requestId || "",
  )};ts:${String(timestamp || "")};`;

export const signMercadoPagoWebhook = ({
  dataId,
  requestId,
  timestamp,
  secret,
}) =>
  createHmac("sha256", secret)
    .update(
      buildMercadoPagoSignatureManifest({
        dataId,
        requestId,
        timestamp,
      }),
    )
    .digest("hex");

export const verifyMercadoPagoWebhookSignature = ({
  signatureHeader,
  requestId,
  dataId,
  secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET,
  now = Date.now(),
  toleranceSeconds = 300,
}) => {
  const normalizedSecret = String(secret || "").trim();
  if (!normalizedSecret || !requestId || !dataId) {
    return false;
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: signatureHeader,
      xRequestId: requestId,
      dataId: String(dataId).toLowerCase(),
      secret: normalizedSecret,
      toleranceSeconds,
      now: () => now,
    });
    return true;
  } catch {
    return false;
  }
};

export const buildPreferenceBody = ({ order, now = new Date() }) => {
  const frontendUrl = normalizeBaseUrl(process.env.FRONTEND_URL);
  const backendUrl = normalizeBaseUrl(process.env.BACKEND_PUBLIC_URL);
  assertPublicHttpsUrl(frontendUrl, "FRONTEND_URL");
  assertPublicHttpsUrl(backendUrl, "BACKEND_PUBLIC_URL");
  const { validFrom, validUntil } = resolvePreferenceValidityWindow({
    order,
    now,
  });

  const successUrl = `${frontendUrl}/pago/success?pedido=${encodeURIComponent(
    order.numero,
  )}`;
  const items = order.productos.map((item) => ({
    id: String(item.producto),
    title: item.name,
    quantity: Number(item.quantity),
    unit_price: Number(item.price),
    currency_id: CURRENCY_ARS,
  }));

  if (Number(order.costoEnvio) > 0) {
    items.push({
      id: `shipping-${order.numero}`,
      title: "Envío a domicilio",
      quantity: 1,
      unit_price: Number(order.costoEnvio),
      currency_id: CURRENCY_ARS,
    });
  }

  return {
    items,
    payer: {
      name: order.cliente.nombre,
      surname: order.cliente.apellido,
      email: order.cliente.email,
    },
    external_reference: order.externalReference,
    metadata: {
      order_number: order.numero,
    },
    back_urls: {
      success: successUrl,
      pending: `${frontendUrl}/pago/pending?pedido=${encodeURIComponent(order.numero)}`,
      failure: `${frontendUrl}/pago/failure?pedido=${encodeURIComponent(order.numero)}`,
    },
    notification_url: `${backendUrl}/api/pagos/mercadopago/webhook`,
    auto_return: "approved",
    expires: true,
    expiration_date_from: validFrom.toISOString(),
    expiration_date_to: validUntil.toISOString(),
  };
};

export const crearPreferenciaMercadoPago = async ({
  order,
  idempotencyKey,
  preferenceClient,
}) => {
  const preference = preferenceClient || getPreferenceClient();
  const body = buildPreferenceBody({ order });
  let result;
  try {
    result = await preference.create({
      body,
      requestOptions: {
        idempotencyKey: buildMercadoPagoIdempotencyKey(idempotencyKey),
      },
    });
  } catch (error) {
    throw toMercadoPagoPreferenceError(error);
  }
  const checkoutUrl =
    getMercadoPagoMode() === MP_MODE_SANDBOX
      ? result.sandbox_init_point || result.init_point
      : result.init_point;

  if (!result?.id || !checkoutUrl) {
    throw new AppError(
      502,
      "MERCADO_PAGO_INVALID_RESPONSE",
      "Mercado Pago no devolvió una URL de pago válida.",
    );
  }

  const providerExpiresAt = asValidDate(result.expiration_date_to);
  return {
    preferenceId: String(result.id),
    checkoutUrl,
    expiresAt:
      providerExpiresAt?.toISOString() || body.expiration_date_to,
  };
};

const mercadoPagoGet = async (path, { fetchImpl = fetch } = {}) => {
  const accessToken = getMercadoPagoAccessToken();
  if (!accessToken) {
    throw new AppError(
      503,
      "MERCADO_PAGO_NOT_CONFIGURED",
      "Mercado Pago no está configurado.",
    );
  }

  let response;
  try {
    response = await fetchImpl(`https://api.mercadopago.com${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError(
      502,
      "MERCADO_PAGO_UNAVAILABLE",
      "Mercado Pago no está disponible temporalmente.",
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(
      502,
      "MERCADO_PAGO_REQUEST_FAILED",
      "No se pudo verificar el pago en Mercado Pago.",
    );
  }
  return data;
};

export const obtenerPagoMercadoPago = (paymentId, options) =>
  mercadoPagoGet(`/v1/payments/${encodeURIComponent(paymentId)}`, options);

export const paymentBelongsToPreference = async ({
  paymentId,
  preferenceId,
  fetchImpl,
}) => {
  const data = await mercadoPagoGet(
    `/merchant_orders/search?preference_id=${encodeURIComponent(preferenceId)}`,
    { fetchImpl },
  );
  const merchantOrders = Array.isArray(data?.elements) ? data.elements : [];

  return merchantOrders.some((merchantOrder) =>
    (merchantOrder.payments || []).some(
      (payment) => String(payment?.id) === String(paymentId),
    ),
  );
};

export const normalizeMercadoPagoStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  return PAYMENT_STATUSES.includes(normalized)
    ? normalized
    : PAYMENT_STATUS_PENDING;
};
