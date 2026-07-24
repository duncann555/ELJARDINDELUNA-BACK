import test from "node:test";
import assert from "node:assert/strict";
import AppError from "../src/helpers/AppError.js";
import {
  calcularTotalesCheckout,
  ensurePreferenceForOrder,
  normalizeCheckoutPayload,
} from "../src/services/checkout.service.js";
import {
  agruparLineasProducto,
  construirSnapshotProducto,
  descontarStockPedido,
  getOrderItemQuantity,
  normalizarStockStateLegacy,
  obtenerSnapshotsProductos,
  restaurarStockPedido,
} from "../src/services/pedidoInventory.service.js";
import {
  buildMercadoPagoIdempotencyKey,
  signMercadoPagoWebhook,
  verifyMercadoPagoWebhookSignature,
} from "../src/services/mercadoPago.service.js";
import {
  applyPaymentStateTransition,
  buildApprovedWithoutStockUpdate,
  shouldIgnorePaymentUpdate,
  syncVerifiedMercadoPagoPayment,
} from "../src/services/paymentSync.service.js";
import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_PAID,
  ORDER_STATUS_PENDING,
  STOCK_STATE_COMMITTED,
  STOCK_STATE_PENDING,
  STOCK_STATE_RELEASED,
} from "../src/constants/pedidos.js";
import {
  PAYMENT_STATUS_APPROVED,
  PAYMENT_STATUS_PENDING,
  PAYMENT_STATUS_REFUNDED,
} from "../src/constants/pagos.js";
import { validateOperationalTransition } from "../src/controllers/pedidos.controllers.js";
import {
  assertProductImageCapacity,
  buildProductConcurrencyFilter,
  cleanupNewCloudinaryUpload,
} from "../src/controllers/productos.controllers.js";
import errorMulter from "../src/middlewares/ErrorMulter.js";
import {
  isCompletePublicProductDTO,
  publicProductFilter,
  toProductDTO,
} from "../src/services/productos.service.js";
import Producto from "../src/models/producto.js";

const productA = "64f1c2a9633f88d5c6f12345";
const productB = "64f1c2a9633f88d5c6f12346";

const createOrder = (overrides = {}) => ({
  _id: "64f1c2a9633f88d5c6f99999",
  estadoPago: PAYMENT_STATUS_PENDING,
  estadoOperativo: ORDER_STATUS_PENDING,
  stockState: STOCK_STATE_PENDING,
  stockReleaseReason: "",
  requiresReview: false,
  reviewReason: "",
  pago: {
    preferenceId: "pref-1",
    paymentId: "",
    additionalPaymentIds: [],
  },
  productos: [
    {
      producto: productA,
      name: "Melisa",
      price: 1000,
      quantity: 2,
      subtotal: 2000,
    },
  ],
  total: 2000,
  ...overrides,
});

const createPayment = (overrides = {}) => ({
  id: "pay-1",
  status: PAYMENT_STATUS_APPROVED,
  status_detail: "accredited",
  currency_id: "ARS",
  transaction_amount: 2000,
  transaction_amount_refunded: 0,
  external_reference: "EJL-1",
  date_approved: "2026-07-24T12:00:00.000Z",
  ...overrides,
});

test("edición admin protege el stock contra escrituras concurrentes", () => {
  const updatedAt = new Date("2026-01-01T00:00:00.000Z");
  assert.deepEqual(
    buildProductConcurrencyFilter({
      _id: productA,
      stock: 8,
      updatedAt,
    }),
    { _id: productA, stock: 8, updatedAt },
  );
  assert.deepEqual(
    buildProductConcurrencyFilter({ _id: productB, stock: 3 }),
    {
      _id: productB,
      stock: 3,
      updatedAt: { $exists: false },
    },
  );
});

test("catálogo y checkout sólo consideran productos explícitamente activos", () => {
  assert.deepEqual(publicProductFilter.$or, [
    { active: true },
    { active: { $exists: false }, estado: "Activo" },
  ]);
  assert.equal(
    isCompletePublicProductDTO({
      id: productA,
      name: "Melisa",
      slug: "melisa",
      category: "Gotas",
      description: "Extracto natural de melisa",
      price: 1500,
      stock: 4,
      images: ["https://images.example/melisa.webp"],
    }),
    true,
  );
  assert.equal(
    isCompletePublicProductDTO({
      id: productA,
      name: "Producto corrupto",
      slug: "producto-corrupto",
      category: "Gotas",
      description: "No debe publicarse sin precio",
      price: null,
      stock: 4,
      images: [],
    }),
    false,
  );
  assert.equal(
    toProductDTO({
      _id: productA,
      nombre: "Producto legacy inconsistente",
      categoria: "Gotas",
      descripcion: "No debe quedar activo cuando active es null.",
      precio: 1500,
      stock: 4,
      active: null,
      estado: "Activo",
    }).active,
    false,
  );
  assert.throws(
    () =>
      construirSnapshotProducto({
        product: {
          _id: productA,
          nombre: "Producto legacy inconsistente",
          precio: 1500,
          stock: 4,
          active: null,
          estado: "Activo",
        },
        quantity: 1,
      }),
    (error) => error.code === "PRODUCT_NOT_AVAILABLE",
  );
});

test("una carga nueva de Cloudinary se limpia si no se persiste", async () => {
  const deleted = [];
  assert.equal(
    await cleanupNewCloudinaryUpload(
      { public_id: "productos/nueva-imagen" },
      async (publicId) => deleted.push(publicId),
    ),
    true,
  );
  assert.deepEqual(deleted, ["productos/nueva-imagen"]);
  assert.equal(
    await cleanupNewCloudinaryUpload(
      { secure_url: "https://images.example/existente.webp" },
      async () => deleted.push("unexpected"),
    ),
    false,
  );
});

test("cargas de imágenes rechazan exceso sin truncar ni subir", () => {
  const requestedImages = Array.from(
    { length: 8 },
    (_, index) => `https://images.example/producto-${index}.webp`,
  );
  assert.throws(
    () =>
      assertProductImageCapacity({
        hasFile: true,
        requestedImages,
      }),
    (error) =>
      error instanceof AppError &&
      error.code === "TOO_MANY_PRODUCT_IMAGES",
  );
  assert.doesNotThrow(() =>
    assertProductImageCapacity({
      hasFile: true,
      requestedImages: requestedImages.slice(0, 7),
    }),
  );
});

test("límites multipart distinguen payload grande de imagen inválida", () => {
  let forwarded;
  errorMulter(
    { code: "LIMIT_FILE_SIZE" },
    {},
    {},
    (error) => {
      forwarded = error;
    },
  );
  assert.equal(forwarded.status, 413);
  assert.equal(forwarded.code, "UPLOAD_TOO_LARGE");

  errorMulter(
    { code: "LIMIT_FILE_TYPE" },
    {},
    {},
    (error) => {
      forwarded = error;
    },
  );
  assert.equal(forwarded.status, 400);
  assert.equal(forwarded.code, "INVALID_IMAGE");
});

test("checkout agrupa duplicados y calcula sólo con snapshots del backend", () => {
  process.env.SHIPPING_COST = "500.25";
  const payload = normalizeCheckoutPayload({
    cliente: {
      nombre: "  Luna ",
      apellido: " Verde ",
      telefono: "+54 381 555 1234",
      email: " LUNA@EXAMPLE.COM ",
    },
    entrega: {
      metodo: "domicilio",
      provincia: " Tucumán ",
      localidad: " Yerba Buena ",
      codigoPostal: " 4107 ",
      direccion: " Luna 123 ",
      aclaraciones: "",
    },
    productos: [
      { productoId: productB, cantidad: 1 },
      { productoId: productA, cantidad: 2 },
      { productoId: productA, cantidad: 1 },
    ],
  });

  assert.deepEqual(payload.productos, [
    { productoId: productA, cantidad: 3 },
    { productoId: productB, cantidad: 1 },
  ]);
  assert.equal(payload.cliente.telefono, "543815551234");
  assert.equal(payload.cliente.email, "luna@example.com");
  assert.deepEqual(
    calcularTotalesCheckout({
      productSnapshots: [
        { subtotal: 3000.3 },
        { subtotal: 1000.1 },
      ],
      deliveryMethod: "domicilio",
    }),
    {
      subtotal: 4000.4,
      costoEnvio: 500.25,
      total: 4500.65,
    },
  );
});

test("checkout obtiene nombre, precio y stock desde MongoDB sin modificar stock", async () => {
  let queriedIds;
  const snapshots = await obtenerSnapshotsProductos({
    items: [
      { productoId: productA, cantidad: 2 },
      { productoId: productA, cantidad: 1 },
    ],
    findProducts: async (ids) => {
      queriedIds = ids;
      return [
        {
          _id: productA,
          name: "Melisa",
          price: 1234.567,
          stock: 3,
          active: true,
        },
      ];
    },
  });

  assert.deepEqual(queriedIds, [productA]);
  assert.deepEqual(snapshots, [
    {
      producto: productA,
      name: "Melisa",
      price: 1234.57,
      quantity: 3,
      subtotal: 3703.71,
    },
  ]);
});

test("snapshot rechaza producto oculto, corrupto o sin stock", () => {
  assert.throws(
    () =>
      construirSnapshotProducto({
        product: {
          _id: productA,
          name: "Melisa",
          price: 100,
          stock: 5,
          active: false,
        },
        quantity: 1,
      }),
    (error) => error.code === "PRODUCT_NOT_AVAILABLE",
  );
  assert.throws(
    () =>
      construirSnapshotProducto({
        product: {
          _id: productA,
          name: "Melisa",
          price: 100,
          stock: 1,
          active: true,
        },
        quantity: 2,
      }),
    (error) => error.code === "INSUFFICIENT_STOCK",
  );
  assert.throws(
    () => getOrderItemQuantity({ producto: productA, quantity: 0 }),
    (error) => error.code === "ORDER_ITEM_INVALID_DURING_STOCK_CHANGE",
  );
});

test("claim de preferencia usa fencing token y reutiliza el ganador", async () => {
  const originalOrder = createOrder();
  const winner = {
    ...originalOrder,
    pago: {
      ...originalOrder.pago,
      preferenceId: "pref-winner",
      checkoutUrl: "https://mercadopago.example/winner",
    },
  };
  let failedClaim;

  const result = await ensurePreferenceForOrder({
    order: originalOrder,
    idempotencyKey: "checkout-123456789",
    claimPreference: async () => ({
      order: originalOrder,
      claimToken: "claim-old",
    }),
    createPreference: async () => ({
      preferenceId: "pref-old",
      checkoutUrl: "https://mercadopago.example/old",
    }),
    persistPreference: async ({ claimToken }) => {
      assert.equal(claimToken, "claim-old");
      return null;
    },
    findOrderById: async () => winner,
    markPreferenceFailed: async (claim) => {
      failedClaim = claim;
    },
  });

  assert.equal(result, winner);
  assert.equal(failedClaim, undefined);
});

test("fallo de Mercado Pago libera el claim pero nunca toca stock", async () => {
  const order = createOrder();
  let failure;

  await assert.rejects(
    ensurePreferenceForOrder({
      order,
      idempotencyKey: "checkout-123456789",
      claimPreference: async () => ({
        order,
        claimToken: "claim-1",
      }),
      createPreference: async () => {
        throw new Error("provider timeout");
      },
      markPreferenceFailed: async (value) => {
        failure = value;
      },
    }),
    (error) =>
      error instanceof AppError &&
      error.code === "MERCADO_PAGO_UNAVAILABLE",
  );
  assert.equal(failure.claimToken, "claim-1");
  assert.equal(order.stockState, STOCK_STATE_PENDING);
});

test("idempotencia de Mercado Pago es estable y no supera 64 caracteres", () => {
  const first = buildMercadoPagoIdempotencyKey("x".repeat(200));
  const second = buildMercadoPagoIdempotencyKey("x".repeat(200));
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.notEqual(first, buildMercadoPagoIdempotencyKey("y".repeat(200)));
});

test("firma de webhook exige autenticidad y timestamp reciente", () => {
  const now = Date.UTC(2026, 6, 24, 12, 0, 0);
  const timestamp = String(now);
  const secret = "webhook-secret-long-enough";
  const signature = signMercadoPagoWebhook({
    dataId: "PAY-123",
    requestId: "request-123",
    timestamp,
    secret,
  });
  const header = `ts=${timestamp},v1=${signature}`;

  assert.equal(
    verifyMercadoPagoWebhookSignature({
      signatureHeader: header,
      requestId: "request-123",
      dataId: "PAY-123",
      secret,
      now,
    }),
    true,
  );
  assert.equal(
    verifyMercadoPagoWebhookSignature({
      signatureHeader: header,
      requestId: "request-altered",
      dataId: "PAY-123",
      secret,
      now,
    }),
    false,
  );
  assert.equal(
    verifyMercadoPagoWebhookSignature({
      signatureHeader: header,
      requestId: "request-123",
      dataId: "PAY-123",
      secret,
      now: now + 301_000,
    }),
    false,
  );
});

test("aprobación descuenta una vez y pasa el pedido a pagado", async () => {
  const order = createOrder();
  let decrements = 0;
  const decrementStock = async ({ order: target }) => {
    decrements += 1;
    target.stockState = STOCK_STATE_COMMITTED;
  };

  await applyPaymentStateTransition({
    order,
    payment: createPayment(),
    decrementStock,
  });
  await applyPaymentStateTransition({
    order,
    payment: createPayment(),
    decrementStock,
  });

  assert.equal(decrements, 1);
  assert.equal(order.stockState, STOCK_STATE_COMMITTED);
  assert.equal(order.estadoPago, PAYMENT_STATUS_APPROVED);
  assert.equal(order.estadoOperativo, ORDER_STATUS_PAID);
});

test("inventario usa $gte + $inc y sus marcas hacen descuento/restauración idempotentes", async (t) => {
  const originalFindOneAndUpdate = Producto.findOneAndUpdate;
  const originalFindByIdAndUpdate = Producto.findByIdAndUpdate;
  const operations = [];
  Producto.findOneAndUpdate = async (filter, update) => {
    operations.push({ type: "decrement", filter, update });
    return { _id: filter._id, stock: 2 };
  };
  Producto.findByIdAndUpdate = async (id, update) => {
    operations.push({ type: "restore", id, update });
    return { _id: id, stock: 4 };
  };
  t.after(() => {
    Producto.findOneAndUpdate = originalFindOneAndUpdate;
    Producto.findByIdAndUpdate = originalFindByIdAndUpdate;
  });
  const order = createOrder();

  assert.equal(await descontarStockPedido({ order }), true);
  assert.equal(await descontarStockPedido({ order }), false);
  assert.equal(order.stockState, STOCK_STATE_COMMITTED);
  assert.deepEqual(operations[0], {
    type: "decrement",
    filter: {
      _id: productA,
      stock: { $gte: 2 },
    },
    update: { $inc: { stock: -2 } },
  });

  assert.equal(
    await restaurarStockPedido({
      order,
      reason: "payment_refunded",
    }),
    true,
  );
  assert.equal(
    await restaurarStockPedido({
      order,
      reason: "payment_refunded",
    }),
    false,
  );
  assert.equal(order.stockState, STOCK_STATE_RELEASED);
  assert.deepEqual(operations[1], {
    type: "restore",
    id: productA,
    update: { $inc: { stock: 2 } },
  });
});

test("segunda aprobación queda auditable sin volver a descontar", async () => {
  const order = createOrder({
    estadoPago: PAYMENT_STATUS_APPROVED,
    estadoOperativo: ORDER_STATUS_PAID,
    stockState: STOCK_STATE_COMMITTED,
    pago: {
      preferenceId: "pref-1",
      paymentId: "pay-1",
      additionalPaymentIds: [],
    },
  });
  let decrements = 0;

  await applyPaymentStateTransition({
    order,
    payment: createPayment({ id: "pay-2" }),
    decrementStock: async () => {
      decrements += 1;
    },
  });

  assert.equal(decrements, 0);
  assert.deepEqual(order.pago.additionalPaymentIds, ["pay-2"]);
  assert.equal(order.requiresReview, true);
  assert.match(order.reviewReason, /^double_payment_review:/);
});

test("aprobación ya parcialmente reembolsada abre revisión", async () => {
  const order = createOrder();
  await applyPaymentStateTransition({
    order,
    payment: createPayment({ transaction_amount_refunded: 250 }),
    decrementStock: async ({ order: target }) => {
      target.stockState = STOCK_STATE_COMMITTED;
    },
  });

  assert.equal(order.estadoPago, PAYMENT_STATUS_APPROVED);
  assert.equal(order.pago.refundedAmount, 250);
  assert.equal(order.requiresReview, true);
  assert.equal(order.reviewReason, "partial_refund_review:250");
});

test("reembolsos parciales nunca reducen el acumulado observado", async () => {
  const order = createOrder({
    estadoPago: PAYMENT_STATUS_APPROVED,
    estadoOperativo: ORDER_STATUS_PAID,
    stockState: STOCK_STATE_COMMITTED,
    pago: {
      preferenceId: "pref-1",
      paymentId: "pay-1",
      additionalPaymentIds: [],
      refundedAmount: 1000,
    },
  });

  await applyPaymentStateTransition({
    order,
    payment: createPayment({ transaction_amount_refunded: 500 }),
  });

  assert.equal(order.pago.refundedAmount, 1000);
  assert.equal(order.reviewReason, "partial_refund_review:1000");
});

test("primer evento ya reembolsado por completo no descuenta stock", async () => {
  const order = createOrder();
  let decrements = 0;

  await applyPaymentStateTransition({
    order,
    payment: createPayment({ transaction_amount_refunded: 2000 }),
    decrementStock: async () => {
      decrements += 1;
    },
  });

  assert.equal(decrements, 0);
  assert.equal(order.stockState, STOCK_STATE_RELEASED);
  assert.equal(order.estadoPago, PAYMENT_STATUS_REFUNDED);
  assert.equal(order.estadoOperativo, ORDER_STATUS_CANCELLED);
});

test("reembolso restaura stock una sola vez", async () => {
  const order = createOrder({
    estadoPago: PAYMENT_STATUS_APPROVED,
    estadoOperativo: ORDER_STATUS_PAID,
    stockState: STOCK_STATE_COMMITTED,
    pago: {
      preferenceId: "pref-1",
      paymentId: "pay-1",
      additionalPaymentIds: [],
    },
  });
  let restores = 0;
  const restoreStock = async ({ order: target }) => {
    restores += 1;
    target.stockState = STOCK_STATE_RELEASED;
  };
  const refund = createPayment({
    status: PAYMENT_STATUS_REFUNDED,
    transaction_amount_refunded: 2000,
  });

  await applyPaymentStateTransition({ order, payment: refund, restoreStock });
  await applyPaymentStateTransition({ order, payment: refund, restoreStock });

  assert.equal(restores, 1);
  assert.equal(order.stockState, STOCK_STATE_RELEASED);
  assert.equal(order.estadoPago, PAYMENT_STATUS_REFUNDED);
  assert.equal(order.estadoOperativo, ORDER_STATUS_CANCELLED);
});

test("pago posterior a cancelación admin no descuenta y exige reembolso", async () => {
  const order = createOrder({
    estadoOperativo: ORDER_STATUS_CANCELLED,
    stockState: STOCK_STATE_RELEASED,
    stockReleaseReason: "admin_cancelled",
  });
  let decrements = 0;

  await applyPaymentStateTransition({
    order,
    payment: createPayment(),
    decrementStock: async () => {
      decrements += 1;
    },
  });

  assert.equal(decrements, 0);
  assert.equal(order.estadoPago, PAYMENT_STATUS_APPROVED);
  assert.equal(order.estadoOperativo, ORDER_STATUS_CANCELLED);
  assert.equal(order.requiresReview, true);
  assert.equal(
    order.reviewReason,
    "approved_after_cancellation_refund_required",
  );
});

test("un reembolso tras entrega no restaura stock automáticamente", async () => {
  const order = createOrder({
    estadoPago: PAYMENT_STATUS_APPROVED,
    estadoOperativo: ORDER_STATUS_DELIVERED,
    stockState: STOCK_STATE_COMMITTED,
    pago: {
      preferenceId: "pref-1",
      paymentId: "pay-1",
      additionalPaymentIds: [],
    },
  });
  let restores = 0;

  await applyPaymentStateTransition({
    order,
    payment: createPayment({
      status: PAYMENT_STATUS_REFUNDED,
      transaction_amount_refunded: 2000,
    }),
    restoreStock: async () => {
      restores += 1;
    },
  });

  assert.equal(restores, 0);
  assert.equal(order.requiresReview, true);
  assert.equal(order.reviewReason, "refunded_after_fulfillment");
});

test("reembolso con un segundo pago aprobado conserva stock y exige conciliación", async () => {
  const order = createOrder({
    estadoPago: PAYMENT_STATUS_APPROVED,
    estadoOperativo: ORDER_STATUS_PAID,
    stockState: STOCK_STATE_COMMITTED,
    pago: {
      preferenceId: "pref-1",
      paymentId: "pay-1",
      additionalPaymentIds: ["pay-2"],
    },
  });
  let restores = 0;

  await applyPaymentStateTransition({
    order,
    payment: createPayment({
      status: PAYMENT_STATUS_REFUNDED,
      transaction_amount_refunded: 2000,
    }),
    restoreStock: async () => {
      restores += 1;
    },
  });

  assert.equal(restores, 0);
  assert.equal(order.stockState, STOCK_STATE_COMMITTED);
  assert.equal(order.estadoPago, PAYMENT_STATUS_APPROVED);
  assert.equal(order.requiresReview, true);
  assert.equal(
    order.reviewReason,
    "multiple_payments_reconciliation_required:refunded",
  );
});

test("sincronización verifica monto, moneda y preferencia confiables", async () => {
  const order = createOrder({
    _id: "order-db-id",
    externalReference: "EJL-1",
  });
  let applied;

  const result = await syncVerifiedMercadoPagoPayment({
    payment: createPayment(),
    findOrder: async () => order,
    verifyPreference: async ({ paymentId, preferenceId }) =>
      paymentId === "pay-1" && preferenceId === "pref-1",
    applyPayment: async (value) => {
      applied = value;
      return order;
    },
  });

  assert.equal(result, order);
  assert.deepEqual(applied, {
    orderId: "order-db-id",
    payment: createPayment(),
  });

  let mismatch;
  await assert.rejects(
    syncVerifiedMercadoPagoPayment({
      payment: createPayment({ transaction_amount: 1999 }),
      findOrder: async () => order,
      markMismatch: async (value) => {
        mismatch = value;
      },
    }),
    (error) => error.code === "PAYMENT_AMOUNT_MISMATCH",
  );
  assert.equal(mismatch.reason, "payment_amount_mismatch");
});

test("estado de stock legacy se normaliza sin volver a descontar pagos aprobados", () => {
  const approved = createOrder({
    stockState: undefined,
    estadoPago: PAYMENT_STATUS_APPROVED,
    inventario: { descontado: true },
  });
  assert.equal(
    normalizarStockStateLegacy(approved),
    STOCK_STATE_COMMITTED,
  );

  const unpaid = createOrder({
    stockState: undefined,
    inventario: { descontado: false },
  });
  assert.equal(normalizarStockStateLegacy(unpaid), STOCK_STATE_PENDING);
});

test("una aprobación no se degrada por eventos secundarios", () => {
  assert.equal(
    shouldIgnorePaymentUpdate({
      currentStatus: PAYMENT_STATUS_APPROVED,
      currentPaymentId: "pay-1",
      incomingStatus: PAYMENT_STATUS_PENDING,
      incomingPaymentId: "pay-1",
    }),
    true,
  );
  assert.equal(
    buildApprovedWithoutStockUpdate(createPayment()).requiresReview,
    true,
  );
});

test("transiciones admin impiden avanzar sin pago y retroceder entregas", () => {
  assert.throws(
    () =>
      validateOperationalTransition(
        createOrder(),
        ORDER_STATUS_PAID,
      ),
    (error) => error.code === "PAYMENT_NOT_APPROVED",
  );
  assert.throws(
    () =>
      validateOperationalTransition(
        createOrder({
          estadoPago: PAYMENT_STATUS_APPROVED,
          estadoOperativo: ORDER_STATUS_DELIVERED,
        }),
        ORDER_STATUS_PAID,
      ),
    (error) => error.code === "INVALID_ORDER_TRANSITION",
  );
  const reviewOrder = createOrder({
    estadoPago: PAYMENT_STATUS_APPROVED,
    estadoOperativo: ORDER_STATUS_PAID,
    requiresReview: true,
    reviewReason: "multiple_payments_reconciliation_required",
  });
  assert.throws(
    () =>
      validateOperationalTransition(
        reviewOrder,
        "preparando",
      ),
    (error) => error.code === "ORDER_REQUIRES_REVIEW",
  );
  assert.doesNotThrow(() =>
    validateOperationalTransition(
      reviewOrder,
      ORDER_STATUS_CANCELLED,
    ),
  );
});
