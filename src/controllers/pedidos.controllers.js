import mongoose from "mongoose";
import Pedido from "../models/pedido.js";
import AppError from "../helpers/AppError.js";
import {
  findOrderByNumber,
  toAdminOrderDTO,
  toPublicOrderStatusDTO,
  verifyOrderToken,
} from "../services/pedidos.service.js";
import {
  normalizarStockStateLegacy,
  restaurarStockPedido,
} from "../services/pedidoInventory.service.js";
import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_PAID,
  ORDER_STATUS_PENDING,
  ORDER_STATUS_PREPARING,
  ORDER_STATUS_SHIPPED,
} from "../constants/pedidos.js";
import { PAYMENT_STATUS_APPROVED } from "../constants/pagos.js";

export const obtenerEstadoPublicoPedido = async (req, res) => {
  if (!verifyOrderToken(req.params.numero, req.get("X-Order-Token"))) {
    throw new AppError(
      403,
      "INVALID_ORDER_TOKEN",
      "No tenés permiso para consultar este pedido.",
    );
  }
  const order = await findOrderByNumber(req.params.numero);

  return res.json({
    data: {
      pedido: toPublicOrderStatusDTO(order),
    },
  });
};

export const listarPedidosAdmin = async (_req, res) => {
  const orders = await Pedido.find().sort({ createdAt: -1 });
  return res.json({
    data: {
      pedidos: orders.map(toAdminOrderDTO),
    },
  });
};

export const obtenerPedidoAdmin = async (req, res) => {
  const order = await Pedido.findById(req.params.id);
  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  }
  return res.json({ data: { pedido: toAdminOrderDTO(order) } });
};

const ALLOWED_OPERATIONAL_TRANSITIONS = {
  [ORDER_STATUS_PENDING]: [
    ORDER_STATUS_PENDING,
    ORDER_STATUS_PAID,
    ORDER_STATUS_CANCELLED,
  ],
  [ORDER_STATUS_PAID]: [
    ORDER_STATUS_PAID,
    ORDER_STATUS_PREPARING,
    ORDER_STATUS_CANCELLED,
  ],
  [ORDER_STATUS_PREPARING]: [
    ORDER_STATUS_PREPARING,
    ORDER_STATUS_SHIPPED,
    ORDER_STATUS_CANCELLED,
  ],
  [ORDER_STATUS_SHIPPED]: [
    ORDER_STATUS_SHIPPED,
    ORDER_STATUS_DELIVERED,
  ],
  [ORDER_STATUS_DELIVERED]: [ORDER_STATUS_DELIVERED],
  [ORDER_STATUS_CANCELLED]: [ORDER_STATUS_CANCELLED],
};

export const validateOperationalTransition = (order, requestedStatus) => {
  if (
    order.requiresReview &&
    ![order.estadoOperativo, ORDER_STATUS_CANCELLED].includes(requestedStatus)
  ) {
    throw new AppError(
      409,
      "ORDER_REQUIRES_REVIEW",
      "El pedido requiere conciliación de pago antes de poder avanzar.",
    );
  }

  if (
    ![ORDER_STATUS_PENDING, ORDER_STATUS_CANCELLED].includes(requestedStatus) &&
    order.estadoPago !== PAYMENT_STATUS_APPROVED
  ) {
    throw new AppError(
      409,
      "PAYMENT_NOT_APPROVED",
      "El pedido no puede avanzar sin un pago aprobado.",
    );
  }

  if (
    !ALLOWED_OPERATIONAL_TRANSITIONS[order.estadoOperativo]?.includes(
      requestedStatus,
    )
  ) {
    throw new AppError(
      409,
      "INVALID_ORDER_TRANSITION",
      "El cambio de estado operativo no está permitido.",
    );
  }
};

export const actualizarEstadoPedidoAdmin = async (req, res) => {
  const session = await mongoose.startSession();
  let updatedOrder;

  try {
    await session.withTransaction(async () => {
      const order = await Pedido.findById(req.params.id).session(session);
      if (!order) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
      }

      const requestedStatus = req.body.estadoOperativo;
      normalizarStockStateLegacy(order);
      validateOperationalTransition(order, requestedStatus);

      if (requestedStatus === ORDER_STATUS_CANCELLED) {
        await restaurarStockPedido({
          order,
          session,
          reason: "admin_cancelled",
        });

        if (order.estadoPago === PAYMENT_STATUS_APPROVED) {
          order.requiresReview = true;
          order.reviewReason = order.pago?.additionalPaymentIds?.length
            ? "admin_cancelled_multiple_refunds_required"
            : "admin_cancelled_refund_required";
        }
      }

      order.estadoOperativo = requestedStatus;
      await order.save({ session });
      updatedOrder = order;
    });
  } finally {
    await session.endSession();
  }

  return res.json({ data: { pedido: toAdminOrderDTO(updatedOrder) } });
};
