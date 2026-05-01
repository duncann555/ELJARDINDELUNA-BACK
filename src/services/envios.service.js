import Producto from "../models/producto.js";
import {
  DESCUENTO_TRANSFERENCIA,
  METODOS_PAGO_PEDIDO,
  METODO_PAGO_MERCADO_PAGO,
  METODO_PAGO_TRANSFERENCIA,
  PROVEEDOR_PAGO_MERCADO_PAGO,
  PROVEEDOR_PAGO_TRANSFERENCIA,
} from "../constants/pagos.js";

export const TIPO_ENVIO_ANDREANI_DOMICILIO = "andreani_domicilio";
export const TIPO_ENVIO_ANDREANI_SUCURSAL = "andreani_sucursal";
export const TIPO_ENVIO_CADETE_LOCAL = "cadete_local";

export const TIPOS_ENVIO_PEDIDO = [
  TIPO_ENVIO_ANDREANI_DOMICILIO,
  TIPO_ENVIO_ANDREANI_SUCURSAL,
  TIPO_ENVIO_CADETE_LOCAL,
];

export const COSTO_ENVIO_ANDREANI = Number(
  process.env.COSTO_ENVIO_ANDREANI || process.env.FIXED_SHIPPING_COST || 9500,
);

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

export const normalizarTipoEnvio = (value) => {
  const tipo = String(value || "").trim().toLowerCase();

  return TIPOS_ENVIO_PEDIDO.includes(tipo)
    ? tipo
    : TIPO_ENVIO_ANDREANI_DOMICILIO;
};

const obtenerCostoEnvio = (tipo) =>
  tipo === TIPO_ENVIO_CADETE_LOCAL ? 0 : COSTO_ENVIO_ANDREANI;

const obtenerProveedorEnvio = (tipo) => {
  switch (tipo) {
    case TIPO_ENVIO_ANDREANI_SUCURSAL:
      return "Andreani a sucursal";
    case TIPO_ENVIO_CADETE_LOCAL:
      return "Acordar con el vendedor";
    default:
      return "Andreani a domicilio";
  }
};

const obtenerOperadorEnvio = (tipo) =>
  tipo === TIPO_ENVIO_CADETE_LOCAL ? "cadete" : "andreani";

export const validarDatosEnvio = (envio) => {
  const tipo = normalizarTipoEnvio(envio?.tipo);
  const envioNormalizado = {
    tipo,
    provincia:
      tipo === TIPO_ENVIO_CADETE_LOCAL ? "" : normalizarTexto(envio?.provincia),
    ciudad:
      tipo === TIPO_ENVIO_CADETE_LOCAL ? "" : normalizarTexto(envio?.ciudad),
    domicilio:
      tipo === TIPO_ENVIO_CADETE_LOCAL ? "" : normalizarTexto(envio?.domicilio),
    celular: String(envio?.celular || "").replace(/\D/g, ""),
    entreCalles:
      tipo === TIPO_ENVIO_CADETE_LOCAL ? "" : normalizarTexto(envio?.entreCalles),
    referencia: normalizarTexto(envio?.referencia),
    codigoPostal:
      tipo === TIPO_ENVIO_CADETE_LOCAL ? "" : normalizarTexto(envio?.codigoPostal),
    sucursalAndreani:
      tipo === TIPO_ENVIO_CADETE_LOCAL
        ? ""
        : normalizarTexto(envio?.sucursalAndreani),
    horarioConveniente:
      tipo === TIPO_ENVIO_CADETE_LOCAL
        ? ""
        : normalizarTexto(envio?.horarioConveniente),
  };

  if (tipo !== TIPO_ENVIO_CADETE_LOCAL && !envioNormalizado.provincia) {
    throw new Error("La provincia es obligatoria");
  }

  if (tipo !== TIPO_ENVIO_CADETE_LOCAL && !envioNormalizado.ciudad) {
    throw new Error("La ciudad es obligatoria");
  }

  if (
    tipo === TIPO_ENVIO_ANDREANI_DOMICILIO &&
    !envioNormalizado.domicilio
  ) {
    throw new Error("El domicilio es obligatorio");
  }

  if (!envioNormalizado.celular) {
    throw new Error(
      tipo === TIPO_ENVIO_CADETE_LOCAL
        ? "El celular / WhatsApp es obligatorio para coordinar la entrega."
        : "El celular es obligatorio",
    );
  }

  if (!/^\d{8,15}$/.test(envioNormalizado.celular)) {
    throw new Error("El celular no es valido");
  }

  if (tipo !== TIPO_ENVIO_CADETE_LOCAL && !envioNormalizado.codigoPostal) {
    throw new Error("El codigo postal es obligatorio");
  }

  if (tipo === TIPO_ENVIO_ANDREANI_SUCURSAL && !envioNormalizado.sucursalAndreani) {
    throw new Error("La sucursal Andreani es obligatoria");
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
  const costo = obtenerCostoEnvio(envioNormalizado.tipo);

  return {
    productosFinal,
    subtotal,
    descuento,
    metodoPago: metodoPagoNormalizado,
    pago: {
      proveedor: obtenerProveedorPago(metodoPagoNormalizado),
    },
    envio: {
      tipo: envioNormalizado.tipo,
      operador: obtenerOperadorEnvio(envioNormalizado.tipo),
      proveedor: obtenerProveedorEnvio(envioNormalizado.tipo),
      costo,
      esGratis: false,
      estadoEnvio: "pendiente",
      destino: envioNormalizado,
    },
    total: Number((subtotal - descuento + costo).toFixed(2)),
  };
};
