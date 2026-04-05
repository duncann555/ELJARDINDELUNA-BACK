import multer from "multer";

const storage = multer.memoryStorage();
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    const error = new Error(
      "Solo se permiten imagenes JPG, PNG, WEBP o AVIF",
    );
    error.code = "LIMIT_FILE_TYPE";
    callback(error);
  },
});

export default upload;
