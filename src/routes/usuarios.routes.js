import { Router } from "express";
import {
  crearUsuario,
  iniciarSesion,
  iniciarSesionSocial,
  solicitarRecuperacionPassword,
  restablecerPassword,
  listarUsuarios,
  obtenerUsuarioID,
  cambiarEstadoUsuario,
  eliminarUsuario,
  actualizarCarrito,
} from "../controllers/usuarios.controllers.js";
import verificarJWT from "../middlewares/verificarJWT.js";
import { esAdministrador } from "../middlewares/verificarRoles.js";
import validacionUsuarios from "../middlewares/validacionUsuarios.js";
import validacionLogin from "../middlewares/validacionLogin.js";
import validarEstadoUsuario from "../middlewares/validarEstadoUsuario.js";
import validacionID from "../middlewares/validacionID.js";
import autorizarUsuarioOAdmin from "../middlewares/autorizarUsuarioOAdmin.js";
import createRateLimiter from "../middlewares/createRateLimiter.js";
import validacionCarrito from "../middlewares/validacionCarrito.js";
import validacionRecuperarPassword from "../middlewares/validacionRecuperarPassword.js";
import validacionResetPassword from "../middlewares/validacionResetPassword.js";
import validacionSocialLogin from "../middlewares/validacionSocialLogin.js";

const router = Router();
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  message: "Demasiados intentos de autenticacion. Intenta nuevamente mas tarde.",
  keyPrefix: "auth",
});

router.post("/", authRateLimit, validacionUsuarios, crearUsuario);
router.post("/iniciar-sesion", authRateLimit, validacionLogin, iniciarSesion);
router.post("/login", authRateLimit, validacionLogin, iniciarSesion);
router.post(
  "/iniciar-sesion-social",
  authRateLimit,
  validacionSocialLogin,
  iniciarSesionSocial,
);
router.post(
  "/social-login",
  authRateLimit,
  validacionSocialLogin,
  iniciarSesionSocial,
);
router.post(
  "/recuperar-password",
  authRateLimit,
  validacionRecuperarPassword,
  solicitarRecuperacionPassword,
);
router.post(
  "/forgot-password",
  authRateLimit,
  validacionRecuperarPassword,
  solicitarRecuperacionPassword,
);
router.post(
  "/restablecer-password",
  authRateLimit,
  validacionResetPassword,
  restablecerPassword,
);
router.post(
  "/reset-password",
  authRateLimit,
  validacionResetPassword,
  restablecerPassword,
);

router.get("/", verificarJWT, esAdministrador, listarUsuarios);
router.get(
  "/:id",
  verificarJWT,
  validacionID,
  autorizarUsuarioOAdmin(),
  obtenerUsuarioID,
);

router.patch(
  "/:id",
  verificarJWT,
  esAdministrador,
  validacionID,
  validarEstadoUsuario,
  cambiarEstadoUsuario,
);

router.delete("/:id", verificarJWT, esAdministrador, validacionID, eliminarUsuario);

router.put(
  "/carrito/:id",
  verificarJWT,
  validacionID,
  autorizarUsuarioOAdmin(),
  validacionCarrito,
  actualizarCarrito,
);

export default router;
