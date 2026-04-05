export const ESTADO_PEDIDO_EN_ESPERA_PAGO = "En espera de pago";
export const ESTADO_PEDIDO_PREPARANDO_ENVIO = "Preparando env\u00edo";
export const ESTADO_PEDIDO_DESPACHADO = "Despachado";
export const ESTADO_PEDIDO_ENTREGADO = "Entregado";
export const ESTADO_PEDIDO_CANCELADO = "Cancelado";

export const PEDIDO_ESTADOS = [
  ESTADO_PEDIDO_EN_ESPERA_PAGO,
  ESTADO_PEDIDO_PREPARANDO_ENVIO,
  ESTADO_PEDIDO_DESPACHADO,
  ESTADO_PEDIDO_ENTREGADO,
  ESTADO_PEDIDO_CANCELADO,
];

export const PEDIDO_ESTADOS_REQUIEREN_PAGO_APROBADO = [
  ESTADO_PEDIDO_PREPARANDO_ENVIO,
  ESTADO_PEDIDO_DESPACHADO,
  ESTADO_PEDIDO_ENTREGADO,
];

export const puedeUsarEstadoPedidoConPago = ({
  estadoPedido,
  estadoPago,
}) => {
  if (estadoPago === "approved") {
    return PEDIDO_ESTADOS.includes(estadoPedido);
  }

  return [
    ESTADO_PEDIDO_EN_ESPERA_PAGO,
    ESTADO_PEDIDO_CANCELADO,
  ].includes(estadoPedido);
};

export const pedidoDebeMantenerStockDescontado = ({
  estadoPedido,
  estadoPago,
}) =>
  estadoPago === "approved" && estadoPedido !== ESTADO_PEDIDO_CANCELADO;
