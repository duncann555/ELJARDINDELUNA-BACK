import mongoose, { Schema } from "mongoose";
import { PEDIDO_ESTADOS } from "../constants/pedidos.js";
import {
  ESTADOS_PAGO_PEDIDO,
  ESTADO_PAGO_PENDIENTE,
  METODOS_PAGO_PEDIDO,
  METODO_PAGO_MERCADO_PAGO,
} from "../constants/pagos.js";

const pedidoSchema = new Schema(
  {
    usuario: {
      type: Schema.Types.ObjectId,
      ref: "usuario",
      required: true,
    },
    productos: [
      {
        producto: {
          type: Schema.Types.ObjectId,
          ref: "producto",
          required: true,
        },
        nombre: String,
        precio: Number,
        cantidad: {
          type: Number,
          min: 1,
          required: true,
        },
      },
    ],
    total: {
      type: Number,
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    descuento: {
      type: Number,
      default: 0,
    },
    metodoPago: {
      type: String,
      enum: METODOS_PAGO_PEDIDO,
      default: METODO_PAGO_MERCADO_PAGO,
    },
    estadoPago: {
      type: String,
      enum: ESTADOS_PAGO_PEDIDO,
      default: ESTADO_PAGO_PENDIENTE,
    },
    pago: {
      proveedor: {
        type: String,
        default: "MercadoPago",
      },
      preferenceId: String,
      paymentId: String,
      estado: {
        type: String,
        enum: ESTADOS_PAGO_PEDIDO,
        default: ESTADO_PAGO_PENDIENTE,
      },
      statusDetalle: String,
      fechaPago: Date,
    },
    envio: {
      proveedor: {
        type: String,
        default: "Envio nacional",
      },
      provincia: String,
      ciudad: String,
      domicilio: String,
      celular: String,
      entreCalles: String,
      referencia: String,
      codigoPostal: String,
      costo: {
        type: Number,
        default: 0,
      },
      esGratis: {
        type: Boolean,
        default: false,
      },
    },
    comprobanteTransferencia: {
      url: String,
      publicId: String,
      originalName: String,
      uploadedAt: Date,
    },
    inventario: {
      descontado: {
        type: Boolean,
        default: false,
      },
      fechaActualizacion: Date,
    },
    estadoPedido: {
      type: String,
      enum: PEDIDO_ESTADOS,
      default: "En espera de pago",
    },
  },
  { timestamps: true },
);

export default mongoose.model("pedido", pedidoSchema);
