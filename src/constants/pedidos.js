export const ORDER_STATUS_PENDING = "pendiente";
export const ORDER_STATUS_PAID = "pagado";
export const ORDER_STATUS_PREPARING = "preparando";
export const ORDER_STATUS_SHIPPED = "enviado";
export const ORDER_STATUS_DELIVERED = "entregado";
export const ORDER_STATUS_CANCELLED = "cancelado";

export const ORDER_STATUSES = [
  ORDER_STATUS_PENDING,
  ORDER_STATUS_PAID,
  ORDER_STATUS_PREPARING,
  ORDER_STATUS_SHIPPED,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_CANCELLED,
];

const LEGACY_OPERATIONAL_STATUS_MAP = {
  "En espera de pago": ORDER_STATUS_PENDING,
  "Preparando envío": ORDER_STATUS_PREPARING,
  Despachado: ORDER_STATUS_SHIPPED,
  Entregado: ORDER_STATUS_DELIVERED,
  Cancelado: ORDER_STATUS_CANCELLED,
};

export const resolveOperationalStatus = (
  canonicalStatus,
  legacyStatus,
) =>
  ORDER_STATUSES.includes(canonicalStatus)
    ? canonicalStatus
    : LEGACY_OPERATIONAL_STATUS_MAP[legacyStatus];

export const ORDER_STATUSES_ALLOW_STOCK_RESTORE = [
  ORDER_STATUS_PENDING,
  ORDER_STATUS_PAID,
  ORDER_STATUS_PREPARING,
  ORDER_STATUS_CANCELLED,
];

export const STOCK_STATE_PENDING = "pending";
// Sólo se lee para pedidos creados por la implementación anterior.
export const STOCK_STATE_RESERVED = "reserved";
export const STOCK_STATE_COMMITTED = "committed";
export const STOCK_STATE_RELEASED = "released";

export const STOCK_STATES = [
  STOCK_STATE_PENDING,
  STOCK_STATE_RESERVED,
  STOCK_STATE_COMMITTED,
  STOCK_STATE_RELEASED,
];

export const DELIVERY_METHOD_HOME = "domicilio";
export const DELIVERY_METHOD_PICKUP = "retiro";
export const DELIVERY_METHODS = [
  DELIVERY_METHOD_HOME,
  DELIVERY_METHOD_PICKUP,
];
