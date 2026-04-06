import mongoose from "mongoose";
import Pedido from "../models/pedido.js";
import {
  ESTADO_PEDIDO_EN_ESPERA_PAGO,
  pedidoDebeMantenerStockDescontado,
  puedeUsarEstadoPedidoConPago,
} from "../constants/pedidos.js";
import { construirResumenPedido } from "../services/envios.service.js";
import { sincronizarInventarioPedido } from "../services/pedidoInventory.service.js";
import { responderError } from "../helpers/safeError.js";

export const crearPedido = async (req, res) => {
  try {
    const { productos, envio } = req.body;
    const usuarioId = req.usuarioId;

    if (!usuarioId) {
      return res.status(401).json({ mensaje: "Usuario no identificado" });
    }

    const resumen = await construirResumenPedido({ productos, envio });

    const pedido = new Pedido({
      usuario: usuarioId,
      productos: resumen.productosFinal,
      subtotal: resumen.subtotal,
      total: resumen.total,
      envio: {
        ...resumen.envio.destino,
        proveedor: resumen.envio.proveedor,
        costo: resumen.envio.costo,
        esGratis: resumen.envio.esGratis,
      },
      pago: { estado: "pending" },
      estadoPedido: ESTADO_PEDIDO_EN_ESPERA_PAGO,
    });

    await pedido.save();

    res.status(201).json({
      mensaje: "Pedido creado correctamente",
      pedidoId: pedido._id,
      subtotal: pedido.subtotal,
      total: pedido.total,
      envio: {
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
      },
    });
  } catch (error) {
    return responderError(res, 400, "Error al crear el pedido", error);
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
    const { estadoPedido } = req.body;
    const pedido = await Pedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    if (
      !puedeUsarEstadoPedidoConPago({
        estadoPedido,
        estadoPago: pedido.pago?.estado,
      })
    ) {
      return res.status(400).json({
        mensaje:
          "No puedes pasar el pedido a gestion o entrega sin un pago aprobado",
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

      await sincronizarInventarioPedido({
        pedido: pedidoEnTransaccion,
        session,
        debeDescontar: pedidoDebeMantenerStockDescontado({
          estadoPedido,
          estadoPago: pedidoEnTransaccion.pago?.estado,
        }),
      });

      pedidoEnTransaccion.estadoPedido = estadoPedido;
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
