type MaterialSpecFields = {
  materialLine?: string;
  materialType?: string;
  thicknessLabel?: string;
  texture?: string;
  provider?: string;
};

export const formatMaterialSpecs = (material: MaterialSpecFields) =>
  [
    material.materialLine,
    material.materialType,
    material.thicknessLabel,
    material.texture,
  ].filter(Boolean).join(' | ');

export const formatMaterialSpecsWithProvider = (material: MaterialSpecFields) =>
  [
    formatMaterialSpecs(material),
    material.provider,
  ].filter(Boolean).join(' | ');
