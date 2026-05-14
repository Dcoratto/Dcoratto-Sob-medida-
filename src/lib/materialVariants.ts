type MaterialVariantFields = {
  materialId?: string;
  materialLine?: string;
  materialType?: string;
  thicknessLabel?: string;
  texture?: string;
  provider?: string;
};

const normalizeVariantPart = (value?: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const buildMaterialVariantKey = (material: MaterialVariantFields) =>
  [
    material.materialId || 'sem-material',
    normalizeVariantPart(material.materialLine),
    normalizeVariantPart(material.materialType),
    normalizeVariantPart(material.thicknessLabel),
    normalizeVariantPart(material.texture),
    normalizeVariantPart(material.provider),
  ].join('|');
