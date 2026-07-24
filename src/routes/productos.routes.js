import { Router } from "express";
import {
  listarProductos,
  obtenerProducto,
} from "../controllers/productos.controllers.js";
import asyncHandler from "../middlewares/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(listarProductos));
router.get("/:identifier", asyncHandler(obtenerProducto));

export default router;
