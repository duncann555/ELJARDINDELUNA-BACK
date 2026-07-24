import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import Producto from "../src/models/producto.js";
import Pedido from "../src/models/pedido.js";
import { slugifyProductName } from "../src/constants/productos.js";
import {
  buildCompatibleCustomer,
  buildCompatibleDelivery,
  resolveHistoricalPaymentProvider,
} from "../src/helpers/legacyOrderCompatibility.js";
import {
  isCentAmount,
  roundMoney,
} from "../src/helpers/money.js";
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_APPROVED,
  PAYMENT_STATUS_CHARGED_BACK,
  PAYMENT_STATUS_REFUNDED,
} from "../src/constants/pagos.js";
import {
  DELIVERY_METHOD_HOME,
  DELIVERY_METHOD_PICKUP,
  ORDER_STATUS_CANCELLED,
  ORDER_STATUSES,
  resolveOperationalStatus,
  STOCK_STATE_COMMITTED,
  STOCK_STATE_PENDING,
  STOCK_STATE_RELEASED,
  STOCK_STATES,
} from "../src/constants/pedidos.js";

const trim = (value) => String(value ?? "").trim();
const strictNumber = (value) =>
  value == null || (typeof value === "string" && !value.trim())
    ? Number.NaN
    : Number(value);
const isFiniteMoney = (value) =>
  value != null &&
  !(typeof value === "string" && !value.trim()) &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0;
const hasAtMostTwoDecimals = isCentAmount;
const isHttpUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const addIssue = (issues, collection, id, message) => {
  issues.push(`${collection} ${String(id)}: ${message}`);
};

const uniqueValue = (base, used) => {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 115)}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
};

const validateProduct = ({ product, canonical, issues }) => {
  const id = product._id;
  if (canonical.name.length < 2 || canonical.name.length > 120) {
    addIssue(issues, "producto", id, "name ausente o fuera de rango");
  }
  if (canonical.category.length < 2 || canonical.category.length > 100) {
    addIssue(issues, "producto", id, "category ausente o fuera de rango");
  }
  if (
    canonical.description.length < 10 ||
    canonical.description.length > 4000
  ) {
    addIssue(issues, "producto", id, "description ausente o fuera de rango");
  }
  if (
    !isFiniteMoney(canonical.price) ||
    canonical.price > 100_000_000 ||
    !hasAtMostTwoDecimals(canonical.price)
  ) {
    addIssue(
      issues,
      "producto",
      id,
      "price debe ser finito, no negativo y tener hasta dos decimales",
    );
  }
  if (
    !Number.isInteger(canonical.stock) ||
    canonical.stock < 0 ||
    canonical.stock > 1_000_000
  ) {
    addIssue(issues, "producto", id, "stock debe ser un entero no negativo");
  }
  if (
    canonical.images.length > 8 ||
    canonical.images.some((image) => !isHttpUrl(image)) ||
    new Set(canonical.images).size !== canonical.images.length
  ) {
    addIssue(
      issues,
      "producto",
      id,
      "images no puede truncarse, deduplicarse ni contener URLs inválidas",
    );
  }
  if (typeof canonical.active !== "boolean") {
    addIssue(issues, "producto", id, "active/estado no está definido");
  }
  for (const [field, max] of [
    ["botanicalName", 180],
    ["presentation", 240],
    ["ingredients", 4000],
    ["warnings", 4000],
  ]) {
    if (canonical[field].length > max) {
      addIssue(issues, "producto", id, `${field} supera ${max} caracteres`);
    }
  }
};

const getRawProductImages = (product) => {
  const source = Array.isArray(product.images)
    ? product.images
    : product.images != null
      ? [product.images]
      : [];
  const images = source.map(trim);
  const legacyImage = trim(product.imagenUrl);
  if (legacyImage && !images.includes(legacyImage)) images.push(legacyImage);
  return images;
};

export const buildProductOperations = (products, issues = []) => {
  const usedSlugs = new Set();

  return products.map((product) => {
    const name = trim(product.name || product.nombre);
    const explicitSlug = trim(product.slug);
    const requestedSlug = explicitSlug || slugifyProductName(name);
    const category = trim(product.category || product.categoria);
    const description = trim(product.description || product.descripcion);
    const price = strictNumber(product.price ?? product.precio);
    const stock = strictNumber(product.stock);
    const images = getRawProductImages(product);
    const active =
      typeof product.active === "boolean"
        ? product.active
        : product.estado === "Activo"
          ? true
          : product.estado === "Inactivo"
            ? false
            : undefined;
    const canonical = {
      name,
      slug: requestedSlug
        ? explicitSlug
          ? explicitSlug
          : uniqueValue(requestedSlug, usedSlugs)
        : "",
      botanicalName: trim(product.botanicalName),
      category,
      description,
      presentation: trim(product.presentation),
      ingredients: trim(product.ingredients),
      warnings: trim(product.warnings),
      price,
      stock,
      images,
      active,
    };

    if (!canonical.slug) {
      addIssue(issues, "producto", product._id, "no se puede derivar slug");
    } else if (explicitSlug) {
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(explicitSlug) ||
        explicitSlug.length > 120
      ) {
        addIssue(
          issues,
          "producto",
          product._id,
          "slug existente no tiene formato canónico",
        );
      }
      if (usedSlugs.has(canonical.slug)) {
        addIssue(
          issues,
          "producto",
          product._id,
          `slug duplicado: ${canonical.slug}`,
        );
      }
      usedSlugs.add(canonical.slug);
    }
    validateProduct({ product, canonical, issues });

    return {
      updateOne: {
        filter: { _id: product._id },
        update: { $set: canonical },
      },
    };
  });
};

const validateOrder = ({ order, canonical, issues }) => {
  const id = order._id;
  const { cliente, entrega } = canonical;

  if (
    !canonical.numero ||
    canonical.numero !== canonical.numero.toUpperCase()
  ) {
    addIssue(issues, "pedido", id, "numero debe existir y estar en mayúsculas");
  }
  if (!canonical.externalReference) {
    addIssue(issues, "pedido", id, "externalReference está vacío");
  }
  if (!canonical.idempotencyKey) {
    addIssue(issues, "pedido", id, "idempotencyKey está vacío");
  }

  if (!cliente.nombre || !cliente.apellido) {
    addIssue(issues, "pedido", id, "cliente requiere nombre y apellido");
  }
  if (
    trim(cliente.nombre).length > 50 ||
    trim(cliente.apellido).length > 50
  ) {
    addIssue(issues, "pedido", id, "nombre/apellido supera 50 caracteres");
  }
  if (!/^\d{8,15}$/.test(cliente.telefono)) {
    addIssue(issues, "pedido", id, "cliente.telefono no es válido");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
    addIssue(issues, "pedido", id, "cliente.email no es válido");
  }
  if (trim(cliente.email).length > 160) {
    addIssue(issues, "pedido", id, "cliente.email supera 160 caracteres");
  }
  if (![DELIVERY_METHOD_HOME, DELIVERY_METHOD_PICKUP].includes(entrega.metodo)) {
    addIssue(issues, "pedido", id, "entrega.metodo no es reconocido");
  }
  if (trim(entrega.aclaraciones).length > 500) {
    addIssue(issues, "pedido", id, "entrega.aclaraciones supera 500 caracteres");
  }
  for (const [field, max] of [
    ["provincia", 100],
    ["localidad", 100],
    ["codigoPostal", 12],
    ["direccion", 180],
  ]) {
    if (trim(entrega[field]).length > max) {
      addIssue(issues, "pedido", id, `entrega.${field} supera ${max} caracteres`);
    }
  }
  if (
    entrega.metodo === DELIVERY_METHOD_HOME &&
    [
      entrega.provincia,
      entrega.localidad,
      entrega.codigoPostal,
      entrega.direccion,
    ].some((value) => !value)
  ) {
    addIssue(issues, "pedido", id, "entrega a domicilio incompleta");
  }
  if (!canonical.productos.length || canonical.productos.length > 50) {
    addIssue(issues, "pedido", id, "productos debe contener entre 1 y 50 líneas");
  }
  if (!PAYMENT_STATUSES.includes(canonical.estadoPago)) {
    addIssue(issues, "pedido", id, "estadoPago no es reconocido");
  }
  if (!ORDER_STATUSES.includes(canonical.estadoOperativo)) {
    addIssue(issues, "pedido", id, "estadoOperativo no es reconocido");
  }
  if (!STOCK_STATES.includes(canonical.stockState)) {
    addIssue(issues, "pedido", id, "stockState no es reconocido");
  }
  if (!canonical.pago.provider) {
    addIssue(issues, "pedido", id, "pago.provider no se puede determinar");
  }
  if (
    !["pending", "creating", "created", "failed"].includes(
      canonical.preferenceCreationState,
    )
  ) {
    addIssue(issues, "pedido", id, "preferenceCreationState no es reconocido");
  }
  for (const field of [
    "amount",
    "refundedAmount",
  ]) {
    if (
      canonical.pago[field] != null &&
      (!isFiniteMoney(canonical.pago[field]) ||
        !hasAtMostTwoDecimals(canonical.pago[field]))
    ) {
      addIssue(issues, "pedido", id, `pago.${field} no es válido`);
    }
  }
  for (const [field, max] of [["additionalPaymentIds", 20]]) {
    if (
      canonical.pago[field] &&
      (canonical.pago[field].length > max ||
        canonical.pago[field].some((value) => !value) ||
        new Set(canonical.pago[field]).size !== canonical.pago[field].length)
    ) {
      addIssue(issues, "pedido", id, `pago.${field} no es válido`);
    }
  }
  for (const field of ["approvedAt", "lastEventAt"]) {
    if (
      canonical.pago[field] &&
      Number.isNaN(canonical.pago[field].getTime())
    ) {
      addIssue(issues, "pedido", id, `pago.${field} no es una fecha válida`);
    }
  }
  for (const field of ["subtotal", "descuento", "costoEnvio", "total"]) {
    if (
      !isFiniteMoney(canonical[field]) ||
      !hasAtMostTwoDecimals(canonical[field])
    ) {
      addIssue(
        issues,
        "pedido",
        id,
        `${field} debe ser finito, no negativo y tener hasta dos decimales`,
      );
    }
  }
  const lineSubtotal = roundMoney(
    canonical.productos.reduce((sum, item) => sum + item.subtotal, 0),
  );
  if (
    isFiniteMoney(canonical.subtotal) &&
    roundMoney(lineSubtotal) !== roundMoney(canonical.subtotal)
  ) {
    addIssue(issues, "pedido", id, "subtotal no coincide con sus líneas");
  }
  if (
    isFiniteMoney(canonical.total) &&
    roundMoney(
      canonical.subtotal -
        canonical.descuento +
        canonical.costoEnvio,
    ) !==
      roundMoney(canonical.total)
  ) {
    addIssue(issues, "pedido", id, "total no coincide con subtotal + costoEnvio");
  }
};

const buildOrderItems = (order, issues) =>
  (Array.isArray(order.productos) ? order.productos : []).map((item, index) => {
    const productId = item.producto;
    const price = strictNumber(
      item.price ?? item.precioUnitario ?? item.precio,
    );
    const quantity = strictNumber(item.quantity ?? item.cantidad);
    const name = trim(item.name || item.nombre);
    const id = order._id;

    if (!mongoose.isValidObjectId(productId)) {
      addIssue(
        issues,
        "pedido",
        id,
        `productos[${index}].producto no es un ObjectId válido`,
      );
    }
    if (!name || name.length > 120) {
      addIssue(issues, "pedido", id, `productos[${index}].name está vacío`);
    }
    if (
      !isFiniteMoney(price) ||
      !hasAtMostTwoDecimals(price) ||
      price > 100_000_000
    ) {
      addIssue(issues, "pedido", id, `productos[${index}].price no es válido`);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      addIssue(
        issues,
        "pedido",
        id,
        `productos[${index}].quantity no es válido`,
      );
    }

    return {
      ...item,
      producto: mongoose.isValidObjectId(productId)
        ? new mongoose.Types.ObjectId(String(productId))
        : productId,
      name,
      price,
      quantity,
      subtotal:
        isFiniteMoney(price) && Number.isInteger(quantity)
          ? roundMoney(price * quantity)
          : Number.NaN,
      nombre: name,
      precio: price,
      precioUnitario: price,
      cantidad: quantity,
    };
  });

const resolveHistoricalShippingCost = (order) => {
  const explicitCost = order.costoEnvio ?? order.envio?.costo;
  if (explicitCost != null && trim(explicitCost)) {
    return strictNumber(explicitCost);
  }

  const subtotal = strictNumber(order.subtotal);
  const total = strictNumber(order.total);
  const discount = strictNumber(order.descuento);
  if (!isFiniteMoney(subtotal) || !isFiniteMoney(total)) {
    return Number.NaN;
  }
  if (isFiniteMoney(discount)) {
    return roundMoney(total - subtotal + discount);
  }
  return total >= subtotal ? roundMoney(total - subtotal) : Number.NaN;
};

export const buildOrderOperations = (orders, issues = []) => {
  const usedNumbers = new Map();
  const usedReferences = new Map();
  const usedPreferenceIds = new Map();
  const usedPaymentIds = new Map();
  const usedIdempotencyKeys = new Map();

  const registerIdentifier = ({ value, used, label, orderId }) => {
    if (used.has(value)) {
      addIssue(
        issues,
        "pedido",
        orderId,
        `${label} duplica al pedido ${used.get(value)}`,
      );
    } else {
      used.set(value, orderId);
    }
    return value;
  };

  return orders.map((order) => {
    const legacyId = String(order._id);
    const legacyCustomer = order.cliente || order.datosCliente || {};
    const legacyDelivery = order.entrega || {
      ...(order.envio || {}),
      ...(order.datosEnvio || {}),
    };
    const customer = {
      ...legacyCustomer,
      ...buildCompatibleCustomer({
      customer: legacyCustomer,
      delivery: legacyDelivery,
      fallbackEmail: order.emailComprador,
      }),
    };
    const delivery = {
      ...legacyDelivery,
      ...buildCompatibleDelivery(legacyDelivery),
    };
    const numero = registerIdentifier({
      value:
        trim(order.numero) || `EJL-LEGACY-${legacyId.toUpperCase()}`,
      used: usedNumbers,
      label: "numero",
      orderId: order._id,
    });
    const externalReference = registerIdentifier({
      value: trim(order.externalReference) || legacyId,
      used: usedReferences,
      label: "externalReference",
      orderId: order._id,
    });
    const preferenceId = trim(order.pago?.preferenceId);
    const paymentId = trim(order.pago?.paymentId);
    const idempotencyKey =
      trim(order.idempotencyKey) || `legacy:${legacyId}`;
    const pago = {
      provider: resolveHistoricalPaymentProvider(order),
      statusDetail: trim(
        order.pago?.statusDetail || order.pago?.statusDetalle,
      ),
      currency: trim(order.pago?.currency) || "ARS",
      ...(preferenceId ? { preferenceId } : {}),
      ...(paymentId ? { paymentId } : {}),
      ...(Array.isArray(order.pago?.additionalPaymentIds)
        ? {
            additionalPaymentIds: order.pago.additionalPaymentIds.map(
              (value) => trim(value),
            ),
          }
        : {}),
      ...(trim(order.pago?.checkoutUrl)
        ? { checkoutUrl: trim(order.pago.checkoutUrl) }
        : {}),
      ...(isFiniteMoney(order.pago?.amount)
        ? { amount: strictNumber(order.pago.amount) }
        : {}),
      ...(isFiniteMoney(order.pago?.refundedAmount)
        ? { refundedAmount: strictNumber(order.pago.refundedAmount) }
        : {}),
      ...(order.pago?.approvedAt || order.pago?.fechaPago
        ? {
            approvedAt: new Date(
              order.pago.approvedAt || order.pago.fechaPago,
            ),
          }
        : {}),
      ...(order.pago?.lastEventAt
        ? { lastEventAt: new Date(order.pago.lastEventAt) }
        : {}),
    };

    for (const [label, value, used] of [
      ["idempotencyKey", idempotencyKey, usedIdempotencyKeys],
      ["preferenceId", preferenceId, usedPreferenceIds],
      ["paymentId", paymentId, usedPaymentIds],
    ]) {
      if (value && used.has(value)) {
        addIssue(
          issues,
          "pedido",
          order._id,
          `${label} duplica al pedido ${used.get(value)}`,
        );
      } else if (value) {
        used.set(value, order._id);
      }
    }

    const paymentStatus = trim(order.estadoPago || order.pago?.estado);
    const operationalStatus = resolveOperationalStatus(
      order.estadoOperativo,
      order.estadoPedido,
    );
    const legacyDiscounted =
      order.stockDescontado ?? order.inventario?.descontado;
    const stockState = STOCK_STATES.includes(order.stockState)
      ? order.stockState
      : legacyDiscounted === true
        ? STOCK_STATE_COMMITTED
        : legacyDiscounted === false
          ? paymentStatus === PAYMENT_STATUS_APPROVED ||
            [PAYMENT_STATUS_REFUNDED, PAYMENT_STATUS_CHARGED_BACK].includes(
              paymentStatus,
            ) ||
            operationalStatus === ORDER_STATUS_CANCELLED
            ? STOCK_STATE_RELEASED
            : STOCK_STATE_PENDING
          : paymentStatus === PAYMENT_STATUS_APPROVED
            ? STOCK_STATE_COMMITTED
        : [PAYMENT_STATUS_REFUNDED, PAYMENT_STATUS_CHARGED_BACK].includes(
              paymentStatus,
            ) || operationalStatus === ORDER_STATUS_CANCELLED
          ? STOCK_STATE_RELEASED
          : STOCK_STATE_PENDING;

    const canonical = {
      numero,
      externalReference,
      idempotencyKey,
      requestFingerprint:
        trim(order.requestFingerprint) || `legacy:${legacyId}`,
      cliente: customer,
      entrega: delivery,
      productos: buildOrderItems(order, issues),
      subtotal: strictNumber(order.subtotal),
      descuento: strictNumber(order.descuento),
      costoEnvio: resolveHistoricalShippingCost(order),
      total: strictNumber(order.total),
      estadoPago: paymentStatus,
      estadoOperativo: operationalStatus,
      stockState,
      stockReleaseReason:
        trim(order.stockReleaseReason) ||
        (stockState === STOCK_STATE_RELEASED &&
        preferenceId &&
        ["pending", "rejected"].includes(
          paymentStatus,
        )
          ? "legacy_payment_pending"
          : undefined),
      pago,
      preferenceCreationState:
        trim(order.preferenceCreationState) ||
        (preferenceId ? "created" : "failed"),
      requiresReview: Boolean(order.requiresReview),
      reviewReason: trim(order.reviewReason),
    };

    if (
      canonical.estadoPago === "approved" &&
      canonical.estadoOperativo === "cancelado" &&
      canonical.stockState === "released" &&
      !canonical.requiresReview
    ) {
      canonical.requiresReview = true;
      canonical.reviewReason = "legacy_approved_cancelled_refund_check";
    }

    validateOrder({ order, canonical, issues });
    const { pago: canonicalPayment, ...canonicalOrder } = canonical;
    const paymentUpdates = Object.fromEntries(
      Object.entries(canonicalPayment)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [`pago.${key}`, value]),
    );

    return {
      updateOne: {
        filter: { _id: order._id },
        update: {
          $set: {
            ...canonicalOrder,
            ...paymentUpdates,
          },
        },
      },
    };
  });
};

export const buildMigrationPlan = ({ products, orders }) => {
  const issues = [];
  const productOperations = buildProductOperations(products, issues);
  const orderOperations = buildOrderOperations(orders, issues);

  if (issues.length) {
    throw new Error(
      `Preflight rechazado; no se escribió ningún documento:\n- ${issues.join(
        "\n- ",
      )}`,
    );
  }

  return { productOperations, orderOperations };
};

export const runMigration = async ({
  apply = process.argv.includes("--apply"),
} = {}) => {
  const mongoUri = trim(process.env.MONGODB_URI);
  if (!mongoUri) throw new Error("MONGODB_URI no está configurada");

  await mongoose.connect(mongoUri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    const [products, orders] = await Promise.all([
      Producto.collection.find({}).sort({ createdAt: 1, _id: 1 }).toArray(),
      Pedido.collection.find({}).sort({ createdAt: 1, _id: 1 }).toArray(),
    ]);
    const { productOperations, orderOperations } = buildMigrationPlan({
      products,
      orders,
    });

    console.info(
      `[migration] preflight OK; productos=${productOperations.length} pedidos=${orderOperations.length} modo=${
        apply ? "apply" : "dry-run"
      }`,
    );

    if (!apply) {
      console.info(
        "[migration] dry-run finalizado; ejecutá con --apply para escribir",
      );
      return;
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (productOperations.length) {
          await Producto.collection.bulkWrite(productOperations, {
            ordered: true,
            session,
          });
        }
        if (orderOperations.length) {
          await Pedido.collection.bulkWrite(orderOperations, {
            ordered: true,
            session,
          });
        }
      });
    } finally {
      await session.endSession();
    }

    // Los índices únicos se crean después del backfill: varios documentos
    // legacy pueden contener "" en campos que el plan vuelve únicos.
    await Producto.createIndexes();
    await Pedido.createIndexes();

    console.info("[migration] backfill e índices completados");
  } finally {
    await mongoose.disconnect();
  }
};

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await runMigration();
}
