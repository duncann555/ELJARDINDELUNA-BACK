const asPositiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const createRateLimiter = ({
  windowMs = 60_000,
  max = 100,
  message = "Demasiadas solicitudes. Probá nuevamente más tarde.",
  keyPrefix = "global",
  skip = () => false,
} = {}) => {
  const requests = new Map();
  const window = asPositiveNumber(windowMs, 60_000);
  const limit = Math.trunc(asPositiveNumber(max, 100));

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requests) {
      if (value.resetAt <= now) requests.delete(key);
    }
  }, window);
  cleanup.unref?.();

  return (req, res, next) => {
    if (req.method === "OPTIONS" || skip(req)) return next();

    const now = Date.now();
    const key = `${keyPrefix}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    const current = requests.get(key);

    if (!current || current.resetAt <= now) {
      requests.set(key, { count: 1, resetAt: now + window });
      return next();
    }

    if (current.count >= limit) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))),
      );
      return res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message,
        },
      });
    }

    current.count += 1;
    return next();
  };
};

export default createRateLimiter;
