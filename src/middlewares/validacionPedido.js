import resultadoValidacion from "./resultadoValidacion.js";
import {
  crearValidacionesDatosEnvio,
  crearValidacionesMetodoPago,
  crearValidacionesProductosPedido,
} from "./sharedOrderValidations.js";

const validacionPedido = [
  ...crearValidacionesProductosPedido({ maxItems: 50 }),
  ...crearValidacionesMetodoPago(),
  ...crearValidacionesDatosEnvio({ maxDomicilio: 150 }),
  resultadoValidacion,
];

export default validacionPedido;
