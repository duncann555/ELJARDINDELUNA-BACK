export const controlarStock = (producto) => {
  if (!producto.estado) {
    producto.estado = "Activo";
  }
};
