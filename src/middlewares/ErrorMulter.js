const errorMulter = (err, _req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(400)
      .json({ mensaje: "La imagen no puede ser mayor a 2MB" });
  }

  if (err && err.code === "LIMIT_FILE_TYPE") {
    return res.status(400).json({
      mensaje: "Solo se permiten imagenes JPG, PNG, WEBP o AVIF",
    });
  }

  if (err) {
    return res.status(400).json({
      mensaje: "No se pudo procesar el archivo adjunto",
    });
  }

  next();
};

export default errorMulter;
