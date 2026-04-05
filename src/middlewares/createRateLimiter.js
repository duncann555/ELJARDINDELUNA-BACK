const obtenerIpCliente = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "ip-desconocida"
  );
};

const normalizarNumeroPositivo = (valor, fallback) => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : fallback;
};

export const createRateLimiter = ({
  windowMs = 60 * 1000,
  max = 100,
  message = "Demasiadas solicitudes. Intenta nuevamente mas tarde.",
  keyPrefix = "global",
  keyGenerator,
} = {}) => {
  const hits = new Map();
  const ventana = normalizarNumeroPositivo(windowMs, 60 * 1000);
  const limite = Math.max(1, Math.trunc(normalizarNumeroPositivo(max, 100)));

  const cleanupInterval = setInterval(() => {
    const ahora = Date.now();

    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= ahora) {
        hits.delete(key);
      }
    }
  }, ventana);

  cleanupInterval.unref?.();

  return (req, res, next) => {
    if (req.method === "OPTIONS") {
      return next();
    }

    const ahora = Date.now();
    const clientKey =
      typeof keyGenerator === "function"
        ? keyGenerator(req)
        : obtenerIpCliente(req);
    const key = `${keyPrefix}:${clientKey}`;
    const current = hits.get(key);

    if (!current || current.resetAt <= ahora) {
      hits.set(key, {
        count: 1,
        resetAt: ahora + ventana,
      });
      return next();
    }

    if (current.count >= limite) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((current.resetAt - ahora) / 1000))),
      );
      return res.status(429).json({ mensaje: message });
    }

    current.count += 1;
    return next();
  };
};

export default createRateLimiter;
