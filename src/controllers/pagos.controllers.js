import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import Pedido from "../models/pedido.js";
import { responderError } from "../helpers/safeError.js";

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
  pedido.pago.paymentId = String(paymentId);
  pedido.pago.statusDetalle = String(statusDetail || "");

  if (preferenceId) {
    pedido.pago.preferenceId = preferenceId;
  }

  if (estadoPago === "approved") {
    pedido.pago.fechaPago = new Date();

    if (pedido.estadoPedido === "En espera de pago") {
      pedido.estadoPedido = "Preparando envío";
    }
  }

  if (estadoPago === "rejected") {
    pedido.estadoPedido = "Cancelado";
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

    const frontUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const esEntornoLocal =
      frontUrl.includes("localhost") || frontUrl.includes("127.0.0.1");
    const notificationUrl =
      process.env.MP_WEBHOOK_URL || process.env.MP_NOTIFICATION_URL;

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
    const pagoVerificado = await getPaymentClient().get({ id: String(paymentId) });
    const { pedido, pedidoIdDesdePago } = await buscarPedidoDesdePago({
      preferenceId,
      pagoVerificado,
    });

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    if (!usuarioPuedeGestionarPedido(pedido, req)) {
      return res.status(403).json({
        mensaje: "No tienes permisos para este pedido",
      });
    }

    if (pedidoIdDesdePago && pedidoIdDesdePago !== pedido._id.toString()) {
      return res.status(400).json({
        mensaje: "El pago no corresponde a este pedido",
      });
    }

    if (
      preferenceId &&
      pedido.pago?.preferenceId &&
      pedido.pago.preferenceId !== preferenceId
    ) {
      return res.status(400).json({
        mensaje: "La preferencia de pago no coincide",
      });
    }

    const totalPagado = Number(pagoVerificado?.transaction_amount);

    if (
      Number.isFinite(totalPagado) &&
      Math.abs(totalPagado - Number(pedido.total)) > 0.01
    ) {
      return res.status(400).json({
        mensaje: "El monto informado no coincide con el pedido",
      });
    }

    actualizarPedidoSegunPago({
      pedido,
      status: pagoVerificado?.status,
      statusDetail: pagoVerificado?.status_detail,
      paymentId: pagoVerificado?.id || paymentId,
      preferenceId,
    });

    await pedido.save();

    return res.status(200).json({
      mensaje: "Resultado del pago actualizado",
      pedido,
    });
  } catch (error) {
    return responderError(
      res,
      500,
      "Error al registrar el resultado del pago",
      error,
    );
  }
};
