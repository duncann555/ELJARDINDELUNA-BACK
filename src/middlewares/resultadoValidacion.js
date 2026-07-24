import { matchedData, validationResult } from "express-validator";

const resultadoValidacion = (req, res, next) => {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    const fields = {};

    for (const error of result.array({ onlyFirstError: true })) {
      fields[error.path || "request"] = error.msg;
    }

    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisá los datos ingresados.",
        fields,
      },
    });
  }

  req.validated = {
    ...(req.validated || {}),
    ...matchedData(req, { includeOptionals: true }),
  };
  return next();
};

export default resultadoValidacion;
