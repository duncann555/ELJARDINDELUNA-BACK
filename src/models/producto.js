import mongoose, { Schema } from "mongoose";
import {
  normalizeProductImages,
  slugifyProductName,
} from "../constants/productos.js";

const copyLegacyToCanonical = (product) => {
  product.name ||= product.nombre;
  product.category ||= product.categoria;
  product.description ||= product.descripcion;

  if (product.price === undefined || product.price === null) {
    product.price = product.precio;
  }

  if (
    typeof product.active !== "boolean" &&
    ["Activo", "Inactivo"].includes(product.estado)
  ) {
    product.active = product.estado === "Activo";
  }

  product.images = normalizeProductImages(product.images, product.imagenUrl);
  product.slug ||= slugifyProductName(product.name);
};

const isHttpUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(String(value)).protocol);
  } catch {
    return false;
  }
};

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    botanicalName: {
      type: String,
      trim: true,
      maxlength: 180,
      default: "",
    },
    category: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 4000,
    },
    presentation: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    ingredients: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    warnings: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      max: 100000000,
      validate: {
        validator: (value) =>
          Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) <
          1e-8,
        message: "El precio admite como máximo dos decimales",
      },
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000,
      validate: {
        validator: Number.isInteger,
        message: "El stock debe ser entero",
      },
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (images) =>
          images.length <= 8 &&
          images.every(
            (image) => String(image).length <= 2048 && isHttpUrl(image),
          ),
        message:
          "Un producto admite hasta 8 imágenes con URL HTTP o HTTPS",
      },
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Campos legacy: se conservan durante la transición para no romper datos reales.
    nombre: { type: String, trim: true },
    categoria: { type: String, trim: true },
    descripcion: { type: String, trim: true },
    precio: { type: Number, min: 0 },
    imagenUrl: { type: String, trim: true },
    estado: { type: String, enum: ["Activo", "Inactivo"] },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

productSchema.index({ slug: 1 }, { unique: true, sparse: true });
productSchema.index({ active: 1, createdAt: -1 });

productSchema.pre("init", (rawDocument) => {
  copyLegacyToCanonical(rawDocument);
});

productSchema.pre("validate", function syncProductCompatibility() {
  copyLegacyToCanonical(this);
  this.slug = slugifyProductName(this.slug || this.name);
});

export default mongoose.model("producto", productSchema);
