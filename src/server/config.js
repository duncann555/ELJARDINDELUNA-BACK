import express from "express";
import cors from "cors";
import morgan from "morgan";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { conectarBD } from "./dbconfig.js";
import router from "../routes/index.routes.js";
import securityHeaders from "../middlewares/securityHeaders.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";

const SERVICE_NAME = "el-jardin-de-luna-backend";

const normalizarOrigen = (value) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().replace(/\/+$/, "");
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed === "localhost" ||
        trimmed === "127.0.0.1" ||
        trimmed.startsWith("localhost:") ||
        trimmed.startsWith("127.0.0.1:")
      ? `http://${trimmed}`
      : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return withProtocol;
  }
};

const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || "").split(","),
]
  .map(normalizarOrigen)
  .filter(Boolean);

const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

const construirCorsError = () => {
  const error = new Error("Origen no permitido por CORS");
  error.status = 403;
  error.publicMessage = "Origen no permitido por CORS";
  return error;
};

const parseOriginUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isDevelopment = process.env.NODE_ENV !== "production";
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const resolveOriginPort = (url) => {
  if (!url) {
    return "";
  }

  if (url.port) {
    return url.port;
  }

  if (url.protocol === "https:") {
    return "443";
  }

  if (url.protocol === "http:") {
    return "80";
  }

  return "";
};

const isAllowedLocalDevelopmentOrigin = (origin) => {
  if (!isDevelopment) {
    return false;
  }

  const requestedUrl = parseOriginUrl(origin);

  if (!requestedUrl || !["http:", "https:"].includes(requestedUrl.protocol)) {
    return false;
  }

  return LOCALHOST_HOSTNAMES.has(requestedUrl.hostname);
};

const usesDefaultOriginPort = (url) => {
  if (!url) {
    return false;
  }

  if (!url.port) {
    return true;
  }

  return (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  );
};

const isAllowedConfiguredOrigin = (origin) => {
  const requestedUrl = parseOriginUrl(origin);

  if (!requestedUrl || !["http:", "https:"].includes(requestedUrl.protocol)) {
    return false;
  }

  const requestedPort = resolveOriginPort(requestedUrl);

  return uniqueAllowedOrigins.some((allowedOrigin) => {
    const allowedUrl = parseOriginUrl(allowedOrigin);

    if (!allowedUrl || !["http:", "https:"].includes(allowedUrl.protocol)) {
      return false;
    }

    return (
      allowedUrl.hostname === requestedUrl.hostname &&
      (
        resolveOriginPort(allowedUrl) === requestedPort ||
        (usesDefaultOriginPort(allowedUrl) && usesDefaultOriginPort(requestedUrl))
      )
    );
  });
};

const isAllowedVercelPreviewOrigin = (origin) => {
  const requestedUrl = parseOriginUrl(origin);

  if (!requestedUrl || requestedUrl.protocol !== "https:") {
    return false;
  }

  if (!requestedUrl.hostname.endsWith(".vercel.app")) {
    return false;
  }

  return uniqueAllowedOrigins.some((allowedOrigin) => {
    const allowedUrl = parseOriginUrl(allowedOrigin);

    if (!allowedUrl || allowedUrl.protocol !== "https:") {
      return false;
    }

    if (!allowedUrl.hostname.endsWith(".vercel.app")) {
      return false;
    }

    const allowedProjectSlug = allowedUrl.hostname.replace(/\.vercel\.app$/i, "");
    const requestedProjectSlug = requestedUrl.hostname.replace(
      /\.vercel\.app$/i,
      "",
    );

    return (
      requestedProjectSlug === allowedProjectSlug ||
      requestedProjectSlug.startsWith(`${allowedProjectSlug}-`)
    );
  });
};

const shouldUseCustomCors = uniqueAllowedOrigins.length > 0;

const corsOptions = shouldUseCustomCors
  ? {
      origin(origin, callback) {
        if (!origin) {
          // Requests without Origin are not cross-origin browser requests,
          // so they should not be blocked by CORS validation.
          return callback(null, true);
        }

        const normalizedOrigin = normalizarOrigen(origin);

        if (
          isAllowedLocalDevelopmentOrigin(normalizedOrigin) ||
          isAllowedConfiguredOrigin(normalizedOrigin) ||
          isAllowedVercelPreviewOrigin(normalizedOrigin)
        ) {
          return callback(null, true);
        }

        return callback(construirCorsError());
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-token", "Authorization"],
    }
  : undefined;

export default class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.host = process.env.HOST || "0.0.0.0";
    this.app.disable("x-powered-by");
    this.app.set("trust proxy", 1);
    this.publicRoutes();
    this.middlewares();
    this.routes();
    this.errors();
  }

  publicRoutes() {
    this.app.get("/api", (_req, res) => {
      res.status(200).json({
        ok: true,
        servicio: SERVICE_NAME,
        entorno: process.env.NODE_ENV || "development",
      });
    });

    this.app.get("/api/health", (_req, res) => {
      res.status(200).json({
        ok: true,
        servicio: SERVICE_NAME,
        entorno: process.env.NODE_ENV || "development",
      });
    });
  }

  middlewares() {
    const globalRateLimitWindowMs = Number(
      process.env.API_RATE_LIMIT_WINDOW_MS || 60 * 1000,
    );
    const globalRateLimitMax = Number(process.env.API_RATE_LIMIT_MAX || 120);

    this.app.use(securityHeaders);
    this.app.use(cors(corsOptions));
    this.app.use(
      createRateLimiter({
        windowMs: globalRateLimitWindowMs,
        max: globalRateLimitMax,
        message: "Demasiadas solicitudes. Intenta nuevamente en un minuto.",
        keyPrefix: "api",
      }),
    );
    this.app.use(
      express.json({
        limit:
          process.env.JSON_BODY_LIMIT ||
          process.env.REQUEST_BODY_LIMIT ||
          "100kb",
      }),
    );
    this.app.use(
      express.urlencoded({
        extended: false,
        limit:
          process.env.FORM_BODY_LIMIT ||
          process.env.REQUEST_BODY_LIMIT ||
          "100kb",
      }),
    );
    this.app.use(morgan("dev"));

    if (!process.env.VERCEL) {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      this.app.use(express.static(__dirname + "/../../public"));
    }
  }

  routes() {
    this.app.use("/api", async (_req, _res, next) => {
      try {
        await conectarBD();
        next();
      } catch (error) {
        next(error);
      }
    });

    this.app.use("/api", router);
  }

  errors() {
    this.app.use((error, _req, res, _next) => {
      if (res.headersSent) {
        return;
      }

      const status =
        Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
          ? error.status
          : 500;
      const mensaje =
        status >= 500
          ? "Error interno del servidor"
          : error?.publicMessage || "Solicitud invalida";

      if (status >= 500) {
        console.error(error);
      }

      res.status(status).json({ mensaje });
    });
  }

  listen() {
    this.app.listen(this.port, this.host, () =>
      console.info(
        `[server] ${SERVICE_NAME} escuchando en ${this.host}:${this.port}`,
      ),
    );
  }
}
