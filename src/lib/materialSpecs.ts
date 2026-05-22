import {repairText} from './utils';

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
    repairText(material.materialLine || ''),
    repairText(material.materialType || ''),
    formatThicknessLabel(material),
    repairText(material.texture || ''),
  ].filter(Boolean).join(' | ');

export const formatMaterialSpecsWithProvider = (material: MaterialSpecFields) =>
  [
    formatMaterialSpecs(material),
    repairText(material.provider || ''),
  ].filter(Boolean).join(' | ');
