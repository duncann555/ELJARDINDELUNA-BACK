import { getAdminEmail, compareAdminPassword } from "../helpers/adminAuth.js";
import generarAdminJWT from "../middlewares/generarJWT.js";
import AppError from "../helpers/AppError.js";

export const validateAdminCredentials = async ({
  email,
  password,
  configuredEmail = getAdminEmail(),
  comparePassword = compareAdminPassword,
}) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const passwordMatches = await comparePassword(password);
  return normalizedEmail === configuredEmail && passwordMatches;
};

export const loginAdmin = async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const validCredentials = await validateAdminCredentials({
    email,
    password: req.body.password,
  });

  if (!validCredentials) {
    throw new AppError(
      401,
      "INVALID_ADMIN_CREDENTIALS",
      "El correo o la contraseña no son correctos.",
    );
  }

  return res.json({
    data: {
      token: generarAdminJWT(),
      admin: { email: getAdminEmail() },
    },
  });
};

export const obtenerSesionAdmin = async (req, res) =>
  res.json({
    data: {
      admin: { email: req.admin.email },
    },
  });
