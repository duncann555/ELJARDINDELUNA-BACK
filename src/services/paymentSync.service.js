import mongoose from "mongoose";
import Pedido from "../models/pedido.js";
import AppError from "../helpers/AppError.js";
import {
  CURRENCY_ARS,
  PAYMENT_STATUS_APPROVED,
  PAYMENT_STATUS_CANCELLED,
  PAYMENT_STATUS_CHARGED_BACK,
  PAYMENT_STATUS_IN_PROCESS,
  PAYMENT_STATUS_PENDING,
  PAYMENT_STATUS_REFUNDED,
  PAYMENT_STATUS_REJECTED,
} from "../constants/pagos.js";
import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_PAID,
  ORDER_STATUS_PENDING,
  STOCK_STATE_COMMITTED,
  STOCK_STATE_RESERVED,
} from "../constants/pedidos.js";
import {
  descontarStockPedido,
  normalizarStockStateLegacy,
  puedeRestaurarStockComprometido,
  restaurarStockPedido,
} from "./pedidoInventory.service.js";
import {
  normalizeMercadoPagoStatus,
  paymentBelongsToPreference,
} from "./mercadoPago.service.js";
import { isCentAmount, roundMoney } from "../helpers/money.js";

const TERMINAL_PAYMENT_STATUSES = new Set([
  PAYMENT_STATUS_REFUNDED,
  PAYMENT_STATUS_CHARGED_BACK,
]);
const NON_APPROVED_PAYMENT_STATUSES = new Set([
  PAYMENT_STATUS_PENDING,
  PAYMENT_STATUS_IN_PROCESS,
  PAYMENT_STATUS_REJECTED,
  PAYMENT_STATUS_CANCELLED,
]);

export const shouldIgnorePaymentUpdate = ({
  currentStatus,
  currentPaymentId,
  incomingStatus,
  incomingPaymentId,
}) => {
  if (TERMINAL_PAYMENT_STATUSES.has(currentStatus)) return true;
  if (currentStatus !== PAYMENT_STATUS_APPROVED) return false;
  if (incomingStatus === PAYMENT_STATUS_APPROVED) {
    return String(currentPaymentId || "") === String(incomingPaymentId || "");
  }
  return NON_APPROVED_PAYMENT_STATUSES.has(incomingStatus);
};

const applyPaymentMetadata = ({ order, payment, status }) => {
  order.pago ||= {};
  order.pago.paymentId = String(payment.id);
  order.pago.statusDetail = String(payment.status_detail || "");
  order.pago.currency = String(payment.currency_id || "");
  order.pago.amount = Number(payment.transaction_amount);
  order.pago.lastEventAt = new Date();
  order.estadoPago = status;
};

export const buildApprovedWithoutStockUpdate = (payment) => ({
  estadoPago: PAYMENT_STATUS_APPROVED,
  estadoOperativo: ORDER_STATUS_CANCELLED,
  "pago.paymentId": String(payment.id),
  "pago.statusDetail": String(payment.status_detail || ""),
  "pago.currency": String(payment.currency_id || ""),
  "pago.amount": Number(payment.transaction_amount),
  "pago.approvedAt": payment.date_approved
    ? new Date(payment.date_approved)
    : new Date(),
  "pago.lastEventAt": new Date(),
  requiresReview: true,
  reviewReason: "approved_without_available_stock",
});

const recordAdditionalApprovedPayment = async ({ orderId, paymentId }) =>
  Pedido.findOneAndUpdate(
    {
      _id: orderId,
      "pago.paymentId": { $ne: String(paymentId) },
      "pago.additionalPaymentIds": { $ne: String(paymentId) },
      estadoPago: PAYMENT_STATUS_APPROVED,
    },
    {
      $addToSet: {
        "pago.additionalPaymentIds": String(paymentId),
      },
      $set: {
        requiresReview: true,
        reviewReason: `double_payment_review:${String(paymentId).slice(0, 120)}`,
        "pago.lastEventAt": new Date(),
      },
    },
    { new: true },
  );

const markApprovedWithoutStock = async ({ orderId, payment }) => {
  const updated = await Pedido.findOneAndUpdate(
    {
      _id: orderId,
      stockState: { $nin: [STOCK_STATE_COMMITTED, STOCK_STATE_RESERVED] },
      estadoPago: {
        $nin: [
          PAYMENT_STATUS_APPROVED,
          PAYMENT_STATUS_REFUNDED,
          PAYMENT_STATUS_CHARGED_BACK,
        ],
      },
    },
    { $set: buildApprovedWithoutStockUpdate(payment) },
    { new: true },
  );
  if (updated) return updated;

  const additional = await recordAdditionalApprovedPayment({
    orderId,
    paymentId: payment.id,
  });
  return additional || Pedido.findById(orderId);
};

const addAdditionalApprovedPayment = ({ order, paymentId }) => {
  order.pago.additionalPaymentIds ||= [];
  const normalizedId = String(paymentId);
  if (!order.pago.additionalPaymentIds.includes(normalizedId)) {
    order.pago.additionalPaymentIds.push(normalizedId);
  }
  order.pago.lastEventAt = new Date();
  order.requiresReview = true;
  order.reviewReason = `double_payment_review:${normalizedId.slice(0, 120)}`;
};

const isSettledOrder = (order) =>
  order.estadoPago === PAYMENT_STATUS_APPROVED ||
  TERMINAL_PAYMENT_STATUSES.has(order.estadoPago) ||
  order.stockState === STOCK_STATE_COMMITTED;

const isAdministrativeCancellation = (order) =>
  order.estadoOperativo === ORDER_STATUS_CANCELLED &&
  order.stockReleaseReason === "admin_cancelled";

const applyApprovedPayment = async ({
  order,
  payment,
  session,
  decrementStock,
}) => {
  applyPaymentMetadata({
    order,
    payment,
    status: PAYMENT_STATUS_APPROVED,
  });
  order.pago.approvedAt = payment.date_approved
    ? new Date(payment.date_approved)
    : new Date();

  if (isAdministrativeCancellation(order)) {
    order.estadoOperativo = ORDER_STATUS_CANCELLED;
    order.requiresReview = true;
    order.reviewReason = "approved_after_cancellation_refund_required";
    return;
  }

  await decrementStock({ order, session });
  if (
    [ORDER_STATUS_PENDING, ORDER_STATUS_CANCELLED].includes(
      order.estadoOperativo,
    )
  ) {
    order.estadoOperativo = ORDER_STATUS_PAID;
  }

  const refundedAmount = Number(payment.transaction_amount_refunded || 0);
  if (isCentAmount(refundedAmount) && refundedAmount > 0) {
    const accumulatedRefundedAmount = Math.max(
      Number(order.pago.refundedAmount || 0),
      refundedAmount,
    );
    order.pago.refundedAmount = accumulatedRefundedAmount;
    order.requiresReview = true;
    order.reviewReason = `partial_refund_review:${roundMoney(
      accumulatedRefundedAmount,
    )}`;
  } else {
    order.requiresReview = false;
    order.reviewReason = "";
  }
};

const applyRefundedPayment = async ({
  order,
  payment,
  status,
  session,
  restoreStock,
}) => {
  if (order.pago.additionalPaymentIds?.length) {
    order.pago.statusDetail = String(payment.status_detail || "");
    order.pago.currency = String(payment.currency_id || "");
    order.pago.amount = Number(payment.transaction_amount);
    order.pago.refundedAmount = Number(
      payment.transaction_amount_refunded || payment.transaction_amount || 0,
    );
    order.pago.lastEventAt = new Date();
    order.estadoPago = PAYMENT_STATUS_APPROVED;
    order.requiresReview = true;
    order.reviewReason = `multiple_payments_reconciliation_required:${status}`;
    return;
  }

  applyPaymentMetadata({ order, payment, status });
  order.pago.refundedAmount = Number(
    payment.transaction_amount_refunded || payment.transaction_amount || 0,
  );

  if (
    [STOCK_STATE_COMMITTED, STOCK_STATE_RESERVED].includes(order.stockState) &&
    puedeRestaurarStockComprometido(order.estadoOperativo)
  ) {
    await restoreStock({
      order,
      session,
      reason: `payment_${status}`,
    });
    order.estadoOperativo = ORDER_STATUS_CANCELLED;
    order.requiresReview = false;
    order.reviewReason = "";
    return;
  }

  if (
    [STOCK_STATE_COMMITTED, STOCK_STATE_RESERVED].includes(order.stockState)
  ) {
    order.requiresReview = true;
    order.reviewReason = `${status}_after_fulfillment`;
    return;
  }

  await restoreStock({
    order,
    session,
    reason: `payment_${status}`,
  });
  order.estadoOperativo = ORDER_STATUS_CANCELLED;
  order.requiresReview = false;
  order.reviewReason = "";
};

export const applyPaymentStateTransition = async ({
  order,
  payment,
  session,
  decrementStock = descontarStockPedido,
  restoreStock = restaurarStockPedido,
}) => {
  normalizarStockStateLegacy(order);
  order.pago ||= {};

  const reportedStatus = normalizeMercadoPagoStatus(payment.status);
  const paymentAmount = Number(payment.transaction_amount);
  const reportedRefundedAmount = Number(
    payment.transaction_amount_refunded || 0,
  );
  const status =
    reportedStatus === PAYMENT_STATUS_APPROVED &&
    isCentAmount(paymentAmount) &&
    paymentAmount > 0 &&
    isCentAmount(reportedRefundedAmount) &&
    reportedRefundedAmount >= paymentAmount
      ? PAYMENT_STATUS_REFUNDED
      : reportedStatus;
  const currentPaymentId = String(order.pago.paymentId || "");
  const incomingPaymentId = String(payment.id || "");

  if (
    status === PAYMENT_STATUS_APPROVED &&
    currentPaymentId &&
    currentPaymentId !== incomingPaymentId &&
    isSettledOrder(order)
  ) {
    addAdditionalApprovedPayment({
      order,
      paymentId: incomingPaymentId,
    });
    return order;
  }

  if (
    currentPaymentId &&
    currentPaymentId !== incomingPaymentId &&
    isSettledOrder(order)
  ) {
    order.pago.lastEventAt = new Date();
    return order;
  }

  const refundedAmount = Number(payment.transaction_amount_refunded || 0);
  if (
    order.estadoPago === PAYMENT_STATUS_APPROVED &&
    status === PAYMENT_STATUS_APPROVED &&
    currentPaymentId === incomingPaymentId &&
    isCentAmount(refundedAmount) &&
    refundedAmount > 0
  ) {
    const accumulatedRefundedAmount = Math.max(
      Number(order.pago.refundedAmount || 0),
      refundedAmount,
    );
    order.pago.refundedAmount = accumulatedRefundedAmount;
    order.pago.lastEventAt = new Date();
    order.requiresReview = true;
    order.reviewReason = `partial_refund_review:${roundMoney(
      accumulatedRefundedAmount,
    )}`;
    return order;
  }

  if (
    shouldIgnorePaymentUpdate({
      currentStatus: order.estadoPago,
      currentPaymentId,
      incomingStatus: status,
      incomingPaymentId,
    })
  ) {
    order.pago.lastEventAt = new Date();
    return order;
  }

  if (status === PAYMENT_STATUS_APPROVED) {
    await applyApprovedPayment({
      order,
      payment,
      session,
      decrementStock,
    });
    return order;
  }

  if (TERMINAL_PAYMENT_STATUSES.has(status)) {
    await applyRefundedPayment({
      order,
      payment,
      status,
      session,
      restoreStock,
    });
    return order;
  }

  applyPaymentMetadata({ order, payment, status });
  return order;
};

export const applyVerifiedPaymentToOrder = async ({ orderId, payment }) => {
  const session = await mongoose.startSession();
  let updatedOrder;

  try {
    await session.withTransaction(async () => {
      const order = await Pedido.findById(orderId).session(session);
      if (!order) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
      }

      await applyPaymentStateTransition({ order, payment, session });
      await order.save({ session });
      updatedOrder = order;
    });
  } catch (error) {
    if (error?.code === "INSUFFICIENT_STOCK_AFTER_PAYMENT") {
      return markApprovedWithoutStock({ orderId, payment });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return updatedOrder;
};

export const findPaymentOrderByExternalReference = async (
  externalReference,
) => {
  const canonical = await Pedido.findOne({ externalReference });
  if (canonical || !mongoose.isValidObjectId(externalReference)) {
    return canonical;
  }
  return Pedido.findById(externalReference);
};

const markPaymentMismatch = ({ orderId, reason, paymentId }) =>
  Pedido.updateOne(
    { _id: orderId },
    {
      $set: {
        requiresReview: true,
        reviewReason: `${reason}:${String(paymentId || "").slice(0, 120)}`,
      },
    },
  );

export const syncVerifiedMercadoPagoPayment = async ({
  payment,
  verifyPreference = paymentBelongsToPreference,
  findOrder = findPaymentOrderByExternalReference,
  applyPayment = applyVerifiedPaymentToOrder,
  markMismatch = markPaymentMismatch,
}) => {
  const paymentId = String(payment?.id || "").trim();
  const externalReference = String(payment?.external_reference || "").trim();
  if (!paymentId || !externalReference) {
    throw new AppError(
      400,
      "INVALID_PAYMENT_DATA",
      "El pago no contiene los identificadores necesarios.",
    );
  }

  const order = await findOrder(externalReference);
  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Pedido no encontrado.");
  }

  const rejectMismatch = async (code, message, reason) => {
    await markMismatch({
      orderId: order._id,
      reason,
      paymentId,
    });
    throw new AppError(400, code, message);
  };

  const amount = Number(payment.transaction_amount);
  if (
    !isCentAmount(amount) ||
    roundMoney(amount) !== roundMoney(order.total)
  ) {
    return rejectMismatch(
      "PAYMENT_AMOUNT_MISMATCH",
      "El monto del pago no coincide con el pedido.",
      "payment_amount_mismatch",
    );
  }
  const refundedAmount = Number(payment.transaction_amount_refunded || 0);
  if (!isCentAmount(refundedAmount) || refundedAmount > amount) {
    return rejectMismatch(
      "PAYMENT_REFUND_AMOUNT_MISMATCH",
      "El monto reembolsado del pago no es válido.",
      "payment_refund_amount_mismatch",
    );
  }
  if (String(payment.currency_id) !== CURRENCY_ARS) {
    return rejectMismatch(
      "PAYMENT_CURRENCY_MISMATCH",
      "La moneda del pago no coincide con el pedido.",
      "payment_currency_mismatch",
    );
  }
  if (!order.pago?.preferenceId) {
    return rejectMismatch(
      "ORDER_WITHOUT_PREFERENCE",
      "El pedido no tiene una preferencia asociada.",
      "order_without_preference",
    );
  }

  const alreadyAssociated =
    String(order.pago.paymentId || "") === paymentId ||
    order.pago.additionalPaymentIds?.includes(paymentId);
  const belongs =
    alreadyAssociated ||
    (await verifyPreference({
      paymentId,
      preferenceId: order.pago.preferenceId,
    }));
  if (!belongs) {
    return rejectMismatch(
      "PAYMENT_PREFERENCE_MISMATCH",
      "El pago no corresponde a la preferencia del pedido.",
      "payment_preference_mismatch",
    );
  }

  return applyPayment({
    orderId: order._id,
    payment,
  });
};
