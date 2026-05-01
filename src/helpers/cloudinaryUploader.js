import cloudinary from "./cloudinary.js";

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

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        allowed_formats: allowedFormats,
      },
      (error, result) => {
        if (error) {
          console.error("Error interno de Cloudinary:", error);
          reject(error);
        } else {
          resolve(result);
        }
      },
    );

    uploadStream.end(file.buffer);
  });
};

export default cloudinaryUploader;
