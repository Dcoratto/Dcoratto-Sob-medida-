import type {InventoryItem, Material, QuotePiece} from '../types';
import {buildMaterialVariantKey} from './materialVariants';
import {formatMaterialSpecs} from './materialSpecs';

export const normalizeMaterialSearch = (value: string) => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

export const matchesMaterialSearch = (material: Material, search: string) => {
  const text = normalizeMaterialSearch([
    material.name, material.provider, material.category, material.materialLine,
    material.materialType, material.thicknessLabel, material.texture,
  ].filter(Boolean).join(' '));
  return normalizeMaterialSearch(search).split(' ').every((term) => text.includes(term));
};

// Catalog entries use `id`; inventory entries use `materialId`.
export const catalogMaterialVariantKey = (material: Material) =>
  buildMaterialVariantKey({...material, materialId: material.id});

export const buildQuoteMaterialOptions = (materials: Material[], inventory: InventoryItem[]) => {
  const catalog = new Map(materials.map((material) => [material.id, material]));
  const grouped = new Map<string, Material & {variantKey: string; availableArea: number; stockArea: number}>();
  inventory.forEach((item) => {
    const status = normalizeMaterialSearch(item.status || '');
    const material = catalog.get(item.materialId);
    if (!material || material.active === false || ['usada', 'descarte'].includes(status)) return;
    const variantKey = buildMaterialVariantKey(item);
    const availableArea = status === 'reservada' ? 0 : (item.area || 0);
    const existing = grouped.get(variantKey);
    if (existing) {
      existing.availableArea += availableArea;
      existing.stockArea += item.area || 0;
      return;
    }
    grouped.set(variantKey, {
      ...material,
      provider: item.provider || material.provider || '',
      category: item.category || material.category || '',
      materialLine: item.materialLine || material.materialLine || item.category || material.category || '',
      materialType: item.materialType || material.materialType || '',
      thicknessLabel: item.thicknessLabel || material.thicknessLabel || '',
      texture: item.texture || material.texture || '',
      imageUrl: item.photoUrl || material.imageUrl || '',
      thumbnailUrl: item.thumbnailUrl || material.thumbnailUrl || '',
      mediumUrl: item.mediumUrl || material.mediumUrl || '',
      originalUrl: item.originalUrl || item.photoUrl || material.originalUrl || material.imageUrl || '',
      variantKey, availableArea, stockArea: item.area || 0,
    });
  });
  materials.forEach((material) => {
    if (material.active === false) return;
    const variantKey = catalogMaterialVariantKey(material);
    if (!grouped.has(variantKey)) grouped.set(variantKey, {...material, variantKey, availableArea: 0, stockArea: 0});
  });
  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name) || formatMaterialSpecs(a).localeCompare(formatMaterialSpecs(b)));
};

export const materialPiecePatch = (material: Material, variantKey?: string): Partial<QuotePiece> => ({
  materialId: material.id,
  materialVariantKey: variantKey,
  materialLine: material.materialLine,
  materialType: material.materialType,
  thicknessLabel: material.thicknessLabel,
  texture: material.texture,
  provider: material.provider,
});

export const planMaterialApplication = (
  pieces: QuotePiece[], selectedIds: string[], material: Material, variantKey?: string,
) => {
  if (material.active === false) throw new Error('Este material está inativo.');
  const selected = new Set(selectedIds);
  if (!selected.size || selected.size !== selectedIds.length || selectedIds.some((id) => !pieces.some((piece) => piece.id === id))) {
    throw new Error('Selecione peças válidas deste orçamento.');
  }
  const patch = materialPiecePatch(material, variantKey);
  let replacementCount = 0;
  const nextPieces = pieces.map((piece) => {
    if (!selected.has(piece.id)) return piece;
    if (piece.materialId && (piece.materialId !== material.id || piece.materialVariantKey !== variantKey)) replacementCount++;
    return {...piece, ...patch};
  });
  return {pieces: nextPieces, replacementCount};
};
