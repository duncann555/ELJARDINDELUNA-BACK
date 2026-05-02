import mongoose from "mongoose";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import Pedido from "../models/pedido.js";
import {
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_EN_ESPERA_PAGO,
  ESTADO_PEDIDO_PREPARANDO_ENVIO,
  pedidoDebeMantenerStockDescontado,
} from "../constants/pedidos.js";
import {
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_RECHAZADO,
  METODO_PAGO_MERCADO_PAGO,
} from "../constants/pagos.js";
import { responderError } from "../helpers/safeError.js";
import { sincronizarInventarioPedido } from "../services/pedidoInventory.service.js";

const MP_ENVIRONMENT_PRODUCTION = "production";
const MP_ENVIRONMENT_SANDBOX = "sandbox";

const getMercadoPagoClient = () => {
  const accessToken = String(process.env.MP_ACCESS_TOKEN || "").trim();

  if (!accessToken) {
    const error = new Error("Mercado Pago no esta configurado");
    error.status = 503;
    error.publicMessage =
      "El medio de pago no esta disponible en este momento";
    throw error;
  }

  // Produccion y sandbox no son intercambiables: Mercado Pago rechaza pagos si se mezclan cuentas reales y de prueba.
  if (esMercadoPagoProduccion() && !accessToken.startsWith("APP_USR-")) {
    const error = new Error("Mercado Pago debe usar credenciales productivas");
    error.status = 503;
    error.publicMessage =
      "El medio de pago no esta disponible en este momento";
    throw error;
  }

  if (esMercadoPagoSandbox() && !esTokenPruebaMercadoPago(accessToken)) {
    const error = new Error("Mercado Pago sandbox debe usar credenciales TEST");
    error.status = 503;
    error.publicMessage =
      "El medio de pago no esta disponible en este momento";
    throw error;
  }

  return new MercadoPagoConfig({ accessToken });
};

const getPaymentClient = () => new Payment(getMercadoPagoClient());
const getPreferenceClient = () => new Preference(getMercadoPagoClient());

const usuarioPuedeGestionarPedido = (pedido, req) =>
  pedido.usuario.toString() === req.usuarioId || req.rol === "Administrador";

const normalizarEstadoPago = (status) => {
  if (status === ESTADO_PAGO_APROBADO) {
    return ESTADO_PAGO_APROBADO;
  }

  if (["rejected", "cancelled", "refunded"].includes(status)) {
    return ESTADO_PAGO_RECHAZADO;
  }

  return "pending";
};

const buildPaymentError = (status, mensaje) => {
  const error = new Error(mensaje);
  error.status = status;
  error.publicMessage = mensaje;
  return error;
};

const normalizarUrlBase = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

const normalizarMercadoPagoEnvironment = () => {
  const environment = String(process.env.MP_ENVIRONMENT || "")
    .trim()
    .toLowerCase();

  if (environment === MP_ENVIRONMENT_PRODUCTION) return MP_ENVIRONMENT_PRODUCTION;
  if (["sandbox", "test", "development"].includes(environment)) {
    return MP_ENVIRONMENT_SANDBOX;
  }

  return "";
};

const esMercadoPagoProduccion = () =>
  normalizarMercadoPagoEnvironment() === MP_ENVIRONMENT_PRODUCTION;

const esMercadoPagoSandbox = () =>
  normalizarMercadoPagoEnvironment() === MP_ENVIRONMENT_SANDBOX;

const esTokenPruebaMercadoPago = (token) =>
  String(token || "").trim().toUpperCase().startsWith("TEST-");

const getMercadoPagoTokenPrefix = () => {
  const token = String(process.env.MP_ACCESS_TOKEN || "").trim();

  if (!token) return "missing";
  if (token.startsWith("APP_USR-")) return "APP_USR-";
  if (token.startsWith("TEST-")) return "TEST-";

  return "other";
};

const logMercadoPagoConfig = () => {
  console.log("MP token exists:", Boolean(process.env.MP_ACCESS_TOKEN));
  console.log("MP token prefix:", getMercadoPagoTokenPrefix());
  console.log("MP environment:", normalizarMercadoPagoEnvironment() || "invalid");
  console.log("MP production mode:", esMercadoPagoProduccion());
  console.log("MP sandbox mode:", esMercadoPagoSandbox());
};

const pareceEmailPruebaMercadoPago = (email) =>
  /test_user|testuser|buyer_test|comprador_test|seller_test|vendedor_test/i.test(
    String(email || ""),
  );

const enmascararEmail = (email) => {
  const [localPart = "", domain = ""] = String(email || "").split("@");

  if (!localPart || !domain) return "";

  return `${localPart.slice(0, 2)}***@${domain}`;
};

const resumirUrlCheckout = (checkoutUrl) => {
  try {
    const parsedUrl = new URL(checkoutUrl);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return checkoutUrl ? "[url-no-valida]" : "";
  }
};

const logMercadoPagoPreferencia = ({ body, result, checkoutUrl }) => {
  const payerEmail = String(body?.payer?.email || "").trim();
  let checkoutUrlType = "unexpected_non_init_point";

  if (checkoutUrl && checkoutUrl === result?.init_point) {
    checkoutUrlType = "init_point";
  } else if (checkoutUrl && checkoutUrl === result?.sandbox_init_point) {
    checkoutUrlType = "sandbox_init_point";
  }

  console.log("MP payer email provided:", Boolean(payerEmail));
  console.log(
    "MP payer email looks test:",
    pareceEmailPruebaMercadoPago(payerEmail),
  );

  if (payerEmail) {
    console.log("MP payer email masked:", enmascararEmail(payerEmail));
  }

  console.log("MP checkout URL type:", checkoutUrlType);
  console.log("MP checkout URL host/path:", resumirUrlCheckout(checkoutUrl));
  console.log("MP success URL:", resumirUrlCheckout(body?.back_urls?.success));
  console.log("MP failure URL:", resumirUrlCheckout(body?.back_urls?.failure));
  console.log("MP pending URL:", resumirUrlCheckout(body?.back_urls?.pending));
};

const validarCheckoutMercadoPago = () => {
  if (esMercadoPagoProduccion() || esMercadoPagoSandbox()) {
    return;
  }

  const error = new Error("MP_ENVIRONMENT debe ser production o sandbox");
  error.status = 503;
  error.publicMessage = "Mercado Pago no esta configurado correctamente";
  throw error;
};

const esHostnameLocal = (hostname) =>
  hostname === "localhost" || hostname === "127.0.0.1";

const validarUrlPublicaProduccion = (value, key) => {
  const url = normalizarUrlBase(value);

  if (!url || !esMercadoPagoProduccion()) {
    return url;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    const error = new Error(`${key} no contiene una URL valida`);
    error.status = 500;
    error.publicMessage = "Mercado Pago no esta configurado correctamente";
    throw error;
  }

  if (parsedUrl.protocol !== "https:" || esHostnameLocal(parsedUrl.hostname)) {
    const error = new Error(
      `${key} debe apuntar a una URL productiva con HTTPS`,
    );
    error.status = 500;
    error.publicMessage = "Mercado Pago no esta configurado correctamente";
    throw error;
  }

  return url;
};

const resolverUrlRetorno = (key, fallbackUrl) => {
  const configuredUrl = normalizarUrlBase(process.env[key]);

  if (!configuredUrl) {
    return fallbackUrl;
  }

  return validarUrlPublicaProduccion(configuredUrl, key);
};

const resolverFrontendUrl = () => {
  const configuredUrl = normalizarUrlBase(process.env.FRONTEND_URL);
  const fallbackUrl = esMercadoPagoProduccion()
    ? "https://www.eljardindeluna.ar"
    : "http://localhost:5173";

  return validarUrlPublicaProduccion(
    configuredUrl || fallbackUrl,
    "FRONTEND_URL",
  );
};

const resolverBackendBaseUrl = (req) => {
  const configuredUrl = normalizarUrlBase(
    process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL,
  );

  if (configuredUrl) {
    return configuredUrl;
  }

  const host = String(req.get("host") || "").trim();

  if (!host) {
    return "";
  }

  const candidate = `${req.protocol || "https"}://${host}`;

  try {
    const parsedUrl = new URL(candidate);

    if (esHostnameLocal(parsedUrl.hostname)) {
      return "";
    }

    return parsedUrl.origin;
  } catch {
    return "";
  }
};

const validarCuentaCompradoraDistinta = (req) => {
  const sellerEmail = String(process.env.MP_SELLER_EMAIL || "")
    .trim()
    .toLowerCase();
  const buyerEmail = String(req.email || "").trim().toLowerCase();

  if (!sellerEmail || !buyerEmail || sellerEmail !== buyerEmail) {
    return;
  }

  const error = new Error(
    "La cuenta compradora no puede ser la misma que la cuenta vendedora",
  );
  error.status = 400;
  error.publicMessage =
    "Usa una cuenta compradora distinta de la cuenta que cobra";
  throw error;
};

const extraerPaymentIdWebhook = (req) => {
  const bodyType = String(req.body?.type || req.body?.topic || "").trim();
  const queryType = String(req.query?.type || req.query?.topic || "").trim();
  const action = String(req.body?.action || "").trim();
  const esEventoDePago =
    bodyType === "payment" ||
    queryType === "payment" ||
    action.startsWith("payment.");

  if (!esEventoDePago) {
    return "";
  }

  const paymentId =
    req.body?.data?.id ||
    req.query?.["data.id"] ||
    req.body?.id ||
    req.query?.id ||
    "";

  return String(paymentId).trim();
};

const crearItemsPreferencia = (pedido) => [
  ...pedido.productos.map((producto) => ({
    id: producto.producto.toString(),
    title: producto.nombre,
    quantity: Number(producto.cantidad),
    unit_price: Number(producto.precio),
    currency_id: "ARS",
  })),
  ...(Number(pedido.envio?.costo || 0) > 0
    ? [
        {
          id: `envio-${pedido._id.toString()}`,
          title: `Envio ${pedido.envio?.proveedor || "nacional"}`,
          quantity: 1,
          unit_price: Number(pedido.envio.costo),
          currency_id: "ARS",
        },
      ]
    : []),
];

const actualizarPedidoSegunPago = ({
  pedido,
  status,
  statusDetail,
  paymentId,
  preferenceId,
}) => {
  const estadoPago = normalizarEstadoPago(status);

  pedido.estadoPago = estadoPago;
  pedido.pago.estado = estadoPago;
  pedido.pago.statusDetalle = String(statusDetail || "");

  if (paymentId) {
    pedido.pago.paymentId = String(paymentId);
  }

  if (preferenceId) {
    pedido.pago.preferenceId = preferenceId;
  }

  if (estadoPago === ESTADO_PAGO_APROBADO) {
    pedido.pago.fechaPago = new Date();

    if (pedido.estadoPedido === ESTADO_PEDIDO_EN_ESPERA_PAGO) {
      pedido.estadoPedido = ESTADO_PEDIDO_PREPARANDO_ENVIO;
    }
  }

  if (
    estadoPago === ESTADO_PAGO_RECHAZADO &&
    pedido.estadoPedido === ESTADO_PEDIDO_EN_ESPERA_PAGO
  ) {
    pedido.estadoPedido = ESTADO_PEDIDO_CANCELADO;
  }
};

const buscarPedidoDesdePago = async ({ preferenceId, pagoVerificado }) => {
  const pedidoIdDesdePago = String(
    pagoVerificado?.external_reference || pagoVerificado?.metadata?.pedidoId || "",
  ).trim();

  let pedido = null;

  if (preferenceId) {
    pedido = await Pedido.findOne({ "pago.preferenceId": preferenceId });
  }

  if (!pedido && pedidoIdDesdePago) {
    pedido = await Pedido.findById(pedidoIdDesdePago);
  }

  return { pedido, pedidoIdDesdePago };
};

const sincronizarPedidoConPago = async ({
  req,
  paymentId,
  preferenceId,
  validarPermisos = true,
}) => {
  const pagoVerificado = await getPaymentClient().get({ id: String(paymentId) });
  const { pedido, pedidoIdDesdePago } = await buscarPedidoDesdePago({
    preferenceId,
    pagoVerificado,
  });

  if (!pedido) {
    throw buildPaymentError(404, "Pedido no encontrado");
  }

  if (validarPermisos && !usuarioPuedeGestionarPedido(pedido, req)) {
    throw buildPaymentError(403, "No tienes permisos para este pedido");
  }

  if (pedidoIdDesdePago && pedidoIdDesdePago !== pedido._id.toString()) {
    throw buildPaymentError(400, "El pago no corresponde a este pedido");
  }

  if (
    preferenceId &&
    pedido.pago?.preferenceId &&
    pedido.pago.preferenceId !== preferenceId
  ) {
    throw buildPaymentError(400, "La preferencia de pago no coincide");
  }

  const totalPagado = Number(pagoVerificado?.transaction_amount);

  if (
    Number.isFinite(totalPagado) &&
    Math.abs(totalPagado - Number(pedido.total)) > 0.01
  ) {
    throw buildPaymentError(400, "El monto informado no coincide con el pedido");
  }

  const session = await mongoose.startSession();

  try {
    let pedidoActualizado = null;

    await session.withTransaction(async () => {
      const pedidoEnTransaccion = await Pedido.findById(pedido._id).session(
        session,
      );

      if (!pedidoEnTransaccion) {
        throw buildPaymentError(404, "Pedido no encontrado");
      }

      actualizarPedidoSegunPago({
        pedido: pedidoEnTransaccion,
        status: pagoVerificado?.status,
        statusDetail: pagoVerificado?.status_detail,
        paymentId: pagoVerificado?.id || paymentId,
        preferenceId,
      });

      await sincronizarInventarioPedido({
        pedido: pedidoEnTransaccion,
        session,
        debeDescontar: pedidoDebeMantenerStockDescontado({
          estadoPedido: pedidoEnTransaccion.estadoPedido,
          estadoPago: pedidoEnTransaccion.pago?.estado,
        }),
      });

      await pedidoEnTransaccion.save({ session });
      pedidoActualizado = pedidoEnTransaccion;
    });

    return {
      pedido: pedidoActualizado,
      pagoVerificado,
    };
  } finally {
    await session.endSession();
  }
};

export const crearPreferencia = async (req, res) => {
  try {
    validarCheckoutMercadoPago();
    validarCuentaCompradoraDistinta(req);

    const pedido = await Pedido.findById(req.body.pedidoId);

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    if (!usuarioPuedeGestionarPedido(pedido, req)) {
      return res.status(403).json({
        mensaje: "No tienes permisos para este pedido",
      });
    }

    const metodoPagoPedido =
      pedido.metodoPago || METODO_PAGO_MERCADO_PAGO;

    if (metodoPagoPedido !== METODO_PAGO_MERCADO_PAGO) {
      return res.status(400).json({
        mensaje: "Este pedido debe confirmarse por transferencia bancaria",
      });
    }

    if (pedido.pago?.estado === "approved") {
      return res.status(400).json({ mensaje: "Este pedido ya fue abonado" });
    }

    if (pedido.estadoPedido === ESTADO_PEDIDO_CANCELADO) {
      return res.status(400).json({
        mensaje: "Este pedido fue cancelado y ya no puede enviarse a pago",
      });
    }

    const frontUrl = resolverFrontendUrl();
    const configuredNotificationUrl = process.env.MP_WEBHOOK_URL
      ? validarUrlPublicaProduccion(process.env.MP_WEBHOOK_URL, "MP_WEBHOOK_URL")
      : validarUrlPublicaProduccion(
          process.env.MP_NOTIFICATION_URL,
          "MP_NOTIFICATION_URL",
        );
    const notificationUrl =
      configuredNotificationUrl ||
      (() => {
        const backendBaseUrl = validarUrlPublicaProduccion(
          resolverBackendBaseUrl(req),
          "BACKEND_PUBLIC_URL",
        );
        return backendBaseUrl ? `${backendBaseUrl}/api/pagos/webhook` : "";
      })();

    const body = {
      items: crearItemsPreferencia(pedido),
      back_urls: {
        success: resolverUrlRetorno(
          "MP_SUCCESS_URL",
          `${frontUrl}/pago/success`,
        ),
        failure: resolverUrlRetorno(
          "MP_FAILURE_URL",
          `${frontUrl}/pago/failure`,
        ),
        pending: resolverUrlRetorno(
          "MP_PENDING_URL",
          `${frontUrl}/pago/pending`,
        ),
      },
      external_reference: pedido._id.toString(),
      metadata: {
        pedidoId: pedido._id.toString(),
      },
    };

    if (notificationUrl) {
      body.notification_url = notificationUrl;
    }

    body.auto_return = "approved";

    logMercadoPagoConfig();

    const preference = getPreferenceClient();
    const result = await preference.create({ body });

    pedido.pago.preferenceId = result.id;
    await pedido.save();

    // En sandbox el frontend debe abrir sandbox_init_point; en produccion, init_point.
    const checkoutUrl = esMercadoPagoSandbox()
      ? result.sandbox_init_point || result.init_point
      : result.init_point;

    if (!checkoutUrl) {
      const error = new Error("Mercado Pago no devolvio una URL de checkout");
      error.status = 502;
      error.publicMessage = "Mercado Pago no devolvio una URL de pago valida";
      throw error;
    }

    logMercadoPagoPreferencia({ body, result, checkoutUrl });

    const responseBody = {
      id: result.id,
      init_point: result.init_point || "",
      sandbox_init_point: result.sandbox_init_point || "",
    };

    return res.status(200).json(responseBody);
  } catch (error) {
    return responderError(
      res,
      500,
      "Error al crear la preferencia de pago",
      error,
    );
  }
};

export const registrarResultadoPago = async (req, res) => {
  try {
    const { preferenceId, paymentId } = req.body;
    const { pedido } = await sincronizarPedidoConPago({
      req,
      paymentId,
      preferenceId,
      validarPermisos: true,
    });

    return res.status(200).json({
      mensaje: "Resultado del pago actualizado",
      pedido,
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        mensaje: error.publicMessage || error.message,
      });
    }

    return responderError(
      res,
      500,
      "Error al registrar el resultado del pago",
      error,
    );
  }
};

export const recibirWebhookMercadoPago = async (req, res) => {
  try {
    const paymentId = extraerPaymentIdWebhook(req);

    if (!paymentId) {
      return res.status(200).json({
        mensaje: "Notificacion ignorada",
      });
    }

    const { pedido } = await sincronizarPedidoConPago({
      req,
      paymentId,
      preferenceId: "",
      validarPermisos: false,
    });

    return res.status(200).json({
      mensaje: "Webhook procesado correctamente",
      pedidoId: pedido?._id || null,
    });
  } catch (error) {
    if (error?.status === 404) {
      return res.status(200).json({
        mensaje: error.publicMessage || error.message,
      });
    }

    if (error?.status) {
      return res.status(error.status).json({
        mensaje: error.publicMessage || error.message,
      });
    }

    return responderError(
      res,
      500,
      "Error al procesar la notificacion de Mercado Pago",
      error,
    );
  }
};
