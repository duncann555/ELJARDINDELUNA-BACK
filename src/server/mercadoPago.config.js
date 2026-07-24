import { MercadoPagoConfig, Preference } from "mercadopago";
import AppError from "../helpers/AppError.js";

export const MP_MODE_SANDBOX = "sandbox";

export const getMercadoPagoMode = () =>
  String(process.env.MERCADO_PAGO_MODE || "")
    .trim()
    .toLowerCase();

export const getMercadoPagoAccessToken = () =>
  String(process.env.MERCADO_PAGO_ACCESS_TOKEN || "").trim();

export const getMercadoPagoClient = () => {
  const accessToken = getMercadoPagoAccessToken();
  if (!accessToken) {
    throw new AppError(
      503,
      "MERCADO_PAGO_NOT_CONFIGURED",
      "Mercado Pago no está configurado.",
    );
  }
  return new MercadoPagoConfig({ accessToken });
};

export const getPreferenceClient = () =>
  new Preference(getMercadoPagoClient());

export const assertPublicHttpsUrl = (rawValue, variableName) => {
  try {
    const url = new URL(String(rawValue || "").trim());
    const localhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (url.protocol !== "https:" || localhost) {
      throw new Error("not-public-https");
    }
    return url.origin;
  } catch {
    throw new AppError(
      500,
      "INVALID_PUBLIC_URL",
      `${variableName} debe contener una URL HTTPS pública.`,
    );
  }
};
