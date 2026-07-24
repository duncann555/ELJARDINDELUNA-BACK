import express from "express";
import cors from "cors";
import { conectarBD } from "./dbconfig.js";
import router from "../routes/index.routes.js";
import securityHeaders from "../middlewares/securityHeaders.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";
import notFound from "../middlewares/notFound.js";
import errorHandler from "../middlewares/errorHandler.js";
import { obtenerConfiguracionCheckout } from "../controllers/checkout.controllers.js";

const SERVICE_NAME = "el-jardin-de-luna-backend";

const normalizeOrigin = (value) => {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
};

export const getAllowedOrigins = () =>
  [
    process.env.FRONTEND_URL,
    ...String(process.env.CORS_ORIGINS || "").split(","),
  ]
    .map(normalizeOrigin)
    .filter(Boolean)
    .filter((origin, index, list) => list.indexOf(origin) === index);

export const buildCorsOptions = () => {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (normalizedOrigin && allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      const error = new Error("Origen no permitido.");
      error.status = 403;
      error.code = "CORS_ORIGIN_REJECTED";
      error.publicMessage = "Origen no permitido.";
      return callback(error);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "X-Order-Token",
      "X-Request-Id",
      "X-Signature",
    ],
    maxAge: 600,
  };
};

export default class Server {
  constructor() {
    this.app = express();
    this.port = Number(process.env.PORT || 3001);
    this.host = "0.0.0.0";
    this.configure();
  }

  configure() {
    this.app.disable("x-powered-by");
    this.app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
    this.app.use(securityHeaders);
    this.app.use(cors(buildCorsOptions()));
    this.app.use(
      createRateLimiter({
        windowMs: 60_000,
        max: 120,
        skip: (req) =>
          req.path === "/api/pagos/mercadopago/webhook",
      }),
    );
    this.app.use(express.json({ limit: "100kb" }));
    this.app.use(express.urlencoded({ extended: false, limit: "100kb" }));

    this.app.get("/api/health", (_req, res) =>
      res.json({
        data: {
          ok: true,
          service: SERVICE_NAME,
        },
      }),
    );
    this.app.get(
      "/api/checkout/configuracion",
      obtenerConfiguracionCheckout,
    );

    this.app.use("/api", async (_req, _res, next) => {
      try {
        await conectarBD();
        return next();
      } catch (error) {
        return next(error);
      }
    });
    this.app.use("/api", router);
    this.app.use(notFound);
    this.app.use(errorHandler);
  }

  listen() {
    return this.app.listen(this.port, this.host, () => {
      console.info(`[server] ${SERVICE_NAME} listening on ${this.host}:${this.port}`);
    });
  }
}
