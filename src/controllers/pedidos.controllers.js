import mongoose from "mongoose";
import Pedido from "../models/pedido.js";
import Usuario from "../models/usuario.js";
import {
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_EN_ESPERA_PAGO,
  ESTADO_PEDIDO_PREPARANDO_ENVIO,
  pedidoDebeMantenerStockDescontado,
  puedeUsarEstadoPedidoConPago,
} from "../constants/pedidos.js";
import {
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_RECHAZADO,
  METODO_PAGO_TRANSFERENCIA,
} from "../constants/pagos.js";
import subirImagenCloudinary from "../helpers/cloudinaryUploader.js";
import { responderError } from "../helpers/safeError.js";
import { construirResumenPedido } from "../services/envios.service.js";
import { sincronizarInventarioPedido } from "../services/pedidoInventory.service.js";

const usuarioPuedeGestionarPedido = (pedido, req) =>
  pedido.usuario.toString() === req.usuarioId || req.rol === "Administrador";

const construirRespuestaPedido = (pedido) => ({
  mensaje: "Pedido creado correctamente",
  pedidoId: pedido._id,
  subtotal: pedido.subtotal,
  descuento: Number(pedido.descuento || 0),
  total: pedido.total,
  metodoPago: pedido.metodoPago,
  estadoPago: pedido.estadoPago || pedido.pago?.estado || ESTADO_PAGO_PENDIENTE,
  datosCliente: pedido.datosCliente || null,
  datosEnvio: pedido.datosEnvio || null,
  comprobanteTransferencia: pedido.comprobanteTransferencia || null,
  envio: {
    tipo: pedido.envio.tipo,
    operador: pedido.envio.operador,
    estadoEnvio: pedido.envio.estadoEnvio,
    proveedor: pedido.envio.proveedor,
    costo: pedido.envio.costo,
    esGratis: pedido.envio.esGratis,
    provincia: pedido.envio.provincia,
    ciudad: pedido.envio.ciudad,
    domicilio: pedido.envio.domicilio,
    celular: pedido.envio.celular,
    entreCalles: pedido.envio.entreCalles,
    referencia: pedido.envio.referencia,
    codigoPostal: pedido.envio.codigoPostal,
    sucursalAndreani: pedido.envio.sucursalAndreani,
    horarioConveniente: pedido.envio.horarioConveniente,
  },
});

const aplicarEstadoPagoTransferencia = ({
  pedido,
  estadoPagoSolicitado,
  estadoPedidoSolicitado,
}) => {
  const estadoPagoFinal =
    estadoPagoSolicitado ||
    pedido.estadoPago ||
    pedido.pago?.estado ||
    ESTADO_PAGO_PENDIENTE;

  let estadoPedidoFinal = estadoPedidoSolicitado || pedido.estadoPedido;

  if (!estadoPagoSolicitado) {
    return { estadoPagoFinal, estadoPedidoFinal };
  }

  pedido.estadoPago = estadoPagoFinal;
  pedido.pago.estado = estadoPagoFinal;

  if (estadoPagoFinal === ESTADO_PAGO_APROBADO) {
    pedido.pago.fechaPago = new Date();
    pedido.pago.statusDetalle = "confirmado_manualmente";

    if (
      (!estadoPedidoSolicitado ||
        estadoPedidoSolicitado === ESTADO_PEDIDO_EN_ESPERA_PAGO) &&
      pedido.estadoPedido === ESTADO_PEDIDO_EN_ESPERA_PAGO
    ) {
      estadoPedidoFinal = ESTADO_PEDIDO_PREPARANDO_ENVIO;
    }
  } else if (estadoPagoFinal === ESTADO_PAGO_RECHAZADO) {
    pedido.pago.fechaPago = undefined;
    pedido.pago.statusDetalle = "rechazado_manualmente";

    if (
      (!estadoPedidoSolicitado ||
        estadoPedidoSolicitado === ESTADO_PEDIDO_EN_ESPERA_PAGO) &&
      pedido.estadoPedido === ESTADO_PEDIDO_EN_ESPERA_PAGO
    ) {
      estadoPedidoFinal = ESTADO_PEDIDO_CANCELADO;
    }
  } else {
    pedido.pago.fechaPago = undefined;
    pedido.pago.statusDetalle = "pendiente_transferencia";
  }

  return { estadoPagoFinal, estadoPedidoFinal };
};

export const crearPedido = async (req, res) => {
  try {
    const { productos, envio, metodoPago, guardarDatosEnvio } = req.body;
    const usuarioId = req.usuarioId;

    if (!usuarioId) {
      return res.status(401).json({ mensaje: "Usuario no identificado" });
    }

    const usuario = await Usuario.findById(usuarioId).select("-password");

    if (!usuario) {
      return res.status(401).json({ mensaje: "Usuario no identificado" });
    }

    const resumen = await construirResumenPedido({ productos, envio, metodoPago });
    const datosCliente = {
      nombre: `${usuario.nombre || ""} ${usuario.apellido || ""}`.trim(),
      email: usuario.email,
    };

    const pedido = new Pedido({
      usuario: usuarioId,
      datosCliente,
      datosEnvio: resumen.envio.destino,
      productos: resumen.productosFinal,
      subtotal: resumen.subtotal,
      descuento: resumen.descuento,
      total: resumen.total,
      metodoPago: resumen.metodoPago,
      estadoPago: ESTADO_PAGO_PENDIENTE,
      envio: {
        ...resumen.envio.destino,
        tipo: resumen.envio.tipo,
        operador: resumen.envio.operador,
        proveedor: resumen.envio.proveedor,
        costo: resumen.envio.costo,
        esGratis: resumen.envio.esGratis,
        estadoEnvio: resumen.envio.estadoEnvio,
      },
      pago: {
        proveedor: resumen.pago.proveedor,
        estado: ESTADO_PAGO_PENDIENTE,
        statusDetalle:
          resumen.metodoPago === METODO_PAGO_TRANSFERENCIA
            ? "pendiente_transferencia"
            : "",
      },
      estadoPedido: ESTADO_PEDIDO_EN_ESPERA_PAGO,
    });

    await pedido.save();

    if (guardarDatosEnvio === true) {
      usuario.datosEnvioPreferidos = resumen.envio.destino;
      await usuario.save({ validateBeforeSave: false });
    }

    res.status(201).json(construirRespuestaPedido(pedido));
  } catch (error) {
    return responderError(res, 400, "Error al crear el pedido", error);
  }
};

export const subirComprobanteTransferencia = async (req, res) => {
  try {
    const pedido = await Pedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    if (!usuarioPuedeGestionarPedido(pedido, req)) {
      return res.status(403).json({
        mensaje: "No tienes permisos para este pedido",
      });
    }

    if (pedido.metodoPago !== METODO_PAGO_TRANSFERENCIA) {
      return res.status(400).json({
        mensaje: "Solo los pedidos por transferencia aceptan comprobantes",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        mensaje: "Debes adjuntar una imagen del comprobante",
      });
    }

    const resultado = await subirImagenCloudinary(req.file, {
      folder: "el_jardin_de_luna_comprobantes_transferencia",
    });

    pedido.comprobanteTransferencia = {
      url: resultado?.secure_url || "",
      publicId: resultado?.public_id || "",
      originalName: req.file.originalname,
      uploadedAt: new Date(),
    };

    if (pedido.estadoPago === ESTADO_PAGO_PENDIENTE) {
      pedido.pago.statusDetalle = "comprobante_cargado";
    }

    await pedido.save();

    return res.status(200).json({
      mensaje: "Comprobante cargado correctamente",
      comprobanteTransferencia: pedido.comprobanteTransferencia,
      pedido,
    });
  } catch (error) {
    return responderError(
      res,
      500,
      "Error al cargar el comprobante de transferencia",
      error,
    );
  }
};

export const listarPedidos = async (req, res) => {
  try {
    const filtro = req.rol === "Administrador" ? {} : { usuario: req.usuarioId };

    const pedidos = await Pedido.find(filtro)
      .populate("usuario", "nombre apellido email")
      .sort({ createdAt: -1 });

    res.status(200).json(pedidos);
  } catch (error) {
    return responderError(res, 500, "Error al listar pedidos", error);
  }
};

export const actualizarEstadoPedido = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { estadoPedido, estadoPago } = req.body;
    const pedido = await Pedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    if (estadoPago && pedido.metodoPago !== METODO_PAGO_TRANSFERENCIA) {
      return res.status(400).json({
        mensaje:
          "El estado de pago manual solo se puede cambiar en pedidos por transferencia",
      });
    }

    let pedidoActualizado = null;

    await session.withTransaction(async () => {
      const pedidoEnTransaccion = await Pedido.findById(req.params.id).session(
        session,
      );

      if (!pedidoEnTransaccion) {
        throw new Error("Pedido no encontrado");
      }

      const { estadoPagoFinal, estadoPedidoFinal } =
        pedidoEnTransaccion.metodoPago === METODO_PAGO_TRANSFERENCIA
          ? aplicarEstadoPagoTransferencia({
              pedido: pedidoEnTransaccion,
              estadoPagoSolicitado: estadoPago,
              estadoPedidoSolicitado: estadoPedido,
            })
          : {
              estadoPagoFinal:
                pedidoEnTransaccion.estadoPago ||
                pedidoEnTransaccion.pago?.estado ||
                ESTADO_PAGO_PENDIENTE,
              estadoPedidoFinal: estadoPedido,
            };

      if (
        !puedeUsarEstadoPedidoConPago({
          estadoPedido: estadoPedidoFinal,
          estadoPago: estadoPagoFinal,
        })
      ) {
        const error = new Error(
          "No puedes pasar el pedido a gestion o entrega sin un pago aprobado",
        );
        error.status = 400;
        error.publicMessage = error.message;
        throw error;
      }

      pedidoEnTransaccion.estadoPago = estadoPagoFinal;
      pedidoEnTransaccion.pago.estado = estadoPagoFinal;
      pedidoEnTransaccion.estadoPedido = estadoPedidoFinal;

      await sincronizarInventarioPedido({
        pedido: pedidoEnTransaccion,
        session,
        debeDescontar: pedidoDebeMantenerStockDescontado({
          estadoPedido: estadoPedidoFinal,
          estadoPago: estadoPagoFinal,
        }),
      });

      await pedidoEnTransaccion.save({ session });
      pedidoActualizado = pedidoEnTransaccion;
    });

    res.status(200).json({
      mensaje: "Pedido actualizado correctamente",
      pedido: pedidoActualizado,
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        mensaje: error.publicMessage || error.message,
      });
    }

    return responderError(res, 500, "Error al actualizar pedido", error);
  } finally {
    await session.endSession();
  }
};

export const eliminarPedido = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const pedido = await Pedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    await session.withTransaction(async () => {
      const pedidoEnTransaccion = await Pedido.findById(req.params.id).session(
        session,
      );

      if (!pedidoEnTransaccion) {
        throw new Error("Pedido no encontrado");
      }

      await sincronizarInventarioPedido({
        pedido: pedidoEnTransaccion,
        session,
        debeDescontar: false,
      });

      await pedidoEnTransaccion.deleteOne({ session });
    });

    res.status(200).json({
      mensaje: "Pedido eliminado correctamente",
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        mensaje: error.publicMessage || error.message,
      });
    }

    return responderError(res, 500, "Error al eliminar pedido", error);
  } finally {
    await session.endSession();
  }
};
