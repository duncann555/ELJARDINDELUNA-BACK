import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { Preference } from "mercadopago";
import Server from "../src/server/config.js";
import validarCheckout from "../src/middlewares/validacionCheckout.js";
import errorHandler from "../src/middlewares/errorHandler.js";
import Pedido from "../src/models/pedido.js";
import Producto from "../src/models/producto.js";
import generarAdminJWT from "../src/middlewares/generarJWT.js";
import { buildOrderToken } from "../src/services/pedidos.service.js";

const listen = async (app) => {
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => listener.close(resolve)),
  };
};

const validCheckout = (method = "retiro") => ({
  cliente: {
    nombre: "Luna",
    apellido: "Jardín",
    telefono: "3815551234",
    email: "luna@example.com",
  },
  entrega: {
    metodo: method,
    provincia: method === "domicilio" ? "Tucumán" : "",
    localidad: method === "domicilio" ? "San Miguel de Tucumán" : "",
    codigoPostal: method === "domicilio" ? "4000" : "",
    direccion: method === "domicilio" ? "Laprida 123" : "",
    aclaraciones: "",
  },
  productos: [
    {
      productoId: "64f1c2a9633f88d5c6f12345",
      cantidad: 2,
    },
  ],
});

const useConnectedMongooseStub = (t) => {
  const previousState = mongoose.connection.readyState;
  const previousUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test-stub";
  mongoose.connection.readyState = 1;
  t.after(() => {
    mongoose.connection.readyState = previousState;
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
  });
};

test("GET /api/checkout/configuracion respeta el envelope público", async (t) => {
  process.env.SHIPPING_COST = "2750.5";
  process.env.FRONTEND_URL = "http://localhost:5173";
  process.env.CORS_ORIGINS = "https://tienda.example";

  const server = new Server();
  const http = await listen(server.app);
  t.after(http.close);

  const response = await fetch(
    `${http.baseUrl}/api/checkout/configuracion`,
    { headers: { Origin: "https://tienda.example" } },
  );
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://tienda.example",
  );
  assert.deepEqual(await response.json(), {
    data: {
      entrega: {
        costoDomicilio: 2750.5,
        retiroDisponible: true,
      },
    },
  });

  const rejected = await fetch(
    `${http.baseUrl}/api/checkout/configuracion`,
    { headers: { Origin: "https://tienda.example.evil.test" } },
  );
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).error.code, "CORS_ORIGIN_REJECTED");
});

test("la validación acepta retiro vacío y una Idempotency-Key larga", async (t) => {
  const app = express();
  app.use(express.json());
  app.post("/validate", validarCheckout, (_req, res) => res.sendStatus(204));
  app.use(errorHandler);
  const http = await listen(app);
  t.after(http.close);

  const response = await fetch(`${http.baseUrl}/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "k".repeat(180),
    },
    body: JSON.stringify(validCheckout("retiro")),
  });
  assert.equal(response.status, 204);
});

test("la validación rechaza domicilio sin sus campos requeridos", async (t) => {
  const app = express();
  app.use(express.json());
  app.post("/validate", validarCheckout, (_req, res) => res.sendStatus(204));
  app.use(errorHandler);
  const http = await listen(app);
  t.after(http.close);

  const payload = validCheckout("domicilio");
  payload.entrega.direccion = "";

  const response = await fetch(`${http.baseUrl}/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "checkout-contract-123456",
    },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.match(result.error.fields.entrega, /dirección/i);
});

test("catálogo y detalle públicos respetan el contrato canónico", async (t) => {
  useConnectedMongooseStub(t);
  const originalFind = Producto.find;
  const originalFindOne = Producto.findOne;
  const product = {
    _id: "64f1c2a9633f88d5c6f12345",
    name: "Melisa",
    slug: "melisa",
    botanicalName: "Melissa officinalis",
    category: "Gotas",
    description: "Extracto natural de hojas de melisa.",
    presentation: "Frasco de 30 ml",
    ingredients: "Extracto de melisa",
    warnings: "",
    price: 2500,
    stock: 4,
    images: ["https://images.example/melisa.webp"],
    active: true,
  };
  Producto.find = () => ({
    sort: async () => [product],
  });
  Producto.findOne = async () => product;
  t.after(() => {
    Producto.find = originalFind;
    Producto.findOne = originalFindOne;
  });

  const server = new Server();
  const http = await listen(server.app);
  t.after(http.close);

  const listResponse = await fetch(`${http.baseUrl}/api/productos`);
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.data.productos.length, 1);
  assert.deepEqual(list.data.productos[0], {
    id: product._id,
    name: "Melisa",
    slug: "melisa",
    botanicalName: "Melissa officinalis",
    category: "Gotas",
    description: "Extracto natural de hojas de melisa.",
    presentation: "Frasco de 30 ml",
    ingredients: "Extracto de melisa",
    warnings: "",
    price: 2500,
    stock: 4,
    images: ["https://images.example/melisa.webp"],
    active: true,
  });

  const detailResponse = await fetch(
    `${http.baseUrl}/api/productos/melisa`,
  );
  assert.equal(detailResponse.status, 200);
  assert.equal((await detailResponse.json()).data.producto.slug, "melisa");
});

test("login admin emite sesión y todas las rutas admin exigen JWT", async (t) => {
  useConnectedMongooseStub(t);
  const previousEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_TOKEN_EXPIRES_IN: process.env.ADMIN_TOKEN_EXPIRES_IN,
  };
  Object.assign(process.env, {
    JWT_SECRET: "api-test-secret-with-at-least-32-characters",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: await bcrypt.hash("correct horse battery", 4),
    ADMIN_TOKEN_EXPIRES_IN: "30m",
  });
  t.after(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const server = new Server();
  const http = await listen(server.app);
  t.after(http.close);

  const blocked = await fetch(`${http.baseUrl}/api/admin/productos`);
  assert.equal(blocked.status, 401);
  assert.equal((await blocked.json()).error.code, "INVALID_ADMIN_SESSION");

  const loginResponse = await fetch(`${http.baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.com",
      password: "correct horse battery",
    }),
  });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  assert.equal(login.data.admin.email, "admin@example.com");
  assert.ok(login.data.token);

  const sessionResponse = await fetch(`${http.baseUrl}/api/admin/sesion`, {
    headers: { Authorization: `Bearer ${login.data.token}` },
  });
  assert.equal(sessionResponse.status, 200);
  assert.equal(
    (await sessionResponse.json()).data.admin.email,
    "admin@example.com",
  );
  assert.match(
    sessionResponse.headers.get("cache-control"),
    /no-store/,
  );
});

test("admin crea, edita y oculta productos con campos permitidos", async (t) => {
  useConnectedMongooseStub(t);
  const originalFind = Producto.find;
  const originalExists = Producto.exists;
  const originalCreate = Producto.create;
  const originalFindById = Producto.findById;
  const originalFindOneAndUpdate = Producto.findOneAndUpdate;
  const previousEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_TOKEN_EXPIRES_IN: process.env.ADMIN_TOKEN_EXPIRES_IN,
  };
  Object.assign(process.env, {
    JWT_SECRET: "product-admin-test-secret-with-at-least-32-chars",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: await bcrypt.hash("correct horse battery", 4),
    ADMIN_TOKEN_EXPIRES_IN: "30m",
  });

  let storedProduct;
  Producto.find = () => ({
    select: () => ({
      lean: async () => [],
    }),
  });
  Producto.exists = async () => false;
  Producto.create = async (payload) => {
    storedProduct = {
      _id: "64f1c2a9633f88d5c6f12345",
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
      save: async function save() {
        return this;
      },
    };
    return storedProduct;
  };
  Producto.findById = async () => storedProduct;
  Producto.findOneAndUpdate = async (_filter, update) => {
    Object.assign(storedProduct, update.$set, {
      updatedAt: new Date(),
    });
    return storedProduct;
  };
  t.after(() => {
    Producto.find = originalFind;
    Producto.exists = originalExists;
    Producto.create = originalCreate;
    Producto.findById = originalFindById;
    Producto.findOneAndUpdate = originalFindOneAndUpdate;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const token = generarAdminJWT();
  const server = new Server();
  const http = await listen(server.app);
  t.after(http.close);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const basePayload = {
    name: "Melisa",
    slug: "extracto-melisa",
    category: "Gotas",
    description: "Extracto natural de hojas de melisa.",
    botanicalName: "Melissa officinalis",
    presentation: "Frasco de 30 ml",
    ingredients: "Melisa",
    warnings: "",
    price: 2500,
    stock: 8,
    images: ["https://images.example/melisa.webp"],
    active: true,
    forbiddenField: "no debe persistirse",
  };

  const createResponse = await fetch(`${http.baseUrl}/api/admin/productos`, {
    method: "POST",
    headers,
    body: JSON.stringify(basePayload),
  });
  assert.equal(createResponse.status, 201);
  assert.equal(
    (await createResponse.json()).data.producto.slug,
    "extracto-melisa",
  );
  assert.equal("forbiddenField" in storedProduct, false);

  const editPayload = {
    ...basePayload,
    name: "Melisa concentrada",
    price: 2750,
    stock: 7,
  };
  delete editPayload.slug;
  const editResponse = await fetch(
    `${http.baseUrl}/api/admin/productos/${storedProduct._id}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(editPayload),
    },
  );
  assert.equal(editResponse.status, 200);
  const edited = (await editResponse.json()).data.producto;
  assert.equal(edited.name, "Melisa concentrada");
  assert.equal(edited.slug, "extracto-melisa");
  assert.equal(edited.price, 2750);
  assert.equal(edited.stock, 7);

  const statusResponse = await fetch(
    `${http.baseUrl}/api/admin/productos/${storedProduct._id}/active`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ active: false }),
    },
  );
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).data.producto.active, false);
});

test("admin consulta pedidos y actualiza sólo transiciones operativas válidas", async (t) => {
  useConnectedMongooseStub(t);
  const originalFind = Pedido.find;
  const originalFindById = Pedido.findById;
  const originalStartSession = mongoose.startSession;
  const previousEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_TOKEN_EXPIRES_IN: process.env.ADMIN_TOKEN_EXPIRES_IN,
  };
  Object.assign(process.env, {
    JWT_SECRET: "order-admin-test-secret-with-at-least-32-characters",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: await bcrypt.hash("correct horse battery", 4),
    ADMIN_TOKEN_EXPIRES_IN: "30m",
  });
  const order = {
    _id: "64f1c2a9633f88d5c6f99999",
    numero: "EJL-20260724-ABCDEF123456",
    externalReference: "EJL-20260724-ABCDEF123456",
    cliente: {
      nombre: "Luna",
      apellido: "Jardín",
      telefono: "3815551234",
      email: "luna@example.com",
    },
    entrega: {
      metodo: "retiro",
      provincia: "",
      localidad: "",
      codigoPostal: "",
      direccion: "",
      aclaraciones: "",
    },
    productos: [
      {
        producto: "64f1c2a9633f88d5c6f12345",
        name: "Melisa",
        price: 2500,
        quantity: 2,
        subtotal: 5000,
      },
    ],
    subtotal: 5000,
    descuento: 0,
    costoEnvio: 0,
    total: 5000,
    estadoPago: "approved",
    estadoOperativo: "pagado",
    stockState: "committed",
    pago: {
      provider: "mercado_pago",
      preferenceId: "pref-1",
      paymentId: "pay-1",
      additionalPaymentIds: [],
    },
    requiresReview: false,
    reviewReason: "",
    createdAt: new Date("2026-07-24T12:00:00.000Z"),
    updatedAt: new Date("2026-07-24T12:05:00.000Z"),
    save: async function save() {
      this.updatedAt = new Date();
      return this;
    },
  };
  Pedido.find = () => ({
    sort: async () => [order],
  });
  Pedido.findById = () => {
    const result = Promise.resolve(order);
    result.session = async () => order;
    return result;
  };
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  });
  t.after(() => {
    Pedido.find = originalFind;
    Pedido.findById = originalFindById;
    mongoose.startSession = originalStartSession;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const token = generarAdminJWT();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const server = new Server();
  const http = await listen(server.app);
  t.after(http.close);

  const listResponse = await fetch(`${http.baseUrl}/api/admin/pedidos`, {
    headers,
  });
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).data.pedidos.length, 1);

  const updateResponse = await fetch(
    `${http.baseUrl}/api/admin/pedidos/${order._id}/estado`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ estadoOperativo: "preparando" }),
    },
  );
  assert.equal(updateResponse.status, 200);
  assert.equal(
    (await updateResponse.json()).data.pedido.estadoOperativo,
    "preparando",
  );
  assert.equal(order.stockState, "committed");

  const invalidResponse = await fetch(
    `${http.baseUrl}/api/admin/pedidos/${order._id}/estado`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ estadoOperativo: "pendiente" }),
    },
  );
  assert.equal(invalidResponse.status, 409);
  assert.equal(
    (await invalidResponse.json()).error.code,
    "INVALID_ORDER_TRANSITION",
  );
});

test("checkout crea pedido y preferencia sin descontar stock", async (t) => {
  useConnectedMongooseStub(t);
  const originalProductFind = Producto.find;
  const originalOrderFindOne = Pedido.findOne;
  const originalOrderCreate = Pedido.create;
  const originalOrderFindOneAndUpdate = Pedido.findOneAndUpdate;
  const originalPreferenceCreate = Preference.prototype.create;
  const previousEnv = {
    SHIPPING_COST: process.env.SHIPPING_COST,
    FRONTEND_URL: process.env.FRONTEND_URL,
    BACKEND_PUBLIC_URL: process.env.BACKEND_PUBLIC_URL,
    MERCADO_PAGO_MODE: process.env.MERCADO_PAGO_MODE,
    MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN,
    JWT_SECRET: process.env.JWT_SECRET,
  };
  Object.assign(process.env, {
    SHIPPING_COST: "1500",
    FRONTEND_URL: "https://tienda.example",
    BACKEND_PUBLIC_URL: "https://api.example",
    MERCADO_PAGO_MODE: "sandbox",
    MERCADO_PAGO_ACCESS_TOKEN: "TEST-api-contract",
    JWT_SECRET: "checkout-test-secret-with-at-least-32-characters",
  });

  const product = {
    _id: "64f1c2a9633f88d5c6f12345",
    name: "Melisa",
    price: 2500,
    stock: 4,
    active: true,
  };
  let order;
  let preferenceRequest;
  Producto.find = async () => [product];
  Pedido.findOne = async () => null;
  Pedido.create = async (payload) => {
    order = {
      _id: "64f1c2a9633f88d5c6f99999",
      ...payload,
    };
    return order;
  };
  Pedido.findOneAndUpdate = async (_filter, update) => {
    if (update.$set.preferenceCreationState === "creating") {
      order.preferenceCreationState = "creating";
      order.preferenceClaimToken = update.$set.preferenceClaimToken;
      return order;
    }
    order.pago.preferenceId = update.$set["pago.preferenceId"];
    order.pago.checkoutUrl = update.$set["pago.checkoutUrl"];
    order.pago.amount = update.$set["pago.amount"];
    order.pago.preferenceExpiresAt =
      update.$set["pago.preferenceExpiresAt"];
    order.preferenceCreationState = "created";
    return order;
  };
  Preference.prototype.create = async function create(value) {
    preferenceRequest = value;
    return {
      id: "preference-api-test",
      init_point: "https://mp.example/checkout",
      sandbox_init_point: "https://sandbox.mp.example/checkout",
    };
  };
  t.after(() => {
    Producto.find = originalProductFind;
    Pedido.findOne = originalOrderFindOne;
    Pedido.create = originalOrderCreate;
    Pedido.findOneAndUpdate = originalOrderFindOneAndUpdate;
    Preference.prototype.create = originalPreferenceCreate;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const server = new Server();
  const http = await listen(server.app);
  t.after(http.close);
  const response = await fetch(`${http.baseUrl}/api/checkout/mercadopago`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "checkout-api-contract-123456",
    },
    body: JSON.stringify(validCheckout("retiro")),
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(
    result.data.pago.checkoutUrl,
    "https://sandbox.mp.example/checkout",
  );
  assert.equal(result.data.pedido.total, 5000);
  assert.ok(result.data.orderToken);
  assert.ok(result.data.pago.expiresAt);
  assert.equal(product.stock, 4);
  assert.equal(order.stockState, "pending");
  assert.equal(preferenceRequest.body.items[0].unit_price, 2500);
  assert.equal(preferenceRequest.body.items[0].quantity, 2);
});

test("estado público de pedido exige referencia y token no adivinable", async (t) => {
  useConnectedMongooseStub(t);
  const originalFindOne = Pedido.findOne;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET =
    "public-order-test-secret-with-at-least-32-characters";
  const order = {
    numero: "EJL-20260724-ABCDEF123456",
    externalReference: "EJL-20260724-ABCDEF123456",
    subtotal: 5000,
    costoEnvio: 0,
    total: 5000,
    estadoPago: "pending",
    estadoOperativo: "pendiente",
    createdAt: new Date("2026-07-24T12:00:00.000Z"),
    updatedAt: new Date("2026-07-24T12:00:00.000Z"),
  };
  Pedido.findOne = async () => order;
  t.after(() => {
    Pedido.findOne = originalFindOne;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const server = new Server();
  const http = await listen(server.app);
  t.after(http.close);
  const path = `/api/pedidos/${order.numero}/estado`;

  const blocked = await fetch(`${http.baseUrl}${path}`);
  assert.equal(blocked.status, 403);

  const response = await fetch(`${http.baseUrl}${path}`, {
    headers: {
      "X-Order-Token": buildOrderToken(order.numero),
    },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.pedido.numero, order.numero);
  assert.equal("cliente" in result.data.pedido, false);
  assert.equal("entrega" in result.data.pedido, false);
});

test("webhook inválido se rechaza antes de consultar Mercado Pago", async (t) => {
  useConnectedMongooseStub(t);
  const previousSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = "webhook-secret-long-enough";
  t.after(() => {
    if (previousSecret === undefined) {
      delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    } else {
      process.env.MERCADO_PAGO_WEBHOOK_SECRET = previousSecret;
    }
  });
  const server = new Server();
  const http = await listen(server.app);
  t.after(http.close);

  const response = await fetch(
    `${http.baseUrl}/api/pagos/mercadopago/webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "request-invalid",
        "x-signature": "ts=1,v1=invalid",
      },
      body: JSON.stringify({
        type: "payment",
        data: { id: "payment-1" },
      }),
    },
  );
  assert.equal(response.status, 401);
  assert.equal(
    (await response.json()).error.code,
    "INVALID_WEBHOOK_SIGNATURE",
  );
});

test("error central no filtra mensajes internos de dependencias", async (t) => {
  const app = express();
  app.get("/failure", (_req, _res, next) => {
    const error = new Error("ruta interna C:\\secret\\database.js");
    error.status = 400;
    next(error);
  });
  app.use(errorHandler);
  const http = await listen(app);
  t.after(http.close);

  const response = await fetch(`${http.baseUrl}/failure`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "REQUEST_ERROR",
      message: "La solicitud no es válida.",
    },
  });
});
