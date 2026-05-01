import Producto from "../models/producto.js";
import {
  DESCUENTO_TRANSFERENCIA,
  METODOS_PAGO_PEDIDO,
  METODO_PAGO_MERCADO_PAGO,
  METODO_PAGO_TRANSFERENCIA,
  PROVEEDOR_PAGO_MERCADO_PAGO,
  PROVEEDOR_PAGO_TRANSFERENCIA,
} from "../constants/pagos.js";

const FIXED_SHIPPING_COST = Number(process.env.FIXED_SHIPPING_COST || 8500);

const normalizarTexto = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizarNumero = (value, fallback = 0) => {
  const numero = Number(value);
  return Number.isFinite(numero) ? numero : fallback;
};

export const normalizarMetodoPago = (value) => {
  const metodo = String(value || "").trim().toLowerCase();

  if (METODOS_PAGO_PEDIDO.includes(metodo)) {
    return metodo;
  }

  return METODO_PAGO_MERCADO_PAGO;
};

const obtenerProveedorPago = (metodoPago) =>
  metodoPago === METODO_PAGO_TRANSFERENCIA
    ? PROVEEDOR_PAGO_TRANSFERENCIA
    : PROVEEDOR_PAGO_MERCADO_PAGO;

export const validarDatosEnvio = (envio) => {
  const envioNormalizado = {
    provincia: normalizarTexto(envio?.provincia),
    ciudad: normalizarTexto(envio?.ciudad),
    domicilio: normalizarTexto(envio?.domicilio),
    celular: String(envio?.celular || "").replace(/\D/g, ""),
    entreCalles: normalizarTexto(envio?.entreCalles),
    referencia: normalizarTexto(envio?.referencia),
    codigoPostal: normalizarTexto(envio?.codigoPostal),
  };

  if (!envioNormalizado.provincia) {
    throw new Error("La provincia es obligatoria");
  }

  if (!envioNormalizado.ciudad) {
    throw new Error("La ciudad es obligatoria");
  }

  if (!envioNormalizado.domicilio) {
    throw new Error("El domicilio es obligatorio");
  }

  if (!envioNormalizado.celular) {
    throw new Error("El celular es obligatorio");
  }

  if (!/^\d{8,15}$/.test(envioNormalizado.celular)) {
    throw new Error("El celular no es valido");
  }

  if (!envioNormalizado.codigoPostal) {
    throw new Error("El codigo postal es obligatorio");
  }

  return envioNormalizado;
};

export const resolverProductosPedido = async (productosSolicitados) => {
  if (!Array.isArray(productosSolicitados) || productosSolicitados.length === 0) {
    throw new Error("El pedido debe contener al menos un producto");
  }

  const productosFinal = [];
  let subtotal = 0;

  for (const item of productosSolicitados) {
    const productoId = item?.producto || item?.id;
    const cantidad = Number(item?.cantidad);

    if (!productoId) {
      throw new Error("El ID del producto es obligatorio");
    }

    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new Error("La cantidad debe ser un entero mayor a 0");
    }

    const productoBD = await Producto.findById(productoId);

    if (!productoBD) {
      throw new Error("Producto no existe");
    }

    if (productoBD.estado !== "Activo") {
      throw new Error(`El producto ${productoBD.nombre} no esta disponible`);
    }

    if (productoBD.stock < cantidad) {
      throw new Error(`Stock insuficiente para ${productoBD.nombre}`);
    }

    const precio = normalizarNumero(productoBD.precio);
    subtotal += precio * cantidad;

    productosFinal.push({
      producto: productoBD._id,
      nombre: productoBD.nombre,
      precio,
      cantidad,
    });
  }

  return {
    productosFinal,
    subtotal: Number(subtotal.toFixed(2)),
  };
};

export const construirResumenPedido = async ({ productos, envio, metodoPago }) => {
  const { productosFinal, subtotal } = await resolverProductosPedido(productos);
  const envioNormalizado = validarDatosEnvio(envio);
  const metodoPagoNormalizado = normalizarMetodoPago(metodoPago);
  const descuento =
    metodoPagoNormalizado === METODO_PAGO_TRANSFERENCIA
      ? Number((subtotal * DESCUENTO_TRANSFERENCIA).toFixed(2))
      : 0;
  const costo = FIXED_SHIPPING_COST;

  return {
    productosFinal,
    subtotal,
    descuento,
    metodoPago: metodoPagoNormalizado,
    pago: {
      proveedor: obtenerProveedorPago(metodoPagoNormalizado),
    },
    envio: {
      proveedor: "Envio nacional",
      costo,
      esGratis: false,
      destino: envioNormalizado,
    },
    total: Number((subtotal - descuento + costo).toFixed(2)),
  };
};
