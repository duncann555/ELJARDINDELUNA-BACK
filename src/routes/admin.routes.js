import { Router } from "express";
import {
  loginAdmin,
  obtenerSesionAdmin,
} from "../controllers/admin.controllers.js";
import {
  cambiarActivoProducto,
  crearProducto,
  editarProducto,
  listarProductosAdmin,
  obtenerProductoAdmin,
} from "../controllers/productos.controllers.js";
import {
  actualizarEstadoPedidoAdmin,
  listarPedidosAdmin,
  obtenerPedidoAdmin,
} from "../controllers/pedidos.controllers.js";
import verificarAdminJWT from "../middlewares/verificarJWT.js";
import validarLoginAdmin from "../middlewares/validacionAdmin.js";
import {
  validarIdProducto,
  validarProducto,
} from "../middlewares/validacionProducto.js";
import validarActivoProducto from "../middlewares/validarEstadoProducto.js";
import {
  validarEstadoOperativo,
  validarIdPedido,
} from "../middlewares/validacionPedidosAdmin.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";
import upload from "../helpers/upload.js";
import errorMulter from "../middlewares/ErrorMulter.js";
import noStore from "../middlewares/noStore.js";

const router = Router();
const adminLoginLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  message: "Demasiados intentos. Probá nuevamente más tarde.",
  keyPrefix: "admin-login",
});

router.use(noStore);
router.post(
  "/login",
  adminLoginLimiter,
  validarLoginAdmin,
  asyncHandler(loginAdmin),
);

router.use(verificarAdminJWT);
router.get("/sesion", asyncHandler(obtenerSesionAdmin));

router.get("/productos", asyncHandler(listarProductosAdmin));
router.get(
  "/productos/:id",
  validarIdProducto,
  asyncHandler(obtenerProductoAdmin),
);
router.post(
  "/productos",
  upload.single("image"),
  errorMulter,
  validarProducto,
  asyncHandler(crearProducto),
);
router.put(
  "/productos/:id",
  upload.single("image"),
  errorMulter,
  validarIdProducto,
  validarProducto,
  asyncHandler(editarProducto),
);
router.patch(
  "/productos/:id/active",
  validarActivoProducto,
  asyncHandler(cambiarActivoProducto),
);

router.get("/pedidos", asyncHandler(listarPedidosAdmin));
router.get(
  "/pedidos/:id",
  validarIdPedido,
  asyncHandler(obtenerPedidoAdmin),
);
router.patch(
  "/pedidos/:id/estado",
  validarEstadoOperativo,
  asyncHandler(actualizarEstadoPedidoAdmin),
);
export default router;
