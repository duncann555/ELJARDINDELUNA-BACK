const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const requestUsaHttps = (req) => {
  if (req.secure) {
    return true;
  }

  const forwardedProto = req.headers["x-forwarded-proto"];

  if (typeof forwardedProto !== "string") {
    return false;
  }

  return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
};

const securityHeaders = (req, res, next) => {
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );

  if (process.env.NODE_ENV === "production" && requestUsaHttps(req)) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    );
  }

  next();
};

export default securityHeaders;
