import Producto from "../models/producto.js";
import { controlarStock } from "../helpers/controlarStock.js";

const normalizarCantidad = (value) => Math.max(0, Number(value || 0));

const buildInventoryError = (mensaje) => {
  const error = new Error(mensaje);
  error.status = 409;
  error.publicMessage = mensaje;
  return error;
};

const guardarProductoConEstado = async (producto, session) => {
  controlarStock(producto);
  await producto.save({
    session,
    validateBeforeSave: false,
  });
};

const descontarStockProducto = async ({ item, session }) => {
  const cantidad = normalizarCantidad(item?.cantidad);

  const productoActualizado = await Producto.findOneAndUpdate(
    {
      _id: item?.producto,
      stock: { $gte: cantidad },
    },
    {
      $inc: { stock: -cantidad },
    },
    {
      new: true,
      session,
    },
  );

  if (!productoActualizado) {
    throw buildInventoryError(
      `Stock insuficiente para ${item?.nombre || "el producto"}`,
    );
  }

  await guardarProductoConEstado(productoActualizado, session);
};

const restaurarStockProducto = async ({ item, session }) => {
  const cantidad = normalizarCantidad(item?.cantidad);

  const productoActualizado = await Producto.findByIdAndUpdate(
    item?.producto,
    {
      $inc: { stock: cantidad },
    },
    {
      new: true,
      session,
    },
  );

  if (!productoActualizado) {
    return;
  }

  await guardarProductoConEstado(productoActualizado, session);
};

export const sincronizarInventarioPedido = async ({
  pedido,
  session,
  debeDescontar,
}) => {
  const stockYaDescontado = pedido?.inventario?.descontado === true;

  if (debeDescontar === stockYaDescontado) {
    return false;
  }

  for (const item of pedido.productos || []) {
    if (debeDescontar) {
      await descontarStockProducto({ item, session });
      continue;
    }

    await restaurarStockProducto({ item, session });
  }

  pedido.inventario = {
    descontado: debeDescontar,
    fechaActualizacion: new Date(),
  };

  return true;
};

export default sincronizarInventarioPedido;
