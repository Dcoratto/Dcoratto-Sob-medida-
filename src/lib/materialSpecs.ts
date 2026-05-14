type MaterialSpecFields = {
  materialLine?: string;
  materialType?: string;
  thicknessLabel?: string;
  texture?: string;
  provider?: string;
};

const formatThicknessLabel = (material: MaterialSpecFields) => {
  const rawThickness = material.thicknessLabel?.trim();
  if (!rawThickness) return '';
  if (/[a-zA-Z]/.test(rawThickness)) return rawThickness;

  const materialType = material.materialType?.trim().toLowerCase();
  const unit = materialType === 'lamina' ? 'mm' : 'cm';
  return `${rawThickness}${unit}`;
};

export const formatMaterialSpecs = (material: MaterialSpecFields) =>
  [
    material.materialLine,
    material.materialType,
    formatThicknessLabel(material),
    material.texture,
  ].filter(Boolean).join(' | ');

export const formatMaterialSpecsWithProvider = (material: MaterialSpecFields) =>
  [
    formatMaterialSpecs(material),
    material.provider,
  ].filter(Boolean).join(' | ');
