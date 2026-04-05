import { Router } from "express";
import {
  crearUsuario,
  login,
  solicitarRecuperacionPassword,
  restablecerPassword,
  listarUsuarios,
  obtenerUsuarioID,
  actualizarUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario,
  actualizarCarrito,
} from "../controllers/usuarios.controllers.js";
import verificarJWT from "../middlewares/verificarJWT.js";
import { EsAdmin } from "../middlewares/verificarRoles.js";
import validacionUsuarios from "../middlewares/validacionUsuarios.js";
import validacionLogin from "../middlewares/validacionLogin.js";
import validacionEdicionUsuario from "../middlewares/validacionEdicionUsuario.js";
import validarEstadoUsuario from "../middlewares/validarEstadoUsuario.js";
import validacionID from "../middlewares/validacionID.js";
import autorizarUsuarioOAdmin from "../middlewares/autorizarUsuarioOAdmin.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";
import validacionCarrito from "../middlewares/validacionCarrito.js";
import validacionRecuperarPassword from "../middlewares/validacionRecuperarPassword.js";
import validacionResetPassword from "../middlewares/validacionResetPassword.js";

const router = Router();
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  message: "Demasiados intentos de autenticacion. Intenta nuevamente mas tarde.",
  keyPrefix: "auth",
});

router.post("/", authRateLimit, validacionUsuarios, crearUsuario);
router.post("/login", authRateLimit, validacionLogin, login);
router.post(
  "/forgot-password",
  authRateLimit,
  validacionRecuperarPassword,
  solicitarRecuperacionPassword,
);
router.post(
  "/reset-password",
  authRateLimit,
  validacionResetPassword,
  restablecerPassword,
);

router.get("/", verificarJWT, EsAdmin, listarUsuarios);
router.get(
  "/:id",
  verificarJWT,
  validacionID,
  autorizarUsuarioOAdmin(),
  obtenerUsuarioID,
);

router.put(
  "/:id",
  verificarJWT,
  EsAdmin,
  validacionID,
  validacionEdicionUsuario,
  actualizarUsuario,
);

router.patch(
  "/:id",
  verificarJWT,
  EsAdmin,
  validacionID,
  validarEstadoUsuario,
  cambiarEstadoUsuario,
);

router.delete("/:id", verificarJWT, EsAdmin, validacionID, eliminarUsuario);

router.put(
  "/carrito/:id",
  verificarJWT,
  validacionID,
  autorizarUsuarioOAdmin(),
  validacionCarrito,
  actualizarCarrito,
);

export default router;
