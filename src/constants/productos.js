const PRODUCTO_CATEGORIAS_LEGACY = {
  "Aceites Esenciales": "Aceites",
  "Cosmetica Natural": "Hierbas Naturales",
  "Cosmética Natural": "Hierbas Naturales",
  Infusiones: "Hierbas Naturales",
};

export const PRODUCTO_CATEGORIAS = [
  "Tinturas Madres",
  "Esencias Aromaticas",
  "Hierbas Naturales",
  "Aceites",
];

export const normalizarProductoCategoria = (value) => {
  const categoria = String(value || "").trim();
  return PRODUCTO_CATEGORIAS_LEGACY[categoria] || categoria;
};

export const esProductoCategoriaValida = (value) =>
  PRODUCTO_CATEGORIAS.includes(normalizarProductoCategoria(value));

export const PRODUCTO_ESTADOS = ["Activo", "Inactivo"];

export const PRODUCTO_CAMPOS_EDITABLES = [
  "nombre",
  "categoria",
  "descripcion",
  "precio",
  "stock",
  "estado",
  "oferta",
  "destacado",
];

