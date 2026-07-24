import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Pedido from "../src/models/pedido.js";
import Producto from "../src/models/producto.js";
import {
  buildMigrationPlan,
  buildOrderOperations,
} from "../scripts/migrateCanonicalData.js";
import {
  buildCompatibleDelivery,
  resolveHistoricalPaymentProvider,
} from "../src/helpers/legacyOrderCompatibility.js";
import {
  toAdminOrderDTO,
  toPublicOrderStatusDTO,
} from "../src/services/pedidos.service.js";
import { toProductDTO } from "../src/services/productos.service.js";

const productId = new mongoose.Types.ObjectId(
  "64f1c2a9633f88d5c6f12345",
);
const legacyOrderItemId = new mongoose.Types.ObjectId(
  "64f1c2a9633f88d5c6f12346",
);

const legacyProduct = {
  _id: productId,
  nombre: "Lavanda serrana",
  categoria: "Hierbas",
  descripcion: "Flores secas de lavanda seleccionadas a mano.",
  precio: 1000,
  stock: 20,
  imagenUrl: "https://images.example/lavanda.webp",
  estado: "Activo",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

const deliveryData = {
  andreani_domicilio: {
    tipo: "andreani_domicilio",
    celular: "3815551234",
    provincia: "Tucumán",
    ciudad: "Yerba Buena",
    codigoPostal: "4107",
    domicilio: "Los Ceibos 123",
    entreCalles: "Las Rosas y Los Tilos",
    referencia: "Portón verde",
    horarioConveniente: "Por la tarde",
  },
  andreani_sucursal: {
    tipo: "andreani_sucursal",
    celular: "3815551234",
    provincia: "Tucumán",
    ciudad: "San Miguel de Tucumán",
    codigoPostal: "4000",
    sucursalAndreani: "Sucursal Centro, 24 de Septiembre 500",
    referencia: "Retira Ana Pérez",
  },
  cadete_local: {
    tipo: "cadete_local",
    celular: "3815551234",
    provincia: "Tucumán",
    ciudad: "San Miguel de Tucumán",
    codigoPostal: "4000",
    domicilio: "A coordinar por teléfono",
    horarioConveniente: "De 10 a 13",
  },
  acordar_vendedor: {
    tipo: "acordar_vendedor",
    celular: "3815551234",
    referencia: "Coordinar por WhatsApp",
  },
};

const makeLegacyOrder = ({
  type = "andreani_domicilio",
  paymentMethod = "mercado_pago",
  suffix = "01",
} = {}) => ({
  _id: new mongoose.Types.ObjectId(
    `64f1c2a9633f88d5c6f123${suffix}`,
  ),
  usuario: new mongoose.Types.ObjectId(
    "64f1c2a9633f88d5c6f12000",
  ),
  productos: [
    {
      _id: legacyOrderItemId,
      producto: productId,
      nombre: "Lavanda serrana",
      precio: 1000,
      cantidad: 2,
    },
  ],
  datosCliente: {
    nombre: "Ana Pérez",
    email: "ana@example.com",
  },
  datosEnvio: deliveryData[type],
  envio: {
    ...deliveryData[type],
    costo: 100,
  },
  subtotal: 2000,
  descuento: 0,
  total: 2100,
  metodoPago: paymentMethod,
  estadoPago: "pending",
  pago: {
    proveedor:
      paymentMethod === "transferencia"
        ? "Transferencia bancaria"
        : "MercadoPago",
    estado: "pending",
  },
  inventario: { descontado: false },
  estadoPedido: "En espera de pago",
  createdAt: new Date("2024-02-01T00:00:00.000Z"),
  updatedAt: new Date("2024-02-01T00:00:00.000Z"),
});

test("los tres métodos legacy se mapean sin perder datos reales", () => {
  const domicilio = buildCompatibleDelivery(
    deliveryData.andreani_domicilio,
  );
  assert.equal(domicilio.metodo, "domicilio");
  assert.equal(domicilio.direccion, "Los Ceibos 123");
  assert.match(domicilio.aclaraciones, /Entre calles:/);
  assert.match(domicilio.aclaraciones, /Horario:/);

  const sucursal = buildCompatibleDelivery(
    deliveryData.andreani_sucursal,
  );
  assert.equal(sucursal.metodo, "domicilio");
  assert.equal(
    sucursal.direccion,
    "Sucursal Centro, 24 de Septiembre 500",
  );
  assert.match(sucursal.aclaraciones, /Sucursal:/);

  const cadete = buildCompatibleDelivery(deliveryData.cadete_local);
  assert.equal(cadete.metodo, "retiro");
  assert.equal(cadete.direccion, "A coordinar por teléfono");
  assert.match(cadete.aclaraciones, /Horario:/);
  assert.match(cadete.aclaraciones, /Método histórico: Cadete local/);

  const agreed = buildCompatibleDelivery(
    deliveryData.acordar_vendedor,
  );
  assert.equal(agreed.metodo, "retiro");
  assert.match(
    agreed.aclaraciones,
    /Método histórico: Acordar con vendedor/,
  );
});

test("Pedido valida fixtures legacy reales sin datos simulados", async () => {
  for (const [index, type] of [
    "andreani_domicilio",
    "andreani_sucursal",
    "cadete_local",
    "acordar_vendedor",
  ].entries()) {
    const raw = makeLegacyOrder({
      type,
      paymentMethod: index === 1 ? "transferencia" : "mercado_pago",
      suffix: `1${index}`,
    });
    const order = new Pedido(raw);
    await order.validate();

    assert.equal(order.cliente.nombre, "Ana");
    assert.equal(order.cliente.apellido, "Pérez");
    assert.equal(
      order.entrega.metodo,
      ["cadete_local", "acordar_vendedor"].includes(type)
        ? "retiro"
        : "domicilio",
    );
    assert.equal(order.productos[0].name, "Lavanda serrana");
    assert.equal(order.productos[0].subtotal, 2000);
    assert.equal(
      order.pago.provider,
      index === 1 ? "transferencia" : "mercado_pago",
    );
  }
});

test("modelo Producto valida centavos, campos mínimos e imágenes HTTP", async () => {
  const product = new Producto(legacyProduct);
  await product.validate();
  assert.equal(product.name, "Lavanda serrana");
  assert.equal(product.slug, "lavanda-serrana");

  const invalid = new Producto({
    name: "Lavanda",
    category: "Hierbas",
    description: "Descripción botánica válida.",
    price: 1.005,
    stock: 1,
    images: ["javascript:alert(1)"],
  });
  await assert.rejects(invalid.validate(), (error) => {
    assert.equal(error.name, "ValidationError");
    assert.ok(error.errors.price);
    assert.ok(error.errors.images);
    return true;
  });
});

test("migración preflight construye todas las operaciones sin placeholders", () => {
  const orders = [
    makeLegacyOrder({ type: "andreani_domicilio", suffix: "21" }),
    makeLegacyOrder({
      type: "andreani_sucursal",
      paymentMethod: "transferencia",
      suffix: "22",
    }),
    makeLegacyOrder({ type: "cadete_local", suffix: "23" }),
  ];
  const plan = buildMigrationPlan({
    products: [legacyProduct],
    orders,
  });

  assert.equal(plan.productOperations.length, 1);
  assert.equal(plan.orderOperations.length, 3);
  assert.equal(
    plan.orderOperations[0].updateOne.update.$set.externalReference,
    String(orders[0]._id),
  );
  const migratedTransfer =
    plan.orderOperations[1].updateOne.update.$set;
  assert.equal(migratedTransfer["pago.provider"], "transferencia");
  assert.equal("pago" in migratedTransfer, false);
  assert.equal(
    String(migratedTransfer.productos[0]._id),
    String(legacyOrderItemId),
  );
  assert.equal(migratedTransfer.productos[0].nombre, "Lavanda serrana");
  assert.equal(migratedTransfer.entrega.metodo, "domicilio");
  assert.equal(
    migratedTransfer.entrega.direccion,
    "Sucursal Centro, 24 de Septiembre 500",
  );
  const serialized = JSON.stringify(plan);
  assert.doesNotMatch(serialized, /Sin categoría|pendiente de completar/i);
});

test("migración aborta el preflight completo cuando faltan datos reales", () => {
  const brokenProduct = {
    ...legacyProduct,
    _id: new mongoose.Types.ObjectId(
      "64f1c2a9633f88d5c6f12999",
    ),
    categoria: "",
    precio: Number.NaN,
  };

  assert.throws(
    () =>
      buildMigrationPlan({
        products: [legacyProduct, brokenProduct],
        orders: [],
      }),
    (error) => {
      assert.match(error.message, /no se escribió ningún documento/i);
      assert.match(error.message, new RegExp(String(brokenProduct._id)));
      assert.match(error.message, /category/);
      assert.match(error.message, /price/);
      return true;
    },
  );
});

test("migración no trunca imágenes ni convierte null en cero", () => {
  const brokenProduct = {
    ...legacyProduct,
    _id: new mongoose.Types.ObjectId(
      "64f1c2a9633f88d5c6f12888",
    ),
    precio: null,
    images: Array.from(
      { length: 9 },
      (_, index) => `https://images.example/${index}.webp`,
    ),
  };
  const brokenOrder = {
    ...makeLegacyOrder({ suffix: "51" }),
    total: null,
  };

  assert.throws(
    () =>
      buildMigrationPlan({
        products: [brokenProduct],
        orders: [brokenOrder],
      }),
    (error) => {
      assert.match(error.message, /price/);
      assert.match(error.message, /images no puede truncarse/);
      assert.match(error.message, /total/);
      return true;
    },
  );
});

test("migración detecta identificadores únicos duplicados antes de escribir", () => {
  const first = {
    ...makeLegacyOrder({ suffix: "61" }),
    numero: "EJL-DUPLICADO",
    externalReference: "REF-DUPLICADA",
    idempotencyKey: "idem-duplicada",
  };
  const second = {
    ...makeLegacyOrder({ suffix: "62" }),
    numero: "EJL-DUPLICADO",
    externalReference: "REF-DUPLICADA",
    idempotencyKey: "idem-duplicada",
  };

  assert.throws(
    () =>
      buildMigrationPlan({
        products: [legacyProduct],
        orders: [first, second],
      }),
    (error) => {
      assert.match(error.message, /numero duplica/);
      assert.match(error.message, /externalReference duplica/);
      assert.match(error.message, /idempotencyKey duplica/);
      return true;
    },
  );
});

test("operaciones legacy conservan provider de transferencia", () => {
  const issues = [];
  const [operation] = buildOrderOperations(
    [
      makeLegacyOrder({
        type: "cadete_local",
        paymentMethod: "transferencia",
        suffix: "31",
      }),
    ],
    issues,
  );
  assert.deepEqual(issues, []);
  assert.equal(
    operation.updateOne.update.$set["pago.provider"],
    "transferencia",
  );
  assert.equal(
    resolveHistoricalPaymentProvider(
      makeLegacyOrder({ paymentMethod: "transferencia", suffix: "32" }),
    ),
    "transferencia",
  );
});

test("transferencia legacy conserva descuento y su invariante histórica", async () => {
  const raw = {
    ...makeLegacyOrder({
      type: "andreani_domicilio",
      paymentMethod: "transferencia",
      suffix: "71",
    }),
    descuento: 140,
    total: 1960,
  };
  const order = new Pedido(raw);
  await order.validate();

  const plan = buildMigrationPlan({
    products: [legacyProduct],
    orders: [raw],
  });
  const migrated = plan.orderOperations[0].updateOne.update.$set;
  assert.equal(migrated.descuento, 140);
  assert.equal(migrated.costoEnvio, 100);
  assert.equal(migrated.total, 1960);
});

test("pedido legacy aprobado y cancelado exige revisar reembolso", () => {
  const raw = {
    ...makeLegacyOrder({ suffix: "72" }),
    estadoPago: "approved",
    pago: {
      proveedor: "MercadoPago",
      estado: "approved",
    },
    estadoPedido: "Cancelado",
    inventario: { descontado: false },
  };
  const plan = buildMigrationPlan({
    products: [legacyProduct],
    orders: [raw],
  });
  const migrated = plan.orderOperations[0].updateOne.update.$set;

  assert.equal(migrated.requiresReview, true);
  assert.equal(
    migrated.reviewReason,
    "legacy_approved_cancelled_refund_check",
  );
});

test("DTOs canónicos preservan contrato y no filtran PII en estado público", () => {
  const productDTO = toProductDTO(legacyProduct);
  assert.deepEqual(Object.keys(productDTO), [
    "id",
    "name",
    "slug",
    "botanicalName",
    "category",
    "description",
    "presentation",
    "ingredients",
    "warnings",
    "price",
    "stock",
    "images",
    "active",
  ]);
  assert.equal(productDTO.slug, "lavanda-serrana");

  const rawOrder = makeLegacyOrder({
    paymentMethod: "transferencia",
    type: "cadete_local",
    suffix: "41",
  });
  const adminDTO = toAdminOrderDTO(rawOrder);
  assert.equal(adminDTO.pago.provider, "transferencia");
  assert.equal(adminDTO.cliente.apellido, "Pérez");
  assert.equal(adminDTO.entrega.metodo, "retiro");

  const publicDTO = toPublicOrderStatusDTO({
    numero: "EJL-20260101-ABC12345",
    externalReference: "EJL-20260101-ABC12345",
    subtotal: 2000,
    costoEnvio: 100,
    total: 2100,
    estadoPago: "pending",
    estadoOperativo: "pendiente",
    cliente: rawOrder.datosCliente,
    entrega: rawOrder.datosEnvio,
    createdAt: rawOrder.createdAt,
    updatedAt: rawOrder.updatedAt,
  });
  assert.deepEqual(Object.keys(publicDTO), [
    "numero",
    "externalReference",
    "subtotal",
    "costoEnvio",
    "total",
    "estadoPago",
    "estadoOperativo",
    "createdAt",
    "updatedAt",
  ]);
  assert.equal("cliente" in publicDTO, false);
  assert.equal("entrega" in publicDTO, false);
});
