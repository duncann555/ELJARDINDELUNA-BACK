import mongoose, { Schema } from "mongoose";

const FIREBASE_PROVIDERS_PERMITIDOS = ["google.com", null];

const usuarioSchema = new Schema(
  {
    nombre: {
      type: String,
      required: [true, "El nombre es obligatorio"],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    apellido: {
      type: String,
      required: [true, "El apellido es obligatorio"],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, "El email es obligatorio"],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 6,
      maxlength: 120,
      match: [/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, "El email no es valido"],
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: null,
    },
    firebaseProvider: {
      type: String,
      enum: FIREBASE_PROVIDERS_PERMITIDOS,
      default: null,
    },
    password: {
      type: String,
      required: [true, "La contrasena es obligatoria"],
      minlength: 8,
      maxlength: 72,
      select: false,
    },
    resetPasswordToken: {
      type: String,
      default: null,
      select: false,
    },
    resetPasswordExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    rol: {
      type: String,
      enum: ["Administrador", "Usuario"],
      default: "Usuario",
    },
    estado: {
      type: String,
      enum: ["Activo", "Suspendido"],
      default: "Activo",
    },
    telefono: {
      type: String,
      required: [
        true,
        "El numero de WhatsApp es obligatorio para coordinar envios",
      ],
      trim: true,
      minlength: 8,
      maxlength: 15,
      match: [/^\d{8,15}$/, "El numero de WhatsApp no es valido"],
    },
    carrito: [
      {
        productoId: {
          type: Schema.Types.ObjectId,
          ref: "producto",
        },
        nombre: String,
        precio: Number,
        cantidad: {
          type: Number,
          default: 1,
        },
        imagenUrl: String,
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

usuarioSchema.pre("validate", function () {
  if (
    this.firebaseProvider &&
    !FIREBASE_PROVIDERS_PERMITIDOS.includes(this.firebaseProvider)
  ) {
    this.firebaseProvider = null;
  }
});

usuarioSchema.methods.toJSON = function () {
  const { password, ...usuario } = this.toObject();
  return usuario;
};

export default mongoose.model("usuario", usuarioSchema);
