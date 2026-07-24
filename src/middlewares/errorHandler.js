const normalizeStatus = (error) => {
  const status = Number(error?.status || error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : 500;
};

const DEFAULT_MESSAGES = {
  400: "La solicitud no es válida.",
  401: "La autenticación es obligatoria.",
  403: "No tenés permiso para realizar esta acción.",
  404: "El recurso solicitado no existe.",
  409: "La solicitud entra en conflicto con el estado actual.",
  413: "La solicitud es demasiado grande.",
  429: "Se realizaron demasiadas solicitudes.",
};

const errorHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);

  const duplicateKey = Number(error?.code) === 11000;
  const mongooseValidation =
    error?.name === "ValidationError" || error?.name === "CastError";
  const status = duplicateKey
    ? 409
    : mongooseValidation
      ? 400
      : normalizeStatus(error);
  const code = duplicateKey
    ? "DUPLICATE_RESOURCE"
    : mongooseValidation
      ? "VALIDATION_ERROR"
      : error?.code && typeof error.code === "string"
        ? error.code
        : status >= 500
          ? "INTERNAL_ERROR"
          : "REQUEST_ERROR";
  const message =
    status >= 500
      ? "Ocurrió un error interno."
      : duplicateKey
        ? "El recurso ya existe."
        : mongooseValidation
          ? "Los datos no son válidos."
          : error?.publicMessage ||
            DEFAULT_MESSAGES[status] ||
            "La solicitud no es válida.";

  if (status >= 500) {
    console.error("[error]", {
      name: String(error?.name || "Error"),
      code: String(error?.code || "INTERNAL_ERROR"),
      status,
      message: String(error?.message || "Internal error").slice(0, 300),
      ...(Number.isInteger(error?.providerStatus)
        ? { providerStatus: error.providerStatus }
        : {}),
      ...(error?.providerCode
        ? { providerCode: String(error.providerCode).slice(0, 120) }
        : {}),
    });
  }

  return res.status(status).json({
    error: {
      code,
      message,
      ...(error?.fields ? { fields: error.fields } : {}),
    },
  });
};

export default errorHandler;
