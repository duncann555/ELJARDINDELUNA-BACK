export const controlarStock = (producto) => {
  if (producto.stock <= 0) {
    producto.estado = "Inactivo";
  } else if (!producto.estado) {
    producto.estado = "Activo";
  }
};
