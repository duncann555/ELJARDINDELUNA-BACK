import mongoose, { Schema } from "mongoose";
import {
  PRODUCTO_CATEGORIAS,
  PRODUCTO_ESTADOS,
} from "../constants/productos.js";

const productoSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    categoria: {
      type: String,
      required: true,
      enum: PRODUCTO_CATEGORIAS,
    },
    descripcion: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 1000,
    },
    precio: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      max: 9999,
    },
    imagenUrl: {
      type: String,
      required: true,
    },
    estado: {
      type: String,
      enum: PRODUCTO_ESTADOS,
      default: "Activo",
    },
    oferta: {
      type: Boolean,
      default: false,
    },
    destacado: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default mongoose.model("producto", productoSchema);
