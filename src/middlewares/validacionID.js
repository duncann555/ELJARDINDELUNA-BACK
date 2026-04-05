import { param } from "express-validator";
import resultadoValidacion from "./resultadoValidacion.js";

const validacionID = [
  param("id")
    .isMongoId()
    .withMessage("El ID no corresponde con el formato de Mongo DB"),
  (req, res, next) => resultadoValidacion(req, res, next),
];

export default validacionID;
