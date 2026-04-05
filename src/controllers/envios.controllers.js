import {
  buscarLocalidadesAndreani,
  construirResumenPedido,
} from "../services/envios.service.js";
import { responderError } from "../helpers/safeError.js";

const normalizarLimite = (value, fallback = 8) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, 20);
};

export const listarLocalidades = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    const codigoPostal = String(req.query?.codigoPostal || "").trim();

    if (q.length > 80 || codigoPostal.length > 10) {
      return res.status(400).json({
        mensaje: "Los parametros de busqueda no son validos",
      });
    }

    const localidades = await buscarLocalidadesAndreani({
      q,
      codigoPostal,
      limit: normalizarLimite(req.query?.limit),
    });

    res.status(200).json({
      mensaje: "Localidades obtenidas correctamente",
      localidades,
    });
  } catch (error) {
    return responderError(
      res,
      500,
      "No se pudieron obtener las localidades de Andreani",
      error,
    );
  }
};

export const cotizarEnvio = async (req, res) => {
  try {
    const { productos, envio } = req.body;
    const resumen = await construirResumenPedido({ productos, envio });

    res.status(200).json({
      mensaje: "Cotizacion obtenida correctamente",
      subtotal: resumen.subtotal,
      total: resumen.total,
      umbralEnvioGratis: resumen.umbralEnvioGratis,
      envio: {
        proveedor: resumen.envio.proveedor,
        costo: resumen.envio.costo,
        esGratis: resumen.envio.esGratis,
        metodo: resumen.envio.metodo,
        detalle: resumen.envio.detalle,
      },
    });
  } catch (error) {
    return responderError(res, 400, "No se pudo cotizar el envio", error);
  }
};
