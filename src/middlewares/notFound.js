const notFound = (_req, res) =>
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "El recurso solicitado no existe.",
    },
  });

export default notFound;
