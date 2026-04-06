import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
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
import { verifyFirebaseIdToken } from "../services/firebaseAdmin.service.js";

const SALT_ROUNDS = 10;
const SOCIAL_PROVIDER_MAP = {
  google: "google.com",
};
const SOCIAL_PHONE_REQUIRED_MESSAGE =
  "Necesitamos tu numero de WhatsApp para completar el acceso.";
const SOCIAL_EMAIL_REQUIRED_MESSAGE =
  "La cuenta social debe compartir un email para continuar.";
const SOCIAL_VERIFIED_EMAIL_REQUIRED_MESSAGE =
  "La cuenta social debe tener un email verificado para continuar.";
const SOCIAL_INVALID_AUTH_MESSAGE =
  "La autenticacion social no es valida o ya vencio.";
const SOCIAL_VALIDATION_ERROR_MESSAGE =
  "No se pudieron validar los datos de tu cuenta social.";
const SOCIAL_DUPLICATE_ACCOUNT_MESSAGE =
  "Ya existe otra cuenta con esos datos de acceso social. Intenta cerrar sesion y volver a entrar con Google.";
const SOCIAL_UNAVAILABLE_MESSAGE =
  "La autenticacion social no esta disponible en este momento.";
const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Si el email existe, te enviaremos un enlace para restablecer tu contrasena.";
const USER_NAME_MIN_LENGTH = 2;
const USER_NAME_MAX_LENGTH = 50;

const normalizarTexto = (valor) =>
  typeof valor === "string" ? valor.trim() : "";

const normalizarEmail = (valor) => normalizarTexto(valor).toLowerCase();
const normalizarEstadoUsuario = (valor) =>
  valor === "Activo" ? "Activo" : "Suspendido";

const generarHashPassword = (password) =>
  bcrypt.hashSync(password, bcrypt.genSaltSync(SALT_ROUNDS));
const generarPasswordAleatoria = () => randomBytes(32).toString("hex");

const usuarioEstaActivo = (usuario) => usuario?.estado === "Activo";
const normalizarTelefono = (valor) => normalizarTexto(valor).replace(/\D/g, "");
const normalizarFirebaseProvider = (valor) => normalizarTexto(valor);

const obtenerProveedorFirebase = (decodedToken) =>
  normalizarFirebaseProvider(decodedToken?.firebase?.sign_in_provider);

const normalizarNombrePerfil = (valor) =>
  normalizarTexto(valor).replace(/\s+/g, " ");

const resolverCampoPerfilSocial = (
  primaryValue,
  fallbackValue,
  defaultValue,
) => {
  const candidates = [primaryValue, fallbackValue, defaultValue]
    .map(normalizarNombrePerfil)
    .filter(Boolean);

  const resolvedValue =
    candidates.find((candidate) => candidate.length >= USER_NAME_MIN_LENGTH) ||
    defaultValue;

  return resolvedValue.slice(0, USER_NAME_MAX_LENGTH);
};

const obtenerPerfilBasicoSocial = ({ email, name }) => {
  const emailSource = normalizarEmail(email).split("@")[0].replace(/[._-]+/g, " ").trim();
  const fallbackSource = normalizarTexto(name) || emailSource;
  const normalizedSource = fallbackSource.replace(/[._-]+/g, " ").trim();
  const parts = normalizedSource.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");

  return {
    nombre: resolverCampoPerfilSocial(firstName, normalizedSource, "Usuario"),
    apellido: resolverCampoPerfilSocial(lastName, "", "Social"),
  };
};

const responderTelefonoRequerido = (res, perfil) =>
  res.status(428).json({
    mensaje: SOCIAL_PHONE_REQUIRED_MESSAGE,
    requiereTelefono: true,
    perfil,
  });

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

const obtenerIdNormalizado = (usuario) =>
  usuario?._id ? String(usuario._id).trim() : "";
const sonElMismoUsuario = (usuarioA, usuarioB) =>
  Boolean(obtenerIdNormalizado(usuarioA)) &&
  obtenerIdNormalizado(usuarioA) === obtenerIdNormalizado(usuarioB);

const sincronizarCuentaSocialExistente = (
  usuario,
  { firebaseUid, firebaseProvider, perfil, telefono, email },
) => {
  // Si Firebase confirma el email verificado, usamos esa identidad como la
  // referencia vigente para evitar bloqueos por UIDs viejos o cuentas vinculadas.
  usuario.firebaseUid = firebaseUid;
  usuario.firebaseProvider = firebaseProvider;

  if (email && normalizarEmail(usuario.email) !== email) {
    usuario.email = email;
  }

  if (!normalizarTexto(usuario.nombre)) {
    usuario.nombre = perfil.nombre;
  }

  if (!normalizarTexto(usuario.apellido)) {
    usuario.apellido = perfil.apellido;
  }

  if (!normalizarTelefono(usuario.telefono) && telefono) {
    usuario.telefono = telefono;
  }
};

const desvincularCuentaSocial = (usuario) => {
  usuario.firebaseUid = null;
  usuario.firebaseProvider = null;
};

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

export const iniciarSesion = async (req, res) => {
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

export const iniciarSesionSocial = async (req, res) => {
  try {
    const requestedProvider = normalizarFirebaseProvider(req.body.provider);
    const expectedFirebaseProvider = SOCIAL_PROVIDER_MAP[requestedProvider];

    if (!expectedFirebaseProvider) {
      return res.status(400).json({
        mensaje: "El proveedor social solicitado no es valido",
      });
    }

    const decodedToken = await verifyFirebaseIdToken(req.body.idToken);
    const firebaseProvider = obtenerProveedorFirebase(decodedToken);

    if (firebaseProvider !== expectedFirebaseProvider) {
      return res.status(400).json({
        mensaje: "El proveedor autenticado no coincide con el solicitado",
      });
    }

    const email = normalizarEmail(decodedToken.email);

    if (!email) {
      return res.status(400).json({
        mensaje: SOCIAL_EMAIL_REQUIRED_MESSAGE,
      });
    }

    if (decodedToken.email_verified !== true) {
      return res.status(400).json({
        mensaje: SOCIAL_VERIFIED_EMAIL_REQUIRED_MESSAGE,
      });
    }

    const firebaseUid = normalizarTexto(decodedToken.uid);
    const telefono = normalizarTelefono(req.body.telefono);
    const perfil = {
      email,
      ...obtenerPerfilBasicoSocial({
        email,
        name: decodedToken.name,
      }),
    };

    const [usuarioPorFirebaseUid, usuarioPorEmail] = await Promise.all([
      Usuario.findOne({ firebaseUid }),
      Usuario.findOne({ email }),
    ]);

    let usuario = usuarioPorFirebaseUid || usuarioPorEmail || null;

    if (
      usuarioPorFirebaseUid &&
      usuarioPorEmail &&
      !sonElMismoUsuario(usuarioPorFirebaseUid, usuarioPorEmail)
    ) {
      desvincularCuentaSocial(usuarioPorFirebaseUid);
      await usuarioPorFirebaseUid.save();
      usuario = usuarioPorEmail;
    }

    if (usuario && !usuarioEstaActivo(usuario)) {
      return responderCuentaInactiva(res);
    }

    if (!telefono && !normalizarTelefono(usuario?.telefono)) {
      return responderTelefonoRequerido(res, perfil);
    }

    if (!usuario) {
      usuario = new Usuario(
        crearPayloadUsuario({
          ...perfil,
          telefono,
          password: generarHashPassword(generarPasswordAleatoria()),
          extras: {
            firebaseUid,
            firebaseProvider,
          },
        }),
      );
    } else {
      sincronizarCuentaSocialExistente(usuario, {
        firebaseUid,
        firebaseProvider,
        perfil,
        telefono,
        email,
      });
    }

    await usuario.save();

    return responderAutenticacion(
      res,
      usuario,
      "Autenticacion social completada",
    );
  } catch (error) {
    const firebaseErrorCode = String(error?.code || "");
    const isFirebaseAuthError = firebaseErrorCode.startsWith("auth/");
    const isValidationError = error?.name === "ValidationError";
    const isDuplicateKeyError =
      error?.name === "MongoServerError" && Number(error?.code) === 11000;
    const validationMessages = Object.values(error?.errors || {})
      .map((validationError) => validationError?.message)
      .filter(Boolean);
    const status = Number(
      error?.statusCode ||
        (isFirebaseAuthError
          ? 401
          : isValidationError
          ? 400
          : isDuplicateKeyError
          ? 409
          : 500),
    );
    const mensaje =
      isFirebaseAuthError
        ? SOCIAL_INVALID_AUTH_MESSAGE
        : isValidationError
        ? validationMessages[0] || SOCIAL_VALIDATION_ERROR_MESSAGE
        : isDuplicateKeyError
        ? SOCIAL_DUPLICATE_ACCOUNT_MESSAGE
        : status === 500
        ? SOCIAL_UNAVAILABLE_MESSAGE
        : "No se pudo completar el acceso social.";

    return responderError(res, status, mensaje, isValidationError ? null : error);
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
