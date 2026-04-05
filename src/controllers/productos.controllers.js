import Producto from "../models/producto.js";
import subirImagenCloudinary from "../helpers/cloudinaryUploader.js";
import { controlarStock } from "../helpers/controlarStock.js";
import { responderError } from "../helpers/safeError.js";
import { PRODUCTO_CAMPOS_EDITABLES } from "../constants/productos.js";

const IMAGEN_PLACEHOLDER = "https://placehold.co/600x400?text=Sin+Imagen";

const construirPayloadProducto = (body, imagenUrl) => ({
  nombre: body.nombre,
  categoria: body.categoria,
  descripcion: body.descripcion,
  precio: body.precio,
  stock: body.stock,
  estado: body.estado,
  oferta: body.oferta,
  destacado: body.destacado,
  imagenUrl,
});

const asignarCamposEditables = (producto, body) => {
  for (const campo of PRODUCTO_CAMPOS_EDITABLES) {
    if (body[campo] !== undefined) {
      producto[campo] = body[campo];
    }
  }
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const subirImagenProducto = async (file) => {
  if (!file) {
    return IMAGEN_PLACEHOLDER;
  }

  const resultado = await subirImagenCloudinary(file);
  return resultado.secure_url;
};

export const crearProducto = async (req, res) => {
  try {
    const imagenUrl = await subirImagenProducto(req.file);
    const nuevoProducto = new Producto(
      construirPayloadProducto(req.body, imagenUrl),
    );

    await nuevoProducto.save();

    return res.status(201).json({
      mensaje: "Producto creado exitosamente",
      producto: nuevoProducto,
    });
  } catch (error) {
    return responderError(res, 500, "Error al crear el producto", error);
  }
};

export const listarProductos = async (_req, res) => {
  try {
    const productos = await Producto.find().sort({ createdAt: -1 });
    return res.status(200).json(productos);
  } catch (error) {
    return responderError(res, 500, "Error al listar los productos", error);
  }
};

export const obtenerProductoID = async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);

    if (!producto) {
      return res.status(404).json({ mensaje: "Producto no encontrado" });
    }

    return res.status(200).json(producto);
  } catch (error) {
    return responderError(res, 500, "Error al obtener el producto", error);
  }
};

export const editarProducto = async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);

    if (!producto) {
      return res.status(404).json({ mensaje: "Producto no encontrado" });
    }

    asignarCamposEditables(producto, req.body);

    if (req.file) {
      producto.imagenUrl = await subirImagenProducto(req.file);
    }

    controlarStock(producto);
    await producto.save();

    return res.status(200).json({
      mensaje: "Producto actualizado correctamente",
      producto,
    });
  } catch (error) {
    return responderError(res, 500, "Error al editar el producto", error);
  }
};

export const eliminarProducto = async (req, res) => {
  try {
    const producto = await Producto.findByIdAndDelete(req.params.id);

    if (!producto) {
      return res.status(404).json({ mensaje: "Producto no encontrado" });
    }

    return res
      .status(200)
      .json({ mensaje: "Producto eliminado correctamente" });
  } catch (error) {
    return responderError(res, 500, "Error al eliminar el producto", error);
  }
};

export const filtrarProductoNombre = async (req, res) => {
  try {
    const nombre = String(req.query?.nombre || "").trim();

    if (nombre.length > 80) {
      return res.status(400).json({
        mensaje: "El nombre no puede superar los 80 caracteres",
      });
    }

    const productos = await Producto.find(
      nombre
        ? {
            nombre: {
              $regex: escapeRegex(nombre),
              $options: "i",
            },
          }
        : {},
    );

    return res.status(200).json(productos);
  } catch (error) {
    return responderError(res, 500, "Error al filtrar productos", error);
  }
};
