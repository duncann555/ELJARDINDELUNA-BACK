import { Router } from "express";
import {
  crearPedido,
  listarPedidos,
  obtenerPedidoID,
  actualizarEstadoPedido,
  eliminarPedido,
  listarPedidosUsuario,
} from "../controllers/pedidos.controllers.js";

import verificarJWT from "../middlewares/verificarJWT.js";
import { EsAdmin } from "../middlewares/verificarRoles.js";
import validacionPedido from "../middlewares/validacionPedido.js";
import validacionCambioEstado from "../middlewares/validacionCambioEstado.js";
import validacionID from "../middlewares/validacionID.js";

const router = Router();

/* ==========================================
   RUTAS PARA USUARIOS LOGUEADOS
========================================== */

// Crear pedido
router.post("/", verificarJWT, validacionPedido, crearPedido);

// Listar pedidos (admin ve todos / usuario solo los suyos)
router.get("/", verificarJWT, listarPedidos);

// Historial del usuario logueado
router.get("/mis-pedidos", verificarJWT, listarPedidosUsuario);

/* ==========================================
   RUTAS SOLO PARA ADMIN
========================================== */

router.get("/:id", verificarJWT, EsAdmin, validacionID, obtenerPedidoID);

router.patch(
  "/:id",
  verificarJWT,
  EsAdmin,
  validacionID,
  validacionCambioEstado,
  actualizarEstadoPedido
);

router.delete(
  "/:id",
  verificarJWT,
  EsAdmin,
  validacionID,
  eliminarPedido
);

export default router;
