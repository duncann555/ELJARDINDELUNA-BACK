import { Router } from "express";
import {
  cambiarEstadoProducto,
  crearProducto,
  listarProductos,
  listarProductosAdmin,
  obtenerProductoID,
  editarProducto,
  eliminarProducto,
  filtrarProductoNombre,
} from "../controllers/productos.controllers.js";
import verificarJWT from "../middlewares/verificarJWT.js";
import { esAdministrador } from "../middlewares/verificarRoles.js";
import upload from "../helpers/upload.js";
import errorMulter from "../middlewares/ErrorMulter.js";
import { validacionProducto } from "../middlewares/validacionProducto.js";
import validacionID from "../middlewares/validacionID.js";
import validarEstadoProducto from "../middlewares/validarEstadoProducto.js";

const router = Router();

router.get("/", listarProductos);
router.get("/admin/todos", verificarJWT, esAdministrador, listarProductosAdmin);
router.get("/buscar", filtrarProductoNombre);
router.get("/:id", validacionID, obtenerProductoID);

router.post(
  "/",
  verificarJWT,
  esAdministrador,
  upload.single("imagen"),
  errorMulter,
  validacionProducto,
  crearProducto,
);

router.put(
  "/:id",
  verificarJWT,
  esAdministrador,
  validacionID,
  upload.single("imagen"),
  errorMulter,
  validacionProducto,
  editarProducto,
);

router.patch(
  "/:id/estado",
  verificarJWT,
  esAdministrador,
  validacionID,
  validarEstadoProducto,
  cambiarEstadoProducto,
);

router.delete("/:id", verificarJWT, esAdministrador, validacionID, eliminarProducto);

export default router;
