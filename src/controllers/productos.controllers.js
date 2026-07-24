import Producto from "../models/producto.js";
import subirImagenCloudinary, {
  eliminarImagenCloudinary,
} from "../helpers/cloudinaryUploader.js";
import AppError from "../helpers/AppError.js";
import {
  findPublicProduct,
  isCompletePublicProductDTO,
  parseImagesInput,
  publicProductFilter,
  resolveUniqueSlug,
  toProductDTO,
} from "../services/productos.service.js";

export const assertProductImageCapacity = ({ hasFile, requestedImages }) => {
  if (hasFile && requestedImages.length >= 8) {
    throw new AppError(
      400,
      "TOO_MANY_PRODUCT_IMAGES",
      "Para subir una imagen nueva, quitá al menos una de las ocho URLs existentes.",
    );
  }
};

const buildProductPayload = async ({ body, file, currentProduct }) => {
  const requestedSlug =
    body.slug === undefined ? currentProduct?.slug : body.slug;
  const slug = await resolveUniqueSlug({
    requestedSlug,
    name: body.name,
    excludeId: currentProduct?._id,
  });
  const requestedImages =
    body.images === undefined
      ? currentProduct?.images || []
      : parseImagesInput(body.images);
  assertProductImageCapacity({
    hasFile: Boolean(file),
    requestedImages,
  });
  const uploadedImage = file ? await subirImagenCloudinary(file) : null;
  const images = uploadedImage?.secure_url
    ? [
        uploadedImage.secure_url,
        ...requestedImages.filter((image) => image !== uploadedImage.secure_url),
      ]
    : requestedImages;
  return {
    payload: {
      name: body.name,
      slug,
      botanicalName: body.botanicalName || "",
      category: body.category,
      description: body.description,
      presentation: body.presentation || "",
      ingredients: body.ingredients || "",
      warnings: body.warnings || "",
      price: Number(body.price),
      stock: Number(body.stock),
      images,
      active:
        typeof body.active === "boolean"
          ? body.active
          : currentProduct?.active ?? true,
    },
    uploadedImage,
  };
};

export const cleanupNewCloudinaryUpload = async (
  uploadedImage,
  destroyImage = eliminarImagenCloudinary,
) => {
  const publicId = String(uploadedImage?.public_id || "").trim();
  if (!publicId) return false;

  try {
    await destroyImage(publicId);
    return true;
  } catch (error) {
    console.error("[cloudinary_cleanup]", {
      name: String(error?.name || "Error"),
      code: String(error?.code || "CLOUDINARY_CLEANUP_FAILED"),
      message: String(error?.message || "Cleanup failed").slice(0, 200),
    });
    return false;
  }
};

export const buildProductConcurrencyFilter = (product) => ({
  _id: product._id,
  stock: product.stock,
  ...(product.updatedAt
    ? { updatedAt: product.updatedAt }
    : { updatedAt: { $exists: false } }),
});

export const listarProductos = async (_req, res) => {
  const products = await Producto.find(publicProductFilter).sort({
    createdAt: -1,
  });

  return res.json({
    data: {
      productos: products.map(toProductDTO).filter(isCompletePublicProductDTO),
    },
  });
};

export const obtenerProducto = async (req, res) => {
  const product = await findPublicProduct(req.params.identifier);
  return res.json({ data: { producto: toProductDTO(product) } });
};

export const listarProductosAdmin = async (_req, res) => {
  const products = await Producto.find().sort({ createdAt: -1 });
  return res.json({
    data: {
      productos: products.map(toProductDTO),
    },
  });
};

export const obtenerProductoAdmin = async (req, res) => {
  const product = await Producto.findById(req.params.id);
  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
  }
  return res.json({ data: { producto: toProductDTO(product) } });
};

export const crearProducto = async (req, res) => {
  const { payload, uploadedImage } = await buildProductPayload({
    body: req.body,
    file: req.file,
  });
  let product;
  try {
    product = await Producto.create(payload);
  } catch (error) {
    await cleanupNewCloudinaryUpload(uploadedImage);
    throw error;
  }

  return res.status(201).json({
    data: {
      producto: toProductDTO(product),
    },
  });
};

export const editarProducto = async (req, res) => {
  const product = await Producto.findById(req.params.id);
  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
  }

  const { payload, uploadedImage } = await buildProductPayload({
    body: req.body,
    file: req.file,
    currentProduct: product,
  });
  let updatedProduct;
  try {
    updatedProduct = await Producto.findOneAndUpdate(
      buildProductConcurrencyFilter(product),
      { $set: payload },
      { new: true, runValidators: true },
    );

    if (!updatedProduct) {
      const stillExists = await Producto.exists({ _id: req.params.id });
      if (!stillExists) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
      }
      throw new AppError(
        409,
        "PRODUCT_EDIT_CONFLICT",
        "El stock o el producto cambió durante la edición. Recargá e intentá nuevamente.",
      );
    }
  } catch (error) {
    await cleanupNewCloudinaryUpload(uploadedImage);
    throw error;
  }

  return res.json({ data: { producto: toProductDTO(updatedProduct) } });
};

export const cambiarActivoProducto = async (req, res) => {
  const product = await Producto.findById(req.params.id);
  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
  }

  product.active = req.body.active;
  await product.save();
  return res.json({ data: { producto: toProductDTO(product) } });
};
