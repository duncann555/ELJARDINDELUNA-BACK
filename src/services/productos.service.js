import mongoose from "mongoose";
import Producto from "../models/producto.js";
import {
  normalizeProductImages,
  slugifyProductName,
} from "../constants/productos.js";
import AppError from "../helpers/AppError.js";

export const publicProductFilter = {
  $or: [
    { active: true },
    { active: { $exists: false }, estado: "Activo" },
  ],
};

export const toProductDTO = (product) => {
  const source =
    typeof product?.toObject === "function" ? product.toObject() : product || {};
  const name = source.name || source.nombre || "";
  const price = Number(source.price ?? source.precio);
  const stock = Number(source.stock);

  return {
    id: String(source._id || source.id || ""),
    name,
    slug: source.slug || slugifyProductName(name),
    botanicalName: source.botanicalName || "",
    category: source.category || source.categoria || "",
    description: source.description || source.descripcion || "",
    presentation: source.presentation || "",
    ingredients: source.ingredients || "",
    warnings: source.warnings || "",
    price: Number.isFinite(price) ? price : null,
    stock: Number.isInteger(stock) && stock >= 0 ? stock : null,
    images: normalizeProductImages(source.images, source.imagenUrl),
    active:
      typeof source.active === "boolean"
        ? source.active
        : source.active === undefined && source.estado === "Activo",
  };
};

export const isCompletePublicProductDTO = (product) =>
  Boolean(
    product.id &&
      product.name &&
      product.slug &&
      product.category &&
      product.description &&
      Number.isFinite(product.price) &&
      product.price >= 0 &&
      Number.isInteger(product.stock) &&
      product.stock >= 0 &&
      product.images.every((image) => {
        try {
          return (
            String(image).length <= 2048 &&
            ["http:", "https:"].includes(new URL(image).protocol)
          );
        } catch {
          return false;
        }
      }),
  );

export const parseImagesInput = (value) => {
  if (Array.isArray(value)) return normalizeProductImages(value);
  if (!value) return [];

  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      return normalizeProductImages(JSON.parse(value));
    } catch {
      throw new AppError(
        400,
        "INVALID_IMAGES",
        "El formato de las imágenes no es válido.",
      );
    }
  }

  return normalizeProductImages(value);
};

export const resolveUniqueSlug = async ({
  requestedSlug,
  name,
  excludeId,
}) => {
  const baseSlug = slugifyProductName(requestedSlug || name);

  if (!baseSlug) {
    throw new AppError(
      400,
      "INVALID_SLUG",
      "No se pudo generar un slug válido.",
    );
  }

  const exclusion = excludeId ? { _id: { $ne: excludeId } } : {};
  const legacyProducts = await Producto.find({
    ...exclusion,
    $or: [
      { slug: { $exists: false } },
      { slug: "" },
      { slug: null },
    ],
  })
    .select("name nombre")
    .lean();
  const legacySlugs = new Set(
    legacyProducts.map((product) =>
      slugifyProductName(product.name || product.nombre),
    ),
  );
  const slugExists = async (candidate) =>
    legacySlugs.has(candidate) ||
    Boolean(
      await Producto.exists({
        slug: candidate,
        ...exclusion,
      }),
    );

  if (!(await slugExists(baseSlug))) return baseSlug;

  if (requestedSlug) {
    throw new AppError(
      409,
      "SLUG_ALREADY_EXISTS",
      "Ya existe un producto con ese slug.",
    );
  }

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${baseSlug.slice(0, 115)}-${suffix}`;
    if (!(await slugExists(candidate))) return candidate;
  }

  throw new AppError(
    409,
    "SLUG_ALREADY_EXISTS",
    "No se pudo generar un slug único.",
  );
};

export const findPublicProduct = async (identifier) => {
  const normalized = String(identifier || "").trim().toLowerCase();
  let product = await Producto.findOne({
    $and: [{ slug: normalized }, publicProductFilter],
  });

  if (!product && mongoose.isValidObjectId(normalized)) {
    product = await Producto.findOne({
      $and: [{ _id: normalized }, publicProductFilter],
    });
  }

  if (!product) {
    const legacyProducts = await Producto.find({
      $and: [
        {
          $or: [
            { slug: { $exists: false } },
            { slug: "" },
            { slug: null },
          ],
        },
        publicProductFilter,
      ],
    });
    product = legacyProducts.find(
      (candidate) =>
        slugifyProductName(candidate.name || candidate.nombre) === normalized,
    );
  }

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado.");
  }

  if (!isCompletePublicProductDTO(toProductDTO(product))) {
    throw new AppError(
      409,
      "PRODUCT_DATA_INVALID",
      "El producto no está disponible temporalmente.",
    );
  }

  return product;
};
