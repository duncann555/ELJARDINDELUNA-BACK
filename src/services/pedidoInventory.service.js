import mongoose from "mongoose";
import Producto from "../models/producto.js";
import AppError from "../helpers/AppError.js";
import { roundMoney } from "../helpers/money.js";
import {
  PAYMENT_STATUS_APPROVED,
  PAYMENT_STATUS_CHARGED_BACK,
  PAYMENT_STATUS_REFUNDED,
} from "../constants/pagos.js";
import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUSES_ALLOW_STOCK_RESTORE,
  STOCK_STATE_COMMITTED,
  STOCK_STATE_PENDING,
  STOCK_STATE_RELEASED,
  STOCK_STATE_RESERVED,
  STOCK_STATES,
  resolveOperationalStatus,
} from "../constants/pedidos.js";

const LATE_PAYMENT_RELEASE_REASONS = new Set([
  "reservation_expired",
  "payment_rejected",
  "payment_cancelled",
  "preference_creation_failed",
  "legacy_payment_pending",
]);

export const agruparLineasProducto = (items = []) => {
  const grouped = new Map();

  for (const item of items) {
    const productId = String(item?.productoId || "").trim();
    const quantity = Number(item?.cantidad);

    if (
      !mongoose.isValidObjectId(productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new AppError(
        400,
        "INVALID_CART",
        "El carrito contiene productos o cantidades inválidas.",
      );
    }

    const accumulated = (grouped.get(productId) || 0) + quantity;
    if (accumulated > 50) {
      throw new AppError(
        400,
        "INVALID_CART_QUANTITY",
        "No se pueden comprar más de 50 unidades de un producto.",
      );
    }
    grouped.set(productId, accumulated);
  }

  return [...grouped.entries()].map(([productoId, cantidad]) => ({
    productoId,
    cantidad,
  }));
};

const isProductActive = (product) =>
  product?.active === true ||
  (product?.active === undefined && product?.estado === "Activo");

export const construirSnapshotProducto = ({ product, quantity }) => {
  const name = String(product?.name || product?.nombre || "").trim();
  const price = Number(product?.price ?? product?.precio);
  const stock = Number(product?.stock);

  if (
    !name ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    throw new AppError(
      409,
      "PRODUCT_DATA_INVALID",
      "Uno de los productos tiene datos inválidos y no puede venderse.",
    );
  }
  if (!isProductActive(product)) {
    throw new AppError(
      409,
      "PRODUCT_NOT_AVAILABLE",
      "Uno de los productos ya no está disponible.",
    );
  }
  if (stock < quantity) {
    throw new AppError(
      409,
      "INSUFFICIENT_STOCK",
      "Uno de los productos ya no tiene stock suficiente.",
    );
  }

  const unitPrice = roundMoney(price);
  return {
    producto: product._id,
    name,
    price: unitPrice,
    quantity,
    subtotal: roundMoney(unitPrice * quantity),
  };
};

export const obtenerSnapshotsProductos = async ({
  items,
  findProducts = (ids) => Producto.find({ _id: { $in: ids } }),
}) => {
  const groupedItems = agruparLineasProducto(items);
  const products = await findProducts(
    groupedItems.map((item) => item.productoId),
  );
  const productsById = new Map(
    products.map((product) => [String(product._id), product]),
  );

  return groupedItems.map((item) => {
    const product = productsById.get(item.productoId);
    if (!product) {
      throw new AppError(
        404,
        "PRODUCT_NOT_FOUND",
        "Uno de los productos no existe.",
      );
    }
    return construirSnapshotProducto({
      product,
      quantity: item.cantidad,
    });
  });
};

export const getOrderItemQuantity = (
  item,
  { code = "ORDER_ITEM_INVALID_DURING_STOCK_CHANGE" } = {},
) => {
  const quantity = Number(item?.quantity ?? item?.cantidad);
  if (
    !mongoose.isValidObjectId(item?.producto) ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    throw new AppError(
      409,
      code,
      "Una línea del pedido tiene datos inválidos; el stock no fue modificado.",
    );
  }
  return quantity;
};

export const normalizarStockStateLegacy = (order) => {
  order.estadoOperativo =
    resolveOperationalStatus(order.estadoOperativo, order.estadoPedido) ||
    order.estadoOperativo;

  if (STOCK_STATES.includes(order.stockState)) return order.stockState;

  const legacyDiscounted =
    order.stockDescontado ?? order.inventario?.descontado;
  const paymentStatus = order.estadoPago || order.pago?.estado;

  if (legacyDiscounted === true) {
    order.stockState = STOCK_STATE_COMMITTED;
  } else if (legacyDiscounted === false) {
    order.stockState =
      paymentStatus === PAYMENT_STATUS_APPROVED ||
      [PAYMENT_STATUS_REFUNDED, PAYMENT_STATUS_CHARGED_BACK].includes(
        paymentStatus,
      ) ||
      order.estadoOperativo === ORDER_STATUS_CANCELLED
        ? STOCK_STATE_RELEASED
        : STOCK_STATE_PENDING;
  } else if (paymentStatus === PAYMENT_STATUS_APPROVED) {
    order.stockState = STOCK_STATE_COMMITTED;
  } else if (
    [PAYMENT_STATUS_REFUNDED, PAYMENT_STATUS_CHARGED_BACK].includes(
      paymentStatus,
    ) ||
    order.estadoOperativo === ORDER_STATUS_CANCELLED
  ) {
    order.stockState = STOCK_STATE_RELEASED;
  } else {
    order.stockState = STOCK_STATE_PENDING;
  }

  return order.stockState;
};

export const puedeDescontarPedidoLiberado = (order) =>
  order.stockState !== STOCK_STATE_RELEASED ||
  LATE_PAYMENT_RELEASE_REASONS.has(order.stockReleaseReason);

export const descontarStockPedido = async ({ order, session }) => {
  normalizarStockStateLegacy(order);

  if (order.stockState === STOCK_STATE_COMMITTED) return false;
  if (order.stockState === STOCK_STATE_RESERVED) {
    order.stockState = STOCK_STATE_COMMITTED;
    order.stockCommittedAt = new Date();
    return true;
  }
  if (!puedeDescontarPedidoLiberado(order)) {
    throw new AppError(
      409,
      "ORDER_STOCK_CLOSED",
      "El pedido fue cancelado y el stock no puede descontarse.",
    );
  }

  const normalizedItems = (order.productos || []).map((item) => ({
    productId: item.producto,
    quantity: getOrderItemQuantity(item, {
      code: "ORDER_ITEM_INVALID_DURING_STOCK_DECREMENT",
    }),
  }));

  for (const item of normalizedItems) {
    const product = await Producto.findOneAndUpdate(
      {
        _id: item.productId,
        stock: { $gte: item.quantity },
      },
      { $inc: { stock: -item.quantity } },
      { new: true, session, runValidators: true },
    );
    if (!product) {
      throw new AppError(
        409,
        "INSUFFICIENT_STOCK_AFTER_PAYMENT",
        "El pago fue aprobado, pero ya no hay stock suficiente.",
      );
    }
  }

  order.stockState = STOCK_STATE_COMMITTED;
  order.stockCommittedAt = new Date();
  order.stockReleasedAt = undefined;
  order.stockReleaseReason = "";
  return true;
};

export const restaurarStockPedido = async ({
  order,
  session,
  reason,
}) => {
  normalizarStockStateLegacy(order);

  if (
    [STOCK_STATE_PENDING, STOCK_STATE_RELEASED].includes(order.stockState)
  ) {
    order.stockState = STOCK_STATE_RELEASED;
    order.stockReleasedAt ||= new Date();
    order.stockReleaseReason ||= reason;
    return false;
  }

  const normalizedItems = (order.productos || []).map((item) => ({
    productId: item.producto,
    quantity: getOrderItemQuantity(item, {
      code: "ORDER_ITEM_INVALID_DURING_STOCK_RESTORE",
    }),
  }));

  for (const item of normalizedItems) {
    const product = await Producto.findByIdAndUpdate(
      item.productId,
      { $inc: { stock: item.quantity } },
      { new: true, session, runValidators: true },
    );
    if (!product) {
      throw new AppError(
        409,
        "PRODUCT_MISSING_DURING_STOCK_RESTORE",
        "No se pudo restaurar el stock de un producto.",
      );
    }
  }

  order.stockState = STOCK_STATE_RELEASED;
  order.stockReleasedAt = new Date();
  order.stockReleaseReason = reason;
  return true;
};

export const puedeRestaurarStockComprometido = (orderStatus) =>
  ORDER_STATUSES_ALLOW_STOCK_RESTORE.includes(orderStatus);
