import Pedido from "../models/pedido.js";
import { construirResumenPedido } from "../services/envios.service.js";
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
        cotizacionFuente: resumen.envio.metodo,
      },
      pago: { estado: "pending" },
      estadoPedido: "En espera de pago",
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

export const obtenerPedidoID = async (req, res) => {
  try {
    const pedido = await Pedido.findById(req.params.id).populate(
      "usuario",
      "nombre apellido email",
    );

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    res.status(200).json(pedido);
  } catch (error) {
    return responderError(res, 500, "Error al obtener pedido", error);
  }
};

export const actualizarEstadoPedido = async (req, res) => {
  try {
    const { estadoPedido } = req.body;
    const pedido = await Pedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    pedido.estadoPedido = estadoPedido;
    await pedido.save();

    res.status(200).json({
      mensaje: "Pedido actualizado correctamente",
      pedido,
    });
  } catch (error) {
    return responderError(res, 500, "Error al actualizar pedido", error);
  }
};

export const eliminarPedido = async (req, res) => {
  try {
    const pedido = await Pedido.findByIdAndDelete(req.params.id);

    if (!pedido) {
      return res.status(404).json({ mensaje: "Pedido no encontrado" });
    }

    res.status(200).json({ mensaje: "Pedido eliminado correctamente" });
  } catch (error) {
    return responderError(res, 500, "Error al eliminar pedido", error);
  }
};

export const listarPedidosUsuario = async (req, res) => {
  try {
    const pedidos = await Pedido.find({ usuario: req.usuarioId }).sort({
      createdAt: -1,
    });

    res.status(200).json(pedidos);
  } catch (error) {
    return responderError(
      res,
      500,
      "Error al obtener historial de pedidos",
      error,
    );
  }
};
