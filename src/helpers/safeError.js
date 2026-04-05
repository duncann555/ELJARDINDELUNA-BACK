const isProduction = process.env.NODE_ENV === "production";

export const buildSafeErrorPayload = (mensaje, error) => {
  const payload = { mensaje };

  if (!isProduction && error) {
    payload.detalle = error?.message || String(error);
  }

  return payload;
};

export const responderError = (res, status, mensaje, error) => {
  if (error) {
    console.error(`${mensaje}:`, error);
  }

  return res.status(status).json(buildSafeErrorPayload(mensaje, error));
};
