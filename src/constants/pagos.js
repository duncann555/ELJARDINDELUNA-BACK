export const METODO_PAGO_MERCADO_PAGO = "mercado_pago";
export const METODO_PAGO_TRANSFERENCIA = "transferencia";

export const METODOS_PAGO_PEDIDO = [
  METODO_PAGO_MERCADO_PAGO,
  METODO_PAGO_TRANSFERENCIA,
];

export const ESTADO_PAGO_PENDIENTE = "pending";
export const ESTADO_PAGO_APROBADO = "approved";
export const ESTADO_PAGO_RECHAZADO = "rejected";

export const ESTADOS_PAGO_PEDIDO = [
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_RECHAZADO,
];

export const PROVEEDOR_PAGO_MERCADO_PAGO = "Mercado Pago";
export const PROVEEDOR_PAGO_TRANSFERENCIA = "Transferencia bancaria";

export const DESCUENTO_TRANSFERENCIA = Number(
  process.env.TRANSFER_DISCOUNT_RATE || 0.07,
);
