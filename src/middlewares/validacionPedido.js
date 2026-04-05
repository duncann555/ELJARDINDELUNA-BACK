import resultadoValidacion from "./resultadoValidacion.js";
import {
  crearValidacionesDatosEnvio,
  crearValidacionesProductosPedido,
} from "./sharedOrderValidations.js";

const validacionPedido = [
  ...crearValidacionesProductosPedido({ maxItems: 50 }),
  ...crearValidacionesDatosEnvio({ maxDomicilio: 150 }),
  resultadoValidacion,
];

export default validacionPedido;
