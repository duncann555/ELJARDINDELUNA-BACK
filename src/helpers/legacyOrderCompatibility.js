import {
  DELIVERY_METHOD_HOME,
  DELIVERY_METHOD_PICKUP,
  DELIVERY_METHODS,
} from "../constants/pedidos.js";

const trim = (value) => String(value ?? "").trim();

const LEGACY_DELIVERY_METHODS = {
  domicilio: DELIVERY_METHOD_HOME,
  andreani_domicilio: DELIVERY_METHOD_HOME,
  andreani_sucursal: DELIVERY_METHOD_HOME,
  cadete_local: DELIVERY_METHOD_PICKUP,
  acordar_vendedor: DELIVERY_METHOD_PICKUP,
  retiro: DELIVERY_METHOD_PICKUP,
};

const LEGACY_METHOD_LABELS = {
  andreani_domicilio: "Andreani a domicilio",
  andreani_sucursal: "Andreani a sucursal",
  cadete_local: "Cadete local",
  acordar_vendedor: "Acordar con vendedor",
};

export const resolveDeliveryMethod = (delivery = {}) => {
  if (DELIVERY_METHODS.includes(delivery.metodo)) return delivery.metodo;
  return LEGACY_DELIVERY_METHODS[trim(delivery.tipo).toLowerCase()];
};

const appendUniqueNote = (notes, label, rawValue) => {
  const value = trim(rawValue);
  if (!value || notes.some((entry) => entry.value === value)) return;
  notes.push({ label, value });
};

export const buildCompatibleDelivery = (delivery = {}) => {
  const legacyType = trim(delivery.tipo).toLowerCase();
  const notes = [];
  appendUniqueNote(
    notes,
    "Método histórico",
    LEGACY_METHOD_LABELS[legacyType],
  );
  appendUniqueNote(notes, "", delivery.aclaraciones);
  appendUniqueNote(notes, "Entre calles", delivery.entreCalles);
  appendUniqueNote(notes, "Referencia", delivery.referencia);
  appendUniqueNote(notes, "Sucursal", delivery.sucursalAndreani);
  appendUniqueNote(notes, "Horario", delivery.horarioConveniente);
  appendUniqueNote(notes, "Observaciones", delivery.observaciones);

  return {
    metodo: resolveDeliveryMethod(delivery),
    provincia: trim(delivery.provincia),
    localidad: trim(delivery.localidad || delivery.ciudad),
    codigoPostal: trim(delivery.codigoPostal),
    direccion: trim(
      delivery.direccion ||
        delivery.domicilio ||
        (legacyType === "andreani_sucursal"
          ? delivery.sucursalAndreani
          : ""),
    ),
    aclaraciones: notes
      .map(({ label, value }) => (label ? `${label}: ${value}` : value))
      .join(" · "),
  };
};

export const buildCompatibleCustomer = ({
  customer = {},
  delivery = {},
  fallbackEmail,
} = {}) => {
  const rawName = trim(customer.nombre);
  const explicitLastName = trim(customer.apellido);
  const parts = rawName.split(/\s+/).filter(Boolean);
  const nombre = explicitLastName ? rawName : parts.shift() || "";

  return {
    nombre,
    apellido: explicitLastName || parts.join(" "),
    telefono: trim(
      customer.telefono || customer.whatsapp || delivery.celular,
    ).replace(/\D/g, ""),
    email: trim(customer.email || fallbackEmail).toLowerCase(),
  };
};

export const resolveHistoricalPaymentProvider = (order = {}) => {
  const stored = trim(order.pago?.provider || order.pago?.proveedor);
  const method = trim(order.metodoPago).toLowerCase();
  const normalizedStored = stored.toLowerCase().replace(/[\s_-]/g, "");
  if (method === "transferencia" || stored.toLowerCase().includes("transfer")) {
    return "transferencia";
  }
  if (
    method === "mercado_pago" ||
    normalizedStored === "mercadopago"
  ) {
    return "mercado_pago";
  }
  return stored || method;
};
