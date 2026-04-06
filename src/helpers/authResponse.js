import generarJWT from "../middlewares/generarJWT.js";

export const serializarUsuarioAuth = (usuario) => ({
  uid: usuario._id,
  nombre: usuario.nombre,
  apellido: usuario.apellido,
  email: usuario.email,
  telefono: usuario.telefono,
  rol: usuario.rol,
  estado: usuario.estado,
  carrito: usuario.carrito || [],
});

export const responderAutenticacion = async (
  res,
  usuario,
  mensaje,
  status = 200,
) => {
  const token = await generarJWT(
    usuario._id,
    usuario.nombre,
    usuario.rol,
    usuario.email,
  );

  return res.status(status).json({
    mensaje,
    usuario: serializarUsuarioAuth(usuario),
    token,
  });
};
