import { body } from "express-validator";
import { METODOS_PAGO_PEDIDO } from "../constants/pagos.js";
import {
  TIPO_ENVIO_ANDREANI_DOMICILIO,
  TIPO_ENVIO_ANDREANI_SUCURSAL,
  TIPO_ENVIO_CADETE_LOCAL,
  TIPOS_ENVIO_PEDIDO,
  normalizarTipoEnvio,
} from "../services/envios.service.js";

export const CODIGO_POSTAL_REGEX = /^[A-Za-z0-9-]{3,10}$/;
export const TELEFONO_REGEX = /^\d{8,15}$/;

const normalizarTexto = (value) =>
  typeof value === "string" ? value.trim() : "";

export const crearValidacionesProductosPedido = ({ maxItems = 50 } = {}) => [
  body("productos")
    .isArray({ min: 1, max: maxItems })
    .withMessage(`Debes enviar entre 1 y ${maxItems} productos`),
  body("productos.*.producto")
    .notEmpty()
    .withMessage("El ID del producto es obligatorio")
    .isMongoId()
    .withMessage("El ID del producto no es valido"),
  body("productos.*.cantidad")
    .isInt({ min: 1, max: 50 })
    .withMessage("La cantidad debe ser un entero entre 1 y 50"),
];

export const crearValidacionesDatosEnvio = ({ maxDomicilio = 160 } = {}) => [
  body("envio")
    .isObject()
    .withMessage("Los datos de envio son obligatorios")
    .bail()
    .custom((envio = {}) => {
      const tipoRaw = String(envio.tipo || "").trim().toLowerCase();
      const tipo = normalizarTipoEnvio(envio.tipo);
      const provincia = normalizarTexto(envio.provincia);
      const ciudad = normalizarTexto(envio.ciudad);
      const domicilio = normalizarTexto(envio.domicilio);
      const celular = String(envio.celular || "").replace(/\D/g, "");
      const codigoPostal = normalizarTexto(envio.codigoPostal);
      const sucursalAndreani = normalizarTexto(envio.sucursalAndreani);
      const entreCalles = normalizarTexto(envio.entreCalles);
      const referencia = normalizarTexto(envio.referencia);
      const horarioConveniente = normalizarTexto(envio.horarioConveniente);

      if (tipoRaw && !TIPOS_ENVIO_PEDIDO.includes(tipoRaw)) {
        throw new Error("El tipo de envio no es valido");
      }

      if (!TELEFONO_REGEX.test(celular)) {
        throw new Error(
          tipo === TIPO_ENVIO_CADETE_LOCAL
            ? "El celular / WhatsApp es obligatorio para coordinar la entrega."
            : "El celular no es valido",
        );
      }

      if (tipo !== TIPO_ENVIO_CADETE_LOCAL) {
        if (!ciudad || ciudad.length < 2 || ciudad.length > 80) {
          throw new Error("La ciudad es obligatoria");
        }

        if (!provincia || provincia.length < 2 || provincia.length > 80) {
          throw new Error("La provincia es obligatoria");
        }

        if (!CODIGO_POSTAL_REGEX.test(codigoPostal)) {
          throw new Error("El codigo postal no es valido");
        }
      }

      if (
        tipo === TIPO_ENVIO_ANDREANI_DOMICILIO &&
        (domicilio.length < 5 || domicilio.length > maxDomicilio)
      ) {
        throw new Error("El domicilio no es valido");
      }

      if (
        tipo === TIPO_ENVIO_ANDREANI_SUCURSAL &&
        (sucursalAndreani.length < 3 || sucursalAndreani.length > 160)
      ) {
        throw new Error("La sucursal Andreani es obligatoria");
      }

      if (entreCalles.length > 120) {
        throw new Error("Entre calles no es valido");
      }

      if (referencia.length > 180) {
        throw new Error("La referencia no es valida");
      }

      if (horarioConveniente.length > 120) {
        throw new Error("El horario conveniente no es valido");
      }

      return true;
    }),
  body("envio.celular").customSanitizer((value) =>
    String(value || "").replace(/\D/g, ""),
  ),
  body("guardarDatosEnvio")
    .optional()
    .isBoolean()
    .withMessage("Guardar datos de envio debe ser verdadero o falso"),
];

export const crearValidacionesMetodoPago = () => [
  body("metodoPago")
    .optional()
    .trim()
    .isIn(METODOS_PAGO_PEDIDO)
    .withMessage("El metodo de pago no es valido"),
];
