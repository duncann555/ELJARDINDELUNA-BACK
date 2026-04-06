import { Router } from "express";
import {
  crearPedido,
  listarPedidos,
  actualizarEstadoPedido,
  eliminarPedido,
} from "../controllers/pedidos.controllers.js";

import verificarJWT from "../middlewares/verificarJWT.js";
import { esAdministrador } from "../middlewares/verificarRoles.js";
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

/* ==========================================
   RUTAS SOLO PARA ADMIN
========================================== */

router.patch(
  "/:id",
  verificarJWT,
  esAdministrador,
  validacionID,
  validacionCambioEstado,
  actualizarEstadoPedido,
);

router.delete(
  "/:id",
  verificarJWT,
  esAdministrador,
  validacionID,
  eliminarPedido,
);

export default router;
