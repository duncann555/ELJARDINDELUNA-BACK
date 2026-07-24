export const slugifyProductName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

export const normalizeProductImages = (images, legacyImageUrl = "") => {
  const candidates = Array.isArray(images)
    ? images
    : typeof images === "string"
      ? images.split(",")
      : [];

  return [
    ...new Set(
      [...candidates, legacyImageUrl]
        .map((image) => String(image || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 8);
};
