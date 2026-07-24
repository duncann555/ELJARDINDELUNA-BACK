import mongoose, { Schema } from "mongoose";
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_APPROVED,
  PAYMENT_STATUS_CHARGED_BACK,
  PAYMENT_STATUS_REFUNDED,
} from "../constants/pagos.js";
import {
  DELIVERY_METHODS,
  DELIVERY_METHOD_HOME,
  ORDER_STATUS_CANCELLED,
  ORDER_STATUSES,
  resolveOperationalStatus,
  STOCK_STATE_COMMITTED,
  STOCK_STATE_PENDING,
  STOCK_STATE_RELEASED,
  STOCK_STATES,
} from "../constants/pedidos.js";
import {
  buildCompatibleCustomer,
  buildCompatibleDelivery,
  resolveHistoricalPaymentProvider,
} from "../helpers/legacyOrderCompatibility.js";
import { isCentAmount, roundMoney } from "../helpers/money.js";

const orderItemSchema = new Schema(
  {
    producto: {
      type: Schema.Types.ObjectId,
      ref: "producto",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: isCentAmount,
        message: "El precio admite como máximo dos decimales",
      },
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
      validate: {
        validator: Number.isInteger,
        message: "La cantidad debe ser entera",
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: isCentAmount,
        message: "El subtotal admite como máximo dos decimales",
      },
    },

    // Snapshot legacy.
    nombre: String,
    precio: Number,
    precioUnitario: Number,
    cantidad: Number,
  },
  { _id: true },
);

orderItemSchema.pre("validate", function syncLegacyItem() {
  this.name ||= this.nombre;
  this.price ??= this.precioUnitario ?? this.precio;
  this.quantity ??= this.cantidad;
  if (
    this.subtotal == null &&
    Number.isFinite(Number(this.price)) &&
    Number.isInteger(Number(this.quantity))
  ) {
    this.subtotal = roundMoney(Number(this.price) * Number(this.quantity));
  }
});

const customerSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 50 },
    apellido: { type: String, required: true, trim: true, maxlength: 50 },
    telefono: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
      match: /^\d{8,15}$/,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
  },
  { _id: false },
);

const deliverySchema = new Schema(
  {
    metodo: { type: String, enum: DELIVERY_METHODS, required: true },
    provincia: { type: String, trim: true, maxlength: 100, default: "" },
    localidad: { type: String, trim: true, maxlength: 100, default: "" },
    codigoPostal: { type: String, trim: true, maxlength: 12, default: "" },
    direccion: { type: String, trim: true, maxlength: 180, default: "" },
    aclaraciones: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { _id: false },
);

deliverySchema.path("metodo").validate(function validateHomeDelivery() {
  if (this.metodo !== DELIVERY_METHOD_HOME) return true;
  return ["provincia", "localidad", "codigoPostal", "direccion"].every(
    (field) => String(this[field] || "").trim(),
  );
}, "La entrega a domicilio está incompleta");

const paymentSchema = new Schema(
  {
    provider: { type: String, trim: true },
    preferenceId: { type: String, trim: true },
    checkoutUrl: { type: String, trim: true },
    preferenceValidFrom: Date,
    preferenceExpiresAt: Date,
    paymentId: { type: String, trim: true },
    additionalPaymentIds: {
      type: [String],
      default: [],
      validate: {
        validator: (ids) => ids.length <= 20,
        message: "Hay demasiados pagos adicionales asociados",
      },
    },
    statusDetail: { type: String, trim: true, maxlength: 240, default: "" },
    currency: { type: String, default: "ARS" },
    amount: {
      type: Number,
      min: 0,
      validate: {
        validator: (value) => value == null || isCentAmount(value),
        message: "Monto de pago inválido",
      },
    },
    refundedAmount: {
      type: Number,
      min: 0,
      validate: {
        validator: (value) => value == null || isCentAmount(value),
        message: "Monto reembolsado inválido",
      },
    },
    approvedAt: Date,
    lastEventAt: Date,
    proveedor: String,
    estado: String,
    statusDetalle: String,
    fechaPago: Date,
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    numero: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    externalReference: {
      type: String,
      required: true,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
    },
    requestFingerprint: {
      type: String,
      required: true,
      trim: true,
    },
    cliente: {
      type: customerSchema,
      required: true,
    },
    entrega: {
      type: deliverySchema,
      required: true,
    },
    productos: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0 && items.length <= 50,
        message: "El pedido debe contener entre 1 y 50 productos",
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: isCentAmount, message: "Subtotal inválido" },
    },
    costoEnvio: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: isCentAmount, message: "Costo de envío inválido" },
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: isCentAmount, message: "Total inválido" },
    },
    estadoPago: {
      type: String,
      enum: PAYMENT_STATUSES,
      required: true,
      index: true,
    },
    estadoOperativo: {
      type: String,
      enum: ORDER_STATUSES,
      required: true,
      index: true,
    },
    stockState: {
      type: String,
      enum: STOCK_STATES,
      required: true,
      index: true,
    },
    stockCommittedAt: Date,
    stockReleasedAt: Date,
    stockReleaseReason: { type: String, trim: true, maxlength: 120 },
    pago: {
      type: paymentSchema,
      default: () => ({}),
    },
    preferenceCreationState: {
      type: String,
      enum: ["pending", "creating", "created", "failed"],
      default: "pending",
    },
    preferenceClaimedAt: Date,
    preferenceClaimToken: { type: String, trim: true, maxlength: 64 },
    preferenceErrorCode: { type: String, trim: true, maxlength: 120 },
    requiresReview: { type: Boolean, default: false, index: true },
    reviewReason: { type: String, trim: true, maxlength: 300, default: "" },
    // Compatibilidad de lectura con documentos anteriores.
    datosCliente: { type: Schema.Types.Mixed },
    emailComprador: String,
    datosEnvio: { type: Schema.Types.Mixed },
    envio: { type: Schema.Types.Mixed },
    metodoPago: String,
    estadoPedido: String,
    stockDescontado: Boolean,
    inventario: { type: Schema.Types.Mixed },
    descuento: {
      type: Number,
      min: 0,
      validate: {
        validator: (value) => value == null || isCentAmount(value),
        message: "Descuento inválido",
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

orderSchema.index({ numero: 1 }, { unique: true, sparse: true });
orderSchema.index(
  { externalReference: 1 },
  { unique: true, sparse: true },
);
orderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
orderSchema.index(
  { "pago.preferenceId": 1 },
  {
    unique: true,
    partialFilterExpression: { "pago.preferenceId": { $gt: "" } },
  },
);
orderSchema.index(
  { "pago.paymentId": 1 },
  {
    unique: true,
    partialFilterExpression: { "pago.paymentId": { $gt: "" } },
  },
);
orderSchema.index({ createdAt: -1 });

orderSchema.pre("validate", function syncLegacyOrder() {
  const legacyId = String(this._id || new mongoose.Types.ObjectId());
  this.numero ||= `EJL-LEGACY-${legacyId.toUpperCase()}`;
  this.externalReference ||= legacyId;
  this.idempotencyKey ||= `legacy:${legacyId}`;
  this.requestFingerprint ||= `legacy:${legacyId}`;

  if (!this.cliente) {
    const legacyDelivery = {
      ...(this.envio || {}),
      ...(this.datosEnvio || {}),
    };
    this.cliente = buildCompatibleCustomer({
      customer: this.datosCliente || {},
      delivery: legacyDelivery,
      fallbackEmail: this.emailComprador,
    });
  }

  if (!this.entrega) {
    this.entrega = buildCompatibleDelivery({
      ...(this.envio || {}),
      ...(this.datosEnvio || {}),
    });
  }

  if (this.costoEnvio == null && this.envio?.costo != null) {
    this.costoEnvio = Number(this.envio.costo);
  }
  this.estadoPago ||= this.pago?.estado;
  this.estadoOperativo = resolveOperationalStatus(
    this.estadoOperativo,
    this.estadoPedido,
  );

  if (!this.stockState) {
    const legacyDiscounted =
      this.stockDescontado ?? this.inventario?.descontado;
    const paymentStatus = this.estadoPago || this.pago?.estado;
    if (legacyDiscounted === true) {
      this.stockState = STOCK_STATE_COMMITTED;
    } else if (legacyDiscounted === false) {
      this.stockState =
        paymentStatus === PAYMENT_STATUS_APPROVED ||
        [PAYMENT_STATUS_REFUNDED, PAYMENT_STATUS_CHARGED_BACK].includes(
          paymentStatus,
        ) ||
        this.estadoOperativo === ORDER_STATUS_CANCELLED
          ? STOCK_STATE_RELEASED
          : STOCK_STATE_PENDING;
    } else if (paymentStatus === PAYMENT_STATUS_APPROVED) {
      this.stockState = STOCK_STATE_COMMITTED;
    } else if (
      [PAYMENT_STATUS_REFUNDED, PAYMENT_STATUS_CHARGED_BACK].includes(
        paymentStatus,
      ) ||
      this.estadoOperativo === ORDER_STATUS_CANCELLED
    ) {
      this.stockState = STOCK_STATE_RELEASED;
    } else {
      this.stockState = STOCK_STATE_PENDING;
    }
  }
  if (
    this.estadoPago === PAYMENT_STATUS_APPROVED &&
    this.estadoOperativo === ORDER_STATUS_CANCELLED &&
    this.stockState === STOCK_STATE_RELEASED &&
    !this.requiresReview
  ) {
    this.requiresReview = true;
    this.reviewReason = "legacy_approved_cancelled_refund_check";
  }

  this.pago ||= {};
  this.pago.provider ||= resolveHistoricalPaymentProvider(this);

  const lineSubtotal = roundMoney(
    (this.productos || []).reduce(
      (sum, item) =>
        sum +
        Number(
          item.subtotal ??
            Number(item.price ?? item.precioUnitario ?? item.precio) *
              Number(item.quantity ?? item.cantidad),
        ),
      0,
    ),
  );
  if (
    this.productos?.length &&
    isCentAmount(this.subtotal) &&
    Math.abs(lineSubtotal - Number(this.subtotal)) > 0.01
  ) {
    this.invalidate("subtotal", "El subtotal no coincide con los productos");
  }
  if (
    isCentAmount(this.subtotal) &&
    isCentAmount(this.descuento ?? 0) &&
    isCentAmount(this.costoEnvio) &&
    isCentAmount(this.total) &&
    Math.abs(
      roundMoney(
        Number(this.subtotal) -
          Number(this.descuento ?? 0) +
          Number(this.costoEnvio),
      ) -
        Number(this.total),
    ) > 0.01
  ) {
    this.invalidate(
      "total",
      "El total no coincide con subtotal - descuento + costoEnvio",
    );
  }
});

export default mongoose.model("pedido", orderSchema);
