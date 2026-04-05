import Pedido from "../models/pedido.js";
import Producto from "../models/producto.js";

const FREE_SHIPPING_THRESHOLD = Number(
  process.env.FREE_SHIPPING_THRESHOLD || 60000,
);
const FIXED_SHIPPING_COST = Number(process.env.FIXED_SHIPPING_COST || 15000);

const ANDREANI_ENV = (process.env.ANDREANI_ENV || "production").toLowerCase();

const ANDREANI_DEFAULT_URLS =
  ANDREANI_ENV === "qa"
    ? {
        login: "https://apisqa.andreani.com/login",
        cotizador:
          "https://apisqa.andreanigloballpack.com/cotizador-globallpack/api/v1/Cotizador",
        tracking:
          "https://apisqa.andreanigloballpack.com/trazabilidad-globallpack/api/v1/Envios",
      }
    : {
        login: "https://apis.andreani.com/login",
        cotizador:
          "https://apis.andreanigloballpack.com/cotizador-globallpack/api/v1/Cotizador",
        tracking:
          "https://apis.andreanigloballpack.com/trazabilidad-globallpack/api/v1/Envios",
      };

const ANDREANI_LOGIN_URL =
  process.env.ANDREANI_LOGIN_URL || ANDREANI_DEFAULT_URLS.login;

const ANDREANI_COTIZADOR_URL =
  process.env.ANDREANI_COTIZADOR_URL || ANDREANI_DEFAULT_URLS.cotizador;

const ANDREANI_TRACKING_URL =
  process.env.ANDREANI_TRACKING_URL || ANDREANI_DEFAULT_URLS.tracking;

const ANDREANI_LOCALIDADES_URL =
  process.env.ANDREANI_LOCALIDADES_URL || "https://apis.andreani.com/v1/localidades";

const ANDREANI_TRACKING_LANGUAGE = (
  process.env.ANDREANI_TRACKING_LANGUAGE || "es"
).toLowerCase();

const ANDREANI_DEFAULTS = {
  kilos: Number(
    process.env.ANDREANI_DEFAULT_PACKAGE_WEIGHT_KG ||
      process.env.ANDREANI_DEFAULT_WEIGHT_KG ||
      0.5,
  ),
  largoCm: Number(process.env.ANDREANI_DEFAULT_PACKAGE_LENGTH_CM || 20),
  anchoCm: Number(process.env.ANDREANI_DEFAULT_PACKAGE_WIDTH_CM || 20),
  altoCm: Number(process.env.ANDREANI_DEFAULT_PACKAGE_HEIGHT_CM || 10),
};

const leerNumeroPositivo = (value, fallback) => {
  const numero = Number(value);
  return Number.isFinite(numero) && numero > 0 ? numero : fallback;
};

const ANDREANI_TRACKING_SYNC_TTL_MS = leerNumeroPositivo(
  process.env.ANDREANI_TRACKING_SYNC_TTL_MS,
  30 * 60 * 1000,
);

const ANDREANI_TRACKING_SYNC_INTERVAL_MS = leerNumeroPositivo(
  process.env.ANDREANI_TRACKING_SYNC_INTERVAL_MS,
  15 * 60 * 1000,
);

const ANDREANI_TRACKING_SYNC_ON_REQUEST_LIMIT = Math.max(
  1,
  Math.trunc(
    leerNumeroPositivo(process.env.ANDREANI_TRACKING_SYNC_ON_REQUEST_LIMIT, 5),
  ),
);

const ANDREANI_TRACKING_SYNC_BATCH_SIZE = Math.max(
  1,
  Math.trunc(
    leerNumeroPositivo(process.env.ANDREANI_TRACKING_SYNC_BATCH_SIZE, 20),
  ),
);

const ANDREANI_TRACKING_RUN_ON_START = String(
  process.env.ANDREANI_TRACKING_RUN_ON_START || "true",
).toLowerCase() === "true";

const ANDREANI_ALLOW_FALLBACK_QUOTES = String(
  process.env.ANDREANI_ALLOW_FALLBACK_QUOTES || "true",
).toLowerCase() === "true";

const PEDIDO_ESTADOS_FINALES = new Set(["Entregado", "Cancelado"]);

let andreaniTokenCache = {
  token: null,
  expiresAt: 0,
};

let andreaniLocalidadesCache = {
  data: null,
  expiresAt: 0,
};

const normalizarTexto = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizarTextoAndreani = (value) =>
  normalizarTexto(value).toUpperCase();

const normalizarNumero = (value, fallback = 0) => {
  const numero = Number(value);
  return Number.isFinite(numero) ? numero : fallback;
};

const generarVolumen = ({ largoCm, anchoCm, altoCm }) =>
  Number(((largoCm * anchoCm * altoCm) / 1000000).toFixed(6));

const mapearCategoriaAndreani = (categoria) => {
  const categoriaNormalizada = normalizarTexto(categoria).toLowerCase();

  if (categoriaNormalizada.includes("cosmet")) {
    return "Maquillaje y cosmetica";
  }

  if (categoriaNormalizada.includes("esencia")) {
    return "Otros";
  }

  if (categoriaNormalizada.includes("tintura")) {
    return "Otros";
  }

  return process.env.ANDREANI_DEFAULT_PRODUCT_CATEGORY || "Otros";
};

const obtenerFallbackCost = () => {
  const fallback = process.env.ANDREANI_FALLBACK_COST;

  if (fallback === undefined || fallback === null || fallback === "") {
    return null;
  }

  const costo = Number(fallback);
  return Number.isFinite(costo) ? costo : null;
};

const PROVINCIAS_SUR = new Set([
  "CHUBUT",
  "NEUQUEN",
  "RIO NEGRO",
  "SANTA CRUZ",
  "TIERRA DEL FUEGO",
]);

const PROVINCIAS_CENTRO = new Set([
  "BUENOS AIRES",
  "CABA",
  "CIUDAD AUTONOMA DE BUENOS AIRES",
  "CORDOBA",
  "SANTA FE",
  "ENTRE RIOS",
]);

const PROVINCIAS_CUYO_NOA = new Set([
  "CATAMARCA",
  "JUJUY",
  "LA RIOJA",
  "MENDOZA",
  "SALTA",
  "SAN JUAN",
  "SAN LUIS",
  "SANTIAGO DEL ESTERO",
  "TUCUMAN",
]);

const PROVINCIAS_NEA = new Set([
  "CHACO",
  "CORRIENTES",
  "FORMOSA",
  "MISIONES",
]);

const tieneAndreaniTrackingConfigurado = () =>
  [process.env.ANDREANI_AUTH_USER, process.env.ANDREANI_AUTH_PASSWORD].every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

const tieneAndreaniCotizadorConfigurado = () =>
  tieneAndreaniTrackingConfigurado() &&
  [
    process.env.ANDREANI_CLIENTE,
    process.env.ANDREANI_CONTRATO,
    process.env.ANDREANI_ORIGIN_CITY,
    process.env.ANDREANI_ORIGIN_POSTAL_CODE,
  ].every((value) => typeof value === "string" && value.trim().length > 0);

const resolverZonaFallback = (provincia) => {
  const provinciaNormalizada = normalizarTextoAndreani(provincia);

  if (PROVINCIAS_SUR.has(provinciaNormalizada)) {
    return "sur";
  }

  if (PROVINCIAS_CUYO_NOA.has(provinciaNormalizada)) {
    return "cuyo_noa";
  }

  if (PROVINCIAS_NEA.has(provinciaNormalizada)) {
    return "nea";
  }

  if (PROVINCIAS_CENTRO.has(provinciaNormalizada)) {
    return "centro";
  }

  return "resto";
};

const obtenerTarifaBaseFallback = (zona) => {
  switch (zona) {
    case "centro":
      return Number(process.env.ANDREANI_FALLBACK_CENTRO_COST || 6500);
    case "cuyo_noa":
      return Number(process.env.ANDREANI_FALLBACK_CUYO_NOA_COST || 7800);
    case "nea":
      return Number(process.env.ANDREANI_FALLBACK_NEA_COST || 8200);
    case "sur":
      return Number(process.env.ANDREANI_FALLBACK_SUR_COST || 9800);
    default:
      return Number(process.env.ANDREANI_FALLBACK_DEFAULT_COST || 7500);
  }
};

const cotizarEnvioEstimado = ({ envioNormalizado, bulto }) => {
  const zona = resolverZonaFallback(envioNormalizado.provincia);
  const base = obtenerTarifaBaseFallback(zona);
  const pesoExcedente = Math.max(0, Math.ceil(Number(bulto.kilos || 0) - 1));
  const recargoPorKilo = Number(process.env.ANDREANI_FALLBACK_EXTRA_KG_COST || 1200);
  const costo = Number((base + pesoExcedente * recargoPorKilo).toFixed(2));

  return {
    costo,
    proveedor: "Andreani",
    esGratis: false,
    metodo: "fallback_estimado",
    detalle: "Cotizacion estimada por zona mientras activas Andreani",
    cotizacion: {
      zona,
      kilos: bulto.kilos,
      base,
      recargoPorKilo,
      pesoExcedente,
    },
  };
};

const obtenerHeaderBasicAuth = () => {
  const credentials = `${process.env.ANDREANI_AUTH_USER}:${process.env.ANDREANI_AUTH_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
};

const parseAndreaniResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const construirErrorAndreani = async (response, fallbackMessage) => {
  if (response.status === 403) {
    return `${fallbackMessage}: Andreani rechazo el acceso. Revisa usuario, password y whitelist de IP publica.`;
  }

  const data = await parseAndreaniResponse(response);

  if (Array.isArray(data) && data.length > 0) {
    const messages = data
      .map((item) => item?.message || item?.mensaje || item?.code)
      .filter(Boolean);

    if (messages.length > 0) {
      return `${fallbackMessage}: ${messages.join(", ")}`;
    }
  }

  if (typeof data === "object" && data !== null) {
    const message =
      data?.message ||
      data?.mensaje ||
      data?.error?.mensaje ||
      data?.error?.titulo;

    if (message) {
      return `${fallbackMessage}: ${message}`;
    }
  }

  if (typeof data === "string" && data.trim().length > 0) {
    return `${fallbackMessage}: ${data.trim()}`;
  }

  return fallbackMessage;
};

const obtenerLocalidadesAndreani = async () => {
  if (
    Array.isArray(andreaniLocalidadesCache.data) &&
    Date.now() < andreaniLocalidadesCache.expiresAt
  ) {
    return andreaniLocalidadesCache.data;
  }

  const response = await fetch(ANDREANI_LOCALIDADES_URL, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(
      await construirErrorAndreani(
        response,
        "No se pudo consultar el padron de localidades de Andreani",
      ),
    );
  }

  const data = await parseAndreaniResponse(response);

  if (!Array.isArray(data)) {
    throw new Error("Andreani no devolvio un listado valido de localidades");
  }

  andreaniLocalidadesCache = {
    data,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  };

  return data;
};

const puntuarLocalidad = (localidad, terminoNormalizado, codigoPostal) => {
  let score = 0;

  if (!terminoNormalizado && !codigoPostal) {
    return score;
  }

  const nombreLocalidad = normalizarTexto(localidad?.localidad).toLowerCase();
  const nombreProvincia = normalizarTexto(localidad?.provincia).toLowerCase();
  const nombrePartido = normalizarTexto(localidad?.partido).toLowerCase();
  const codigos = Array.isArray(localidad?.codigosPostales)
    ? localidad.codigosPostales.map((cp) => String(cp))
    : [];

  if (codigoPostal) {
    if (codigos.some((cp) => cp === codigoPostal)) score += 120;
    else if (codigos.some((cp) => cp.startsWith(codigoPostal))) score += 80;
  }

  if (terminoNormalizado) {
    if (nombreLocalidad === terminoNormalizado) score += 100;
    else if (nombreLocalidad.startsWith(terminoNormalizado)) score += 70;
    else if (nombreLocalidad.includes(terminoNormalizado)) score += 40;

    if (nombreProvincia.startsWith(terminoNormalizado)) score += 20;
    else if (nombreProvincia.includes(terminoNormalizado)) score += 10;

    if (nombrePartido.startsWith(terminoNormalizado)) score += 10;
  }

  return score;
};

export const buscarLocalidadesAndreani = async ({
  codigoPostal = "",
  q = "",
  limit = 8,
} = {}) => {
  const codigoPostalNormalizado = String(codigoPostal || "").trim();
  const terminoNormalizado = normalizarTexto(q).toLowerCase();

  if (codigoPostalNormalizado.length < 3 && terminoNormalizado.length < 3) {
    return [];
  }

  const localidades = await obtenerLocalidadesAndreani();

  const coincidencias = localidades
    .map((localidad) => ({
      ...localidad,
      score: puntuarLocalidad(
        localidad,
        terminoNormalizado,
        codigoPostalNormalizado,
      ),
    }))
    .filter((localidad) => localidad.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((localidad) => {
      const codigoPostalPrincipal =
        localidad.codigosPostales?.find((cp) =>
          String(cp).startsWith(codigoPostalNormalizado),
        ) ||
        localidad.codigosPostales?.[0] ||
        "";

      return {
        id: localidad.idDeProvLocalidad,
        localidad: normalizarTexto(localidad.localidad),
        partido: normalizarTexto(localidad.partido),
        provincia: normalizarTexto(localidad.provincia),
        codigoPostal: String(codigoPostalPrincipal),
        codigosPostales: Array.isArray(localidad.codigosPostales)
          ? localidad.codigosPostales.map((cp) => String(cp))
          : [],
        label: `${normalizarTexto(localidad.localidad)}, ${normalizarTexto(
          localidad.provincia,
        )} (${String(codigoPostalPrincipal)})`,
      };
    });

  return coincidencias;
};

const obtenerTokenAndreani = async () => {
  if (andreaniTokenCache.token && Date.now() < andreaniTokenCache.expiresAt) {
    return andreaniTokenCache.token;
  }

  const response = await fetch(ANDREANI_LOGIN_URL, {
    method: "GET",
    headers: {
      Authorization: obtenerHeaderBasicAuth(),
    },
  });

  if (!response.ok) {
    throw new Error(
      await construirErrorAndreani(
        response,
        "No se pudo autenticar con Andreani",
      ),
    );
  }

  const data = await parseAndreaniResponse(response);
  const token = data?.token;

  if (!token) {
    throw new Error("Andreani no devolvio un token valido");
  }

  andreaniTokenCache = {
    token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };

  return token;
};

const crearBultoEstimado = (productosFinal) => {
  const categoriaAndreani =
    mapearCategoriaAndreani(productosFinal[0]?.categoria || "");

  const bulto = productosFinal.reduce(
    (acc, producto) => {
      const cantidad = normalizarNumero(producto.cantidad, 1);

      acc.kilos += normalizarNumero(producto.pesoKg, ANDREANI_DEFAULTS.kilos) * cantidad;
      acc.largoCm = Math.max(
        acc.largoCm,
        normalizarNumero(producto.largoCm, ANDREANI_DEFAULTS.largoCm),
      );
      acc.anchoCm = Math.max(
        acc.anchoCm,
        normalizarNumero(producto.anchoCm, ANDREANI_DEFAULTS.anchoCm),
      );
      acc.altoCm += normalizarNumero(
        producto.altoCm,
        ANDREANI_DEFAULTS.altoCm,
      ) * cantidad;

      return acc;
    },
    {
      kilos: 0,
      largoCm: ANDREANI_DEFAULTS.largoCm,
      anchoCm: ANDREANI_DEFAULTS.anchoCm,
      altoCm: 0,
      categoriaProducto: categoriaAndreani,
    },
  );

  const altoCm = Math.max(
    ANDREANI_DEFAULTS.altoCm,
    Number(bulto.altoCm.toFixed(2)),
  );

  return {
    kilos: Number(Math.max(ANDREANI_DEFAULTS.kilos, bulto.kilos).toFixed(2)),
    largoCm: Number(bulto.largoCm.toFixed(2)),
    anchoCm: Number(bulto.anchoCm.toFixed(2)),
    altoCm,
    volumen: generarVolumen({
      largoCm: bulto.largoCm,
      anchoCm: bulto.anchoCm,
      altoCm,
    }),
    categoriaProducto: categoriaAndreani,
  };
};

export const validarDatosEnvio = (envio) => {
  const envioNormalizado = {
    provincia: normalizarTexto(envio?.provincia),
    ciudad: normalizarTexto(envio?.ciudad),
    domicilio: normalizarTexto(envio?.domicilio),
    celular: String(envio?.celular || "").replace(/\D/g, ""),
    entreCalles: normalizarTexto(envio?.entreCalles),
    referencia: normalizarTexto(envio?.referencia),
    codigoPostal: normalizarTexto(envio?.codigoPostal),
  };

  if (!envioNormalizado.provincia) {
    throw new Error("La provincia es obligatoria");
  }

  if (!envioNormalizado.ciudad) {
    throw new Error("La ciudad es obligatoria");
  }

  if (!envioNormalizado.domicilio) {
    throw new Error("El domicilio es obligatorio");
  }

  if (!envioNormalizado.celular) {
    throw new Error("El celular es obligatorio");
  }

  if (!/^\d{8,15}$/.test(envioNormalizado.celular)) {
    throw new Error("El celular no es valido");
  }

  if (!envioNormalizado.codigoPostal) {
    throw new Error("El codigo postal es obligatorio");
  }

  return envioNormalizado;
};

export const resolverProductosPedido = async (productosSolicitados) => {
  if (!Array.isArray(productosSolicitados) || productosSolicitados.length === 0) {
    throw new Error("El pedido debe contener al menos un producto");
  }

  const productosFinal = [];
  let subtotal = 0;

  for (const item of productosSolicitados) {
    const productoId = item?.producto || item?.id;
    const cantidad = Number(item?.cantidad);

    if (!productoId) {
      throw new Error("El ID del producto es obligatorio");
    }

    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new Error("La cantidad debe ser un entero mayor a 0");
    }

    const productoBD = await Producto.findById(productoId);

    if (!productoBD) {
      throw new Error("Producto no existe");
    }

    if (productoBD.estado !== "Activo") {
      throw new Error(`El producto ${productoBD.nombre} no esta disponible`);
    }

    if (productoBD.stock < cantidad) {
      throw new Error(`Stock insuficiente para ${productoBD.nombre}`);
    }

    const precio = Number(productoBD.precio);
    subtotal += precio * cantidad;

    productosFinal.push({
      producto: productoBD._id,
      nombre: productoBD.nombre,
      categoria: productoBD.categoria,
      precio,
      cantidad,
      pesoKg: productoBD.pesoKg,
      largoCm: productoBD.largoCm,
      anchoCm: productoBD.anchoCm,
      altoCm: productoBD.altoCm,
    });
  }

  return {
    productosFinal,
    subtotal: Number(subtotal.toFixed(2)),
    bulto: crearBultoEstimado(productosFinal),
  };
};

const cotizarAndreani = async ({ subtotal, envioNormalizado, bulto }) => {
  const token = await obtenerTokenAndreani();

  const params = new URLSearchParams({
    CpDestino: envioNormalizado.codigoPostal,
    CiudadDestino: normalizarTextoAndreani(envioNormalizado.ciudad),
    PaisDestino: process.env.ANDREANI_DESTINATION_COUNTRY || "AR",
    CpOrigen: process.env.ANDREANI_ORIGIN_POSTAL_CODE,
    CiudadOrigen: normalizarTextoAndreani(process.env.ANDREANI_ORIGIN_CITY),
    PaisOrigen: process.env.ANDREANI_ORIGIN_COUNTRY || "AR",
    Contrato: process.env.ANDREANI_CONTRATO,
    Cliente: process.env.ANDREANI_CLIENTE,
    "bultos[0].valorDeclarado": String(Number(subtotal.toFixed(2))),
    "bultos[0].volumen": String(bulto.volumen),
    "bultos[0].kilos": String(bulto.kilos),
    "bultos[0].altoCm": String(bulto.altoCm),
    "bultos[0].largoCm": String(bulto.largoCm),
    "bultos[0].anchoCm": String(bulto.anchoCm),
    "bultos[0].categoriaProducto": bulto.categoriaProducto,
  });

  const response = await fetch(`${ANDREANI_COTIZADOR_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "x-authorization-token": token,
    },
  });

  if (!response.ok) {
    throw new Error(
      await construirErrorAndreani(
        response,
        "Andreani no pudo cotizar el envio",
      ),
    );
  }

  const data = await parseAndreaniResponse(response);
  const costo =
    normalizarNumero(data?.tarifaConIva?.total, NaN) ||
    normalizarNumero(data?.UltimaMilla, NaN);

  if (!Number.isFinite(costo)) {
    throw new Error("Andreani no devolvio un costo de envio valido");
  }

  return {
    costo: Number(costo.toFixed(2)),
    proveedor: "Andreani",
    esGratis: false,
    metodo: "andreani_api",
    detalle: "Cotizacion obtenida desde Andreani",
    cotizacion: data,
  };
};

export const cotizarEnvioPedido = async ({
  subtotal,
  envio,
  productosFinal,
  bulto: bultoRecibido,
}) => {
  const envioNormalizado = validarDatosEnvio(envio);
  return {
    costo: FIXED_SHIPPING_COST,
    proveedor: "Andreani",
    esGratis: false,
    metodo: "flat_rate",
    detalle: `Envio fijo a todo el pais por $${FIXED_SHIPPING_COST.toLocaleString("es-AR")}`,
    umbralGratis: FREE_SHIPPING_THRESHOLD,
    destino: envioNormalizado,
    cotizacion: null,
  };
};

export const construirResumenPedido = async ({ productos, envio }) => {
  const { productosFinal, subtotal, bulto } = await resolverProductosPedido(productos);
  const resumenEnvio = await cotizarEnvioPedido({
    subtotal,
    envio,
    productosFinal,
    bulto,
  });

  return {
    productosFinal,
    subtotal,
    envio: resumenEnvio,
    total: Number((subtotal + resumenEnvio.costo).toFixed(2)),
    umbralEnvioGratis: FREE_SHIPPING_THRESHOLD,
  };
};

const parsearFechaAndreani = (value) => {
  const fechaTexto = normalizarTexto(value);
  const coincidencia = fechaTexto.match(
    /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/,
  );

  if (!coincidencia) {
    return null;
  }

  const [, dia, mes, anio, horas, minutos] = coincidencia;
  const fecha = new Date(`${anio}-${mes}-${dia}T${horas}:${minutos}:00-03:00`);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const obtenerUltimoEventoAndreani = (eventos) => {
  if (!Array.isArray(eventos) || eventos.length === 0) {
    return null;
  }

  const [eventoMasReciente] = [...eventos]
    .map((evento, index) => ({
      evento,
      index,
      fecha: parsearFechaAndreani(evento?.fecha),
    }))
    .sort((a, b) => {
      if (a.fecha && b.fecha) {
        return b.fecha.getTime() - a.fecha.getTime();
      }

      if (a.fecha) return -1;
      if (b.fecha) return 1;

      return a.index - b.index;
    });

  return eventoMasReciente?.evento || null;
};

const mapearEstadoAndreani = (estadoAndreani) => {
  const estadoNormalizado = normalizarTexto(estadoAndreani).toLowerCase();

  if (estadoNormalizado.includes("entregado")) {
    return {
      envioEstado: "Entregado",
      pedidoEstado: "Entregado",
    };
  }

  return {
    envioEstado: "Despachado",
    pedidoEstado: "Despachado",
  };
};

const pedidoTieneTracking = (pedido) =>
  typeof pedido?.envio?.trackingId === "string" &&
  pedido.envio.trackingId.trim().length > 0;

const pedidoEstaFinalizado = (pedido) =>
  PEDIDO_ESTADOS_FINALES.has(pedido?.estadoPedido);

const sincronizacionAndreaniVencida = (pedido, { force = false } = {}) => {
  if (force) {
    return true;
  }

  if (!pedidoTieneTracking(pedido) || pedidoEstaFinalizado(pedido)) {
    return false;
  }

  const ultimaConsulta = pedido?.envio?.ultimaConsultaAndreani
    ? new Date(pedido.envio.ultimaConsultaAndreani)
    : null;

  if (!ultimaConsulta || Number.isNaN(ultimaConsulta.getTime())) {
    return true;
  }

  return Date.now() - ultimaConsulta.getTime() >= ANDREANI_TRACKING_SYNC_TTL_MS;
};

const consultarTrazabilidadAndreani = async (trackingId) => {
  const token = await obtenerTokenAndreani();
  const params = new URLSearchParams({
    idioma: ANDREANI_TRACKING_LANGUAGE,
  });

  const response = await fetch(
    `${ANDREANI_TRACKING_URL}/${encodeURIComponent(trackingId)}/trazas?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "x-authorization-token": token,
      },
    },
  );

  if (!response.ok) {
    const error = new Error(
      await construirErrorAndreani(
        response,
        "No se pudo consultar la trazabilidad de Andreani",
      ),
    );

    error.status = response.status;
    throw error;
  }

  const data = await parseAndreaniResponse(response);

  if (!Array.isArray(data?.eventos)) {
    throw new Error("Andreani no devolvio eventos validos de trazabilidad");
  }

  return data;
};

export const sincronizarPedidoConAndreani = async (
  pedido,
  { force = false } = {},
) => {
  if (!pedido) {
    return { ok: false, omitido: true, motivo: "pedido_invalido" };
  }

  if (!pedidoTieneTracking(pedido)) {
    return { ok: false, omitido: true, motivo: "sin_tracking" };
  }

  if (!tieneAndreaniTrackingConfigurado()) {
    return { ok: false, omitido: true, motivo: "andreani_no_configurado" };
  }

  if (!sincronizacionAndreaniVencida(pedido, { force })) {
    return { ok: false, omitido: true, motivo: "sincronizacion_reciente" };
  }

  if (pedido.estadoPedido === "Cancelado" && !force) {
    return { ok: false, omitido: true, motivo: "pedido_cancelado" };
  }

  const trackingId = pedido.envio.trackingId.trim();
  const fechaConsulta = new Date();

  try {
    const data = await consultarTrazabilidadAndreani(trackingId);
    const ultimoEvento = obtenerUltimoEventoAndreani(data.eventos);

    pedido.envio.ultimaConsultaAndreani = fechaConsulta;
    pedido.envio.ultimoErrorAndreani = "";

    if (ultimoEvento) {
      const { envioEstado, pedidoEstado } = mapearEstadoAndreani(
        ultimoEvento.estado,
      );
      const fechaEvento = parsearFechaAndreani(ultimoEvento.fecha);

      pedido.envio.estado = envioEstado;
      pedido.envio.estadoDetalle = ultimoEvento.estado || "";
      pedido.envio.ultimoComentarioAndreani = ultimoEvento.comentario || "";

      if (fechaEvento) {
        pedido.envio.ultimaActualizacionAndreani = fechaEvento;
      }

      if (pedido.estadoPedido !== "Cancelado") {
        pedido.estadoPedido = pedidoEstado;
      }
    }

    pedido.markModified("envio");
    await pedido.save();

    return {
      ok: true,
      pedidoId: pedido._id.toString(),
      trackingId,
      estadoPedido: pedido.estadoPedido,
      estadoEnvio: pedido.envio.estado,
      estadoAndreani: pedido.envio.estadoDetalle || "",
    };
  } catch (error) {
    pedido.envio.ultimaConsultaAndreani = fechaConsulta;
    pedido.envio.ultimoErrorAndreani =
      error?.message || "No se pudo sincronizar el seguimiento";
    pedido.markModified("envio");
    await pedido.save();

    return {
      ok: false,
      pedidoId: pedido._id.toString(),
      trackingId,
      error: error?.message || "No se pudo sincronizar el seguimiento",
    };
  }
};

export const sincronizarPedidosEnMemoriaConAndreani = async (
  pedidos,
  {
    force = false,
    maxPedidos = ANDREANI_TRACKING_SYNC_ON_REQUEST_LIMIT,
  } = {},
) => {
  const lista = (Array.isArray(pedidos) ? pedidos : [pedidos])
    .filter(Boolean)
    .filter((pedido) => pedidoTieneTracking(pedido))
    .filter((pedido) => !pedidoEstaFinalizado(pedido) || force)
    .filter((pedido) => sincronizacionAndreaniVencida(pedido, { force }))
    .slice(0, Math.max(1, maxPedidos));

  const resultados = [];

  for (const pedido of lista) {
    try {
      resultados.push(await sincronizarPedidoConAndreani(pedido, { force }));
    } catch (error) {
      resultados.push({
        ok: false,
        pedidoId: pedido?._id?.toString?.() || "",
        trackingId: pedido?.envio?.trackingId || "",
        error: error?.message || "No se pudo sincronizar el seguimiento",
      });
    }
  }

  return resultados;
};

export const sincronizarPedidosPendientesConAndreani = async ({
  force = false,
  limit = ANDREANI_TRACKING_SYNC_BATCH_SIZE,
} = {}) => {
  if (!tieneAndreaniTrackingConfigurado()) {
    return {
      ok: false,
      omitido: true,
      motivo: "andreani_no_configurado",
      total: 0,
      actualizados: 0,
      errores: [],
    };
  }

  const filtro = {
    "envio.trackingId": {
      $exists: true,
      $nin: ["", null],
    },
    estadoPedido: {
      $nin: [...PEDIDO_ESTADOS_FINALES],
    },
  };

  if (!force) {
    filtro.$or = [
      { "envio.ultimaConsultaAndreani": { $exists: false } },
      { "envio.ultimaConsultaAndreani": null },
      {
        "envio.ultimaConsultaAndreani": {
          $lte: new Date(Date.now() - ANDREANI_TRACKING_SYNC_TTL_MS),
        },
      },
    ];
  }

  const pedidos = await Pedido.find(filtro)
    .sort({
      "envio.ultimaConsultaAndreani": 1,
      updatedAt: -1,
    })
    .limit(Math.max(1, limit));

  const resultados = await sincronizarPedidosEnMemoriaConAndreani(pedidos, {
    force,
    maxPedidos: limit,
  });

  const errores = resultados
    .filter((resultado) => !resultado.ok && !resultado.omitido)
    .map(({ pedidoId, trackingId, error }) => ({
      pedidoId,
      trackingId,
      error,
    }));

  return {
    ok: true,
    total: resultados.length,
    actualizados: resultados.filter((resultado) => resultado.ok).length,
    errores,
  };
};

let sincronizacionAndreaniEnCurso = false;
let intervaloSincronizacionAndreani = null;

export const iniciarSincronizacionAutomaticaAndreani = () => {
  if (process.env.VERCEL || intervaloSincronizacionAndreani) {
    return intervaloSincronizacionAndreani;
  }

  const ejecutarSincronizacion = async () => {
    if (sincronizacionAndreaniEnCurso) {
      return;
    }

    sincronizacionAndreaniEnCurso = true;

    try {
      await sincronizarPedidosPendientesConAndreani();
    } catch (error) {
      console.error("Error al sincronizar pedidos con Andreani:", error);
    } finally {
      sincronizacionAndreaniEnCurso = false;
    }
  };

  intervaloSincronizacionAndreani = setInterval(
    () => void ejecutarSincronizacion(),
    ANDREANI_TRACKING_SYNC_INTERVAL_MS,
  );

  intervaloSincronizacionAndreani.unref?.();

  if (ANDREANI_TRACKING_RUN_ON_START) {
    void ejecutarSincronizacion();
  }

  return intervaloSincronizacionAndreani;
};
