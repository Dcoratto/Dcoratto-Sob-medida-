import type {QuotePresentationSnapshot} from './quoteDigital';
import type {MaterialSelections} from './quoteMaterialAlternatives';
import {getPieceQuantity} from './quotePieceQuantity';

type PublicPiece = NonNullable<QuotePresentationSnapshot['pieces']>[number];
export const GROUP_REVIEW_MESSAGE = 'Esta alternativa não está autorizada para todas as peças deste material. Peça ao vendedor para ajustar a configuração.';

// Always derive identity from the published original, never from the simulation.
export function buildOriginalMaterialGroups(snapshot: QuotePresentationSnapshot) {
  const groups = new Map<string, {id: string; materialId: string; name: string; pieces: PublicPiece[]; units: number}>();
  for (const piece of snapshot.pieces || []) {
    const materialId = piece.materialId || '';
    const name = (snapshot.materials || []).find((material) => material.id === materialId)?.name
      || (snapshot.material?.id === materialId ? snapshot.material.name : '') || piece.materialName || piece.material || 'Material original';
    const id = JSON.stringify([materialId, materialId ? '' : name]);
    const group = groups.get(id) || {id, materialId, name, pieces: [], units: 0};
    group.pieces.push(piece);
    group.units += getPieceQuantity(piece);
    groups.set(id, group);
  }
  return [...groups.values()];
}

export function buildAlternativeGallery(snapshot: QuotePresentationSnapshot) {
  const gallery = new Map<string, {id: string; material: NonNullable<QuotePresentationSnapshot['material']>; finishes: string[]}>();
  for (const option of snapshot.materialAlternatives?.options || []) {
    const entry = gallery.get(option.materialId) || {id: option.materialId, material: option.material, finishes: []};
    if (option.material.texture && !entry.finishes.includes(option.material.texture)) entry.finishes.push(option.material.texture);
    gallery.set(option.materialId, entry);
  }
  return [...gallery.values()];
}

export function resolveGroupAlternative(snapshot: QuotePresentationSnapshot, groupId: string, materialId: string,
  originalGroups = buildOriginalMaterialGroups(snapshot)) {
  const group = originalGroups.find((item) => item.id === groupId);
  const options = (snapshot.materialAlternatives?.options || []).filter((option) => option.materialId === materialId
    && option.principalMaterialId === group?.materialId && !option.reviewReason);
  // A material can have several variants. Never silently choose between two valid finishes.
  const variants = [...new Set(options.map((option) => option.materialVariantKey || ''))];
  const candidates = variants.flatMap((variant) => {
    const selection: MaterialSelections = {};
    if (!group?.pieces.length || materialId === group.materialId) return [];
    for (const piece of group.pieces) {
      const matches = options.filter((option) => (option.materialVariantKey || '') === variant
        && option.pieceIds.includes(piece.id) && Number.isFinite(option.pieceDeltas[piece.id]));
      if (matches.length !== 1) return [];
      selection[piece.id] = matches[0].id;
    }
    return [selection];
  });
  return candidates.length === 1 ? {selections: candidates[0], error: ''} : {selections: null, error: GROUP_REVIEW_MESSAGE};
}

export function restoreMaterialGroup(snapshot: QuotePresentationSnapshot, selections: MaterialSelections, groupId: string) {
  const group = buildOriginalMaterialGroups(snapshot).find((item) => item.id === groupId);
  if (!group) throw new Error('Grupo original não pertence à proposta.');
  const next = {...selections};
  group.pieces.forEach((piece) => delete next[piece.id]);
  return next;
}

export function applyMaterialGroup(snapshot: QuotePresentationSnapshot, selections: MaterialSelections, groupId: string, materialId: string) {
  const result = resolveGroupAlternative(snapshot, groupId, materialId);
  if (!result.selections) throw new Error(result.error);
  return {...restoreMaterialGroup(snapshot, selections, groupId), ...result.selections};
}
