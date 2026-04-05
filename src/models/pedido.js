import mongoose, { Schema } from "mongoose";
import { PEDIDO_ESTADOS } from "../constants/pedidos.js";

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
    pago: {
      proveedor: {
        type: String,
        default: "MercadoPago",
      },
      preferenceId: String,
      paymentId: String,
      estado: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
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
