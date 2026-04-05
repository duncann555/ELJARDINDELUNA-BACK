import bcrypt from "bcrypt";
import Usuario from "../models/usuario.js";
import { responderAutenticacion } from "../helpers/authResponse.js";
import {
  buildPasswordResetExpiryDate,
  buildPasswordResetUrl,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "../helpers/passwordReset.js";
import { responderError } from "../helpers/safeError.js";
import { sendPasswordResetEmail } from "../services/email.service.js";

const SALT_ROUNDS = 10;
const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Si el email existe, te enviaremos un enlace para restablecer tu contrasena.";

const normalizarTexto = (valor) =>
  typeof valor === "string" ? valor.trim() : "";

const normalizarEmail = (valor) => normalizarTexto(valor).toLowerCase();
const normalizarEstadoUsuario = (valor) =>
  valor === "Activo" ? "Activo" : "Suspendido";

const generarHashPassword = (password) =>
  bcrypt.hashSync(password, bcrypt.genSaltSync(SALT_ROUNDS));

const usuarioEstaActivo = (usuario) => usuario?.estado === "Activo";

const crearPayloadUsuario = ({
  nombre,
  apellido,
  telefono,
  email,
  password,
  extras = {},
}) => ({
  nombre: normalizarTexto(nombre),
  apellido: normalizarTexto(apellido),
  telefono: normalizarTexto(telefono),
  email: normalizarEmail(email),
  password,
  rol: "Usuario",
  estado: "Activo",
  carrito: [],
  ...extras,
});

const sanitizarCarrito = (carrito) =>
  carrito.map((item) => ({
    productoId: item.productoId,
    nombre: normalizarTexto(item.nombre),
    precio: Number(item.precio || 0),
    cantidad: Number(item.cantidad),
    imagenUrl: typeof item.imagenUrl === "string" ? item.imagenUrl : "",
  }));

const serializarUsuario = (usuario) => {
  const usuarioPlano =
    typeof usuario?.toObject === "function" ? usuario.toObject() : usuario;

  return {
    ...usuarioPlano,
    estado: normalizarEstadoUsuario(usuarioPlano?.estado),
  };
};

const responderCuentaInactiva = (res) =>
  res.status(401).json({
    mensaje: "Cuenta suspendida",
  });

export const crearUsuario = async (req, res) => {
  try {
    const { nombre, apellido, telefono, password } = req.body;
    const email = normalizarEmail(req.body.email);

    const usuarioExistente = await Usuario.findOne({ email });

    if (usuarioExistente) {
      return res.status(400).json({ mensaje: "El correo ya esta registrado" });
    }

    const usuario = new Usuario(
      crearPayloadUsuario({
        nombre,
        apellido,
        telefono,
        email,
        password: generarHashPassword(password),
      }),
    );

    await usuario.save();

    return responderAutenticacion(
      res,
      usuario,
      "Usuario creado correctamente",
      201,
    );
  } catch (error) {
    return responderError(res, 500, "Error al crear el usuario", error);
  }
};

export const login = async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const { password } = req.body;
    const usuario = await Usuario.findOne({ email }).select("+password");

    if (!usuario) {
      return res
        .status(400)
        .json({ mensaje: "Correo o contrasena incorrectos" });
    }

    if (!usuarioEstaActivo(usuario)) {
      return responderCuentaInactiva(res);
    }

    const passwordValido = bcrypt.compareSync(password, usuario.password);

    if (!passwordValido) {
      return res
        .status(400)
        .json({ mensaje: "Correo o contrasena incorrectos" });
    }

    return responderAutenticacion(res, usuario, "Login exitoso");
  } catch (error) {
    return responderError(res, 500, "Error en el login", error);
  }
};

export const solicitarRecuperacionPassword = async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const usuario = await Usuario.findOne({ email });
    const responsePayload = { mensaje: PASSWORD_RESET_SUCCESS_MESSAGE };

    if (!usuario || !usuarioEstaActivo(usuario)) {
      return res.status(200).json(responsePayload);
    }

    const rawResetToken = generatePasswordResetToken();

    usuario.resetPasswordToken = hashPasswordResetToken(rawResetToken);
    usuario.resetPasswordExpiresAt = buildPasswordResetExpiryDate();
    await usuario.save({ validateBeforeSave: false });

    const resetUrl = buildPasswordResetUrl(rawResetToken);

    try {
      await sendPasswordResetEmail({
        toEmail: usuario.email,
        nombre: usuario.nombre,
        resetUrl,
      });

      return res.status(200).json(responsePayload);
    } catch (deliveryError) {
      console.error(
        "[password-reset] No se pudo completar el envio del correo:",
        deliveryError,
      );
      return res.status(200).json(responsePayload);
    }
  } catch (error) {
    return responderError(
      res,
      500,
      "Error al solicitar la recuperacion de contrasena",
      error,
    );
  }
};

export const restablecerPassword = async (req, res) => {
  try {
    const tokenHash = hashPasswordResetToken(req.body.token);
    const usuario = await Usuario.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
    }).select("+password +resetPasswordToken +resetPasswordExpiresAt");

    if (!usuario) {
      return res.status(400).json({
        mensaje: "El enlace de recuperacion no es valido o ya vencio",
      });
    }

    if (!usuarioEstaActivo(usuario)) {
      return responderCuentaInactiva(res);
    }

    usuario.password = generarHashPassword(req.body.password);
    usuario.resetPasswordToken = null;
    usuario.resetPasswordExpiresAt = null;
    await usuario.save();

    return res.status(200).json({
      mensaje: "La contrasena se actualizo correctamente",
    });
  } catch (error) {
    return responderError(
      res,
      500,
      "Error al restablecer la contrasena",
      error,
    );
  }
};

export const actualizarCarrito = async (req, res) => {
  try {
    const usuarioActualizado = await Usuario.findByIdAndUpdate(
      req.params.id,
      { carrito: sanitizarCarrito(req.body.carrito) },
      { new: true, runValidators: true },
    ).select("-password");

    if (!usuarioActualizado) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    return res.status(200).json({
      mensaje: "Carrito sincronizado correctamente",
      carrito: usuarioActualizado.carrito,
    });
  } catch (error) {
    return responderError(res, 500, "Error al sincronizar carrito", error);
  }
};

export const listarUsuarios = async (_req, res) => {
  try {
    const usuarios = await Usuario.find({
      email: { $ne: process.env.ADMIN_EMAIL },
    }).select("-password");

    return res.status(200).json(usuarios.map(serializarUsuario));
  } catch (error) {
    return responderError(res, 500, "Error al listar usuarios", error);
  }
};

export const obtenerUsuarioID = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select("-password");

    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    return res.status(200).json(serializarUsuario(usuario));
  } catch (error) {
    return responderError(res, 500, "Error al buscar usuario", error);
  }
};

export const cambiarEstadoUsuario = async (req, res) => {
  try {
    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { estado: req.body.estado },
      { new: true, runValidators: true },
    ).select("-password");

    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    return res.status(200).json({
      mensaje: "Estado actualizado",
      usuario: serializarUsuario(usuario),
    });
  } catch (error) {
    return responderError(res, 500, "Error al cambiar estado", error);
  }
};

export const eliminarUsuario = async (req, res) => {
  try {
    const usuario = await Usuario.findByIdAndDelete(req.params.id);

    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    return res
      .status(200)
      .json({ mensaje: "Usuario eliminado correctamente" });
  } catch (error) {
    return responderError(res, 500, "Error al eliminar usuario", error);
  }
};
