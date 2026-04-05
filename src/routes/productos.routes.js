import { Router } from "express";
import {
  crearProducto,
  listarProductos,
  obtenerProductoID,
  editarProducto,
  eliminarProducto,
  filtrarProductoNombre,
} from "../controllers/productos.controllers.js";
import verificarJWT from "../middlewares/verificarJWT.js";
import { EsAdmin } from "../middlewares/verificarRoles.js";
import upload from "../helpers/upload.js";
import errorMulter from "../middlewares/ErrorMulter.js";
import { validacionProducto } from "../middlewares/validacionProducto.js";
import validacionID from "../middlewares/validacionID.js";

const router = Router();

router.get("/", listarProductos);
router.get("/buscar", filtrarProductoNombre);
router.get("/:id", validacionID, obtenerProductoID);

router.post(
  "/",
  verificarJWT,
  EsAdmin,
  upload.single("imagen"),
  errorMulter,
  validacionProducto,
  crearProducto,
);

router.put(
  "/:id",
  verificarJWT,
  EsAdmin,
  validacionID,
  upload.single("imagen"),
  errorMulter,
  validacionProducto,
  editarProducto,
);

router.delete("/:id", verificarJWT, EsAdmin, validacionID, eliminarProducto);

export default router;
