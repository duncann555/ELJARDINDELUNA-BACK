import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { MercadoPagoConfig, Preference } from "mercadopago";
import validateRuntimeEnv from "../src/server/validateEnv.js";
import { validateAdminCredentials } from "../src/controllers/admin.controllers.js";
import {
  ADMIN_JWT_AUDIENCE,
  ADMIN_JWT_ISSUER,
  compareAdminPassword,
  getAdminTokenVersion,
} from "../src/helpers/adminAuth.js";
import generarAdminJWT from "../src/middlewares/generarJWT.js";
import subirImagenCloudinary from "../src/helpers/cloudinaryUploader.js";
import {
  buildPreferenceBody,
  crearPreferenciaMercadoPago,
  MERCADO_PAGO_PREFERENCE_TTL_MS,
  toMercadoPagoPreferenceError,
} from "../src/services/mercadoPago.service.js";

const ENV_KEYS = [
  "NODE_ENV",
  "MONGODB_URI",
  "FRONTEND_URL",
  "CORS_ORIGINS",
  "BACKEND_PUBLIC_URL",
  "MERCADO_PAGO_MODE",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "JWT_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "ADMIN_TOKEN_EXPIRES_IN",
  "SHIPPING_COST",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const preserveEnvironment = (t) => {
  const snapshot = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  t.after(() => {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
};

const configureBaseEnvironment = (passwordHash) => {
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGODB_URI: "mongodb://127.0.0.1:27017/el-jardin-test",
    FRONTEND_URL: "http://localhost:5173",
    CORS_ORIGINS: "http://localhost:5173",
    BACKEND_PUBLIC_URL: "http://localhost:3001",
    MERCADO_PAGO_MODE: "sandbox",
    JWT_SECRET: "a-secure-test-secret-with-at-least-32-characters",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: passwordHash,
    ADMIN_TOKEN_EXPIRES_IN: "30m",
    SHIPPING_COST: "1500",
  });
  delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
};

test("entorno dev admite integraciones ausentes, producción exige Mercado Pago", async (t) => {
  preserveEnvironment(t);
  const passwordHash = await bcrypt.hash("correct horse battery", 4);
  configureBaseEnvironment(passwordHash);

  assert.equal(validateRuntimeEnv(), true);

  process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-only-token";
  assert.throws(validateRuntimeEnv, /deben configurarse juntas/);
  delete process.env.MERCADO_PAGO_ACCESS_TOKEN;

  process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-only-token";
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = "webhook-secret-long-enough";
  assert.throws(validateRuntimeEnv, /FRONTEND_URL.*HTTPS pública/);
  process.env.FRONTEND_URL = "https://tienda.example";
  assert.throws(validateRuntimeEnv, /BACKEND_PUBLIC_URL.*HTTPS pública/);
  process.env.BACKEND_PUBLIC_URL = "https://api.example";
  assert.equal(validateRuntimeEnv(), true);
  delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  process.env.CLOUDINARY_CLOUD_NAME = "only-one-value";
  assert.throws(validateRuntimeEnv, /CLOUDINARY_\*/);
  delete process.env.CLOUDINARY_CLOUD_NAME;

  Object.assign(process.env, {
    NODE_ENV: "production",
    FRONTEND_URL: "https://tienda.example",
    CORS_ORIGINS: "https://tienda.example",
    BACKEND_PUBLIC_URL: "https://api.example",
    MERCADO_PAGO_MODE: "production",
  });
  assert.throws(validateRuntimeEnv, /MERCADO_PAGO_ACCESS_TOKEN/);

  process.env.MERCADO_PAGO_ACCESS_TOKEN = "APP_USR-test";
  process.env.MERCADO_PAGO_WEBHOOK_SECRET =
    "production-webhook-secret";
  assert.throws(validateRuntimeEnv, /costo bcrypt de al menos 10/);
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(
    "correct horse battery",
    10,
  );
  process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-production-invalid";
  assert.throws(validateRuntimeEnv, /credencial TEST-/);

  process.env.MERCADO_PAGO_ACCESS_TOKEN = "APP_USR-test";
  assert.equal(validateRuntimeEnv(), true);

  process.env.MERCADO_PAGO_MODE = "sandbox";
  assert.throws(validateRuntimeEnv, /debe ser production/);
  process.env.MERCADO_PAGO_MODE = "production";

  process.env.ADMIN_TOKEN_EXPIRES_IN = "2h";
  assert.throws(validateRuntimeEnv, /entre 5 minutos y 1 hora/);
});

test("JWT sólo representa al admin configurado y versiona el hash", async (t) => {
  preserveEnvironment(t);
  const passwordHash = await bcrypt.hash("correct horse battery", 4);
  configureBaseEnvironment(passwordHash);

  assert.equal(
    await compareAdminPassword("correct horse battery"),
    true,
  );
  assert.equal(await compareAdminPassword("incorrect"), false);

  const tokenVersion = getAdminTokenVersion();
  const token = generarAdminJWT();
  const payload = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: ADMIN_JWT_ISSUER,
    audience: ADMIN_JWT_AUDIENCE,
    subject: "admin",
  });
  assert.equal(payload.email, "admin@example.com");
  assert.equal(payload.role, "admin");
  assert.equal(payload.tokenVersion, tokenVersion);
  assert.equal("userId" in payload, false);

  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(
    "another password",
    4,
  );
  assert.notEqual(getAdminTokenVersion(), tokenVersion);
});

test("login compara bcrypt aun cuando el correo no coincide", async () => {
  let comparisons = 0;
  const valid = await validateAdminCredentials({
    email: "otro@example.com",
    password: "candidate",
    configuredEmail: "admin@example.com",
    comparePassword: async () => {
      comparisons += 1;
      return true;
    },
  });

  assert.equal(valid, false);
  assert.equal(comparisons, 1);
});

test("upload con Cloudinary ausente falla 503 antes de llamar al proveedor", async (t) => {
  preserveEnvironment(t);
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;

  await assert.rejects(
    subirImagenCloudinary({
      buffer: Buffer.from("not-uploaded"),
      mimetype: "image/webp",
    }),
    (error) =>
      error.status === 503 && error.code === "CLOUDINARY_NOT_CONFIGURED",
  );
});

test("preferencia usa snapshots y envío calculados por el backend", (t) => {
  preserveEnvironment(t);
  Object.assign(process.env, {
    NODE_ENV: "test",
    FRONTEND_URL: "https://tienda.example",
    BACKEND_PUBLIC_URL: "https://api.example",
  });
  const now = new Date("2026-07-24T12:00:00.000Z");
  const body = buildPreferenceBody({
    now,
    order: {
      numero: "EJL-20260101-ABC12345",
      externalReference: "EJL-20260101-ABC12345",
      cliente: {
        nombre: "Ana",
        apellido: "Pérez",
        email: "ana@example.com",
      },
      productos: [
        {
          producto: productIdForPreference,
          name: "Lavanda",
          quantity: 2,
          price: 1000.25,
        },
      ],
      costoEnvio: 500,
      total: 2500.5,
    },
  });

  assert.equal(
    body.items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0,
    ),
    2500.5,
  );
  assert.equal(body.expires, true);
  assert.equal(body.expiration_date_from, now.toISOString());
  assert.equal(
    body.expiration_date_to,
    new Date(now.getTime() + MERCADO_PAGO_PREFERENCE_TTL_MS).toISOString(),
  );
  assert.equal(body.external_reference, "EJL-20260101-ABC12345");
  assert.match(body.notification_url, /mercadopago\/webhook$/);
});

test("SDK oficial conserva exports y recibe body + requestOptions", async (t) => {
  preserveEnvironment(t);
  Object.assign(process.env, {
    NODE_ENV: "test",
    FRONTEND_URL: "https://tienda.example",
    BACKEND_PUBLIC_URL: "https://api.example",
    MERCADO_PAGO_MODE: "sandbox",
  });
  const sdkClient = new MercadoPagoConfig({ accessToken: "TEST-token" });
  const sdkPreference = new Preference(sdkClient);
  assert.equal(typeof sdkPreference.create, "function");

  const requests = [];
  const providerExpiration = "2026-01-01T12:29:30.000Z";
  const order = {
    numero: "EJL-20260101-ABC12345",
    externalReference: "EJL-20260101-ABC12345",
    cliente: {
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@example.com",
    },
    productos: [
      {
        producto: productIdForPreference,
        name: "Lavanda",
        quantity: 1,
        price: 1000,
      },
    ],
    costoEnvio: 0,
    total: 1000,
    pago: {
      preferenceValidFrom: new Date("2026-01-01T12:00:00.000Z"),
      preferenceExpiresAt: new Date("2026-01-01T12:30:00.000Z"),
    },
  };
  const createPreference = () => crearPreferenciaMercadoPago({
    order,
    idempotencyKey: `checkout-${"x".repeat(150)}`,
    preferenceClient: {
      create: async (value) => {
        requests.push(value);
        return {
          id: "preference-1",
          init_point: "https://mp.example/production",
          sandbox_init_point: "https://mp.example/sandbox",
          expiration_date_to: providerExpiration,
        };
      },
    },
  });
  const result = await createPreference();
  await createPreference();

  assert.equal(result.preferenceId, "preference-1");
  assert.equal(result.checkoutUrl, "https://mp.example/sandbox");
  assert.equal(result.expiresAt, providerExpiration);
  assert.equal(requests[0].body.external_reference, order.externalReference);
  assert.equal(requests[0].requestOptions.idempotencyKey.length, 64);
  assert.deepEqual(requests[1], requests[0]);
});

test("rechazos de preferencia conservan sólo diagnóstico seguro", () => {
  const rejected = toMercadoPagoPreferenceError({
    status: 400,
    error: "invalid_auto_return",
    message: "detalle interno que no debe exponerse",
  });
  assert.equal(rejected.status, 502);
  assert.equal(rejected.code, "MERCADO_PAGO_PREFERENCE_REJECTED");
  assert.equal(rejected.providerStatus, 400);
  assert.equal(rejected.providerCode, "invalid_auto_return");

  const unavailable = toMercadoPagoPreferenceError(
    new Error("network timeout"),
  );
  assert.equal(unavailable.status, 502);
  assert.equal(unavailable.code, "MERCADO_PAGO_UNAVAILABLE");
  assert.equal("providerCode" in unavailable, false);
});

const productIdForPreference = "64f1c2a9633f88d5c6f12345";
