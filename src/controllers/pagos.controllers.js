import mongoose from "mongoose";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import Pedido from "../models/pedido.js";
import {
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_EN_ESPERA_PAGO,
  ESTADO_PEDIDO_PREPARANDO_ENVIO,
  pedidoDebeMantenerStockDescontado,
} from "../constants/pedidos.js";
import { responderError } from "../helpers/safeError.js";
import { sincronizarInventarioPedido } from "../services/pedidoInventory.service.js";

const getMercadoPagoClient = () => {
  const accessToken = String(process.env.MP_ACCESS_TOKEN || "").trim();

  if (!accessToken) {
    const error = new Error("Mercado Pago no esta configurado");
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
  if (status === "approved") {
    return "approved";
  }

  if (["rejected", "cancelled", "refunded"].includes(status)) {
    return "rejected";
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

const esHostnameLocal = (hostname) =>
  hostname === "localhost" || hostname === "127.0.0.1";

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

  pedido.pago.estado = estadoPago;
  pedido.pago.statusDetalle = String(statusDetail || "");

  if (paymentId) {
    pedido.pago.paymentId = String(paymentId);
  }

  if (preferenceId) {
    pedido.pago.preferenceId = preferenceId;
  }

  if (estadoPago === "approved") {
    pedido.pago.fechaPago = new Date();

    if (pedido.estadoPedido === ESTADO_PEDIDO_EN_ESPERA_PAGO) {
      pedido.estadoPedido = ESTADO_PEDIDO_PREPARANDO_ENVIO;
    }
  }

  if (
    estadoPago === "rejected" &&
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
    const pedido = await Pedido.findById(req.body.pedidoId);

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    if (!usuarioPuedeGestionarPedido(pedido, req)) {
      return res.status(403).json({
        mensaje: "No tienes permisos para este pedido",
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

    if (pedido.pago?.preferenceId) {
      return res.status(200).json({
        id: pedido.pago.preferenceId,
      });
    }

    const frontUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const esEntornoLocal =
      frontUrl.includes("localhost") || frontUrl.includes("127.0.0.1");
    const notificationUrl =
      normalizarUrlBase(
        process.env.MP_WEBHOOK_URL || process.env.MP_NOTIFICATION_URL,
      ) ||
      (() => {
        const backendBaseUrl = resolverBackendBaseUrl(req);
        return backendBaseUrl ? `${backendBaseUrl}/api/pagos/webhook` : "";
      })();

    const body = {
      items: crearItemsPreferencia(pedido),
      back_urls: {
        success: `${frontUrl}/pago-exitoso`,
        failure: `${frontUrl}/carrito`,
        pending: `${frontUrl}/pago-pendiente`,
      },
      external_reference: pedido._id.toString(),
      metadata: {
        pedidoId: pedido._id.toString(),
      },
    };

    if (notificationUrl) {
      body.notification_url = notificationUrl;
    }

    if (!esEntornoLocal) {
      body.auto_return = "approved";
    }

    const preference = getPreferenceClient();
    const result = await preference.create({ body });

    pedido.pago.preferenceId = result.id;
    await pedido.save();

    return res.status(200).json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });
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
