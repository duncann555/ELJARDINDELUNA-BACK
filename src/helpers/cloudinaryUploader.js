import cloudinary from "./cloudinary.js";
import AppError from "./AppError.js";

const hasCloudinaryConfiguration = () =>
  [
    process.env.CLOUDINARY_CLOUD_NAME,
    process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_API_SECRET,
  ].every((value) => String(value || "").trim());

const cloudinaryUploader = (
  file,
  {
    folder = "el_jardin_de_luna_productos",
    resourceType = "image",
    allowedFormats = ["jpg", "jpeg", "png", "webp", "avif"],
  } = {},
) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    if (!hasCloudinaryConfiguration()) {
      reject(
        new AppError(
          503,
          "CLOUDINARY_NOT_CONFIGURED",
          "La carga de imágenes no está configurada.",
        ),
      );
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        allowed_formats: allowedFormats,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    );

    uploadStream.end(file.buffer);
  });
};

export const eliminarImagenCloudinary = (publicId) =>
  cloudinary.uploader.destroy(publicId, { resource_type: "image" });

export default cloudinaryUploader;
