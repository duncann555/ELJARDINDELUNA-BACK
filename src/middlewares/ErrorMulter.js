import AppError from "../helpers/AppError.js";

const PAYLOAD_LIMIT_CODES = new Set([
  "LIMIT_FILE_SIZE",
  "LIMIT_FILE_COUNT",
  "LIMIT_FIELD_COUNT",
  "LIMIT_FIELD_VALUE",
  "LIMIT_PART_COUNT",
]);

const errorMulter = (error, _req, _res, next) => {
  if (!error) return next();

  if (PAYLOAD_LIMIT_CODES.has(error.code)) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "La imagen no puede superar 2 MB."
        : "La carga contiene demasiados datos.";
    return next(new AppError(413, "UPLOAD_TOO_LARGE", message));
  }

  const message =
    error.code === "LIMIT_FILE_TYPE"
      ? "Solo se permiten imágenes JPG, PNG, WEBP o AVIF."
      : error.code === "LIMIT_UNEXPECTED_FILE"
        ? "Solo se admite una imagen en el campo image."
        : "No se pudo procesar la imagen.";
  return next(new AppError(400, "INVALID_IMAGE", message));
};

export default errorMulter;
