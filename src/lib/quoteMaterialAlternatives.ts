import type {Material, QuoteMaterialAlternative, QuoteMaterialAlternatives, QuotePiece} from '../types';
import type {QuotePresentationSnapshot} from './quoteDigital';
import {calculateQuotePaymentTotals} from './quotePaymentSimulation';
import {allocateQuotePresentationValues} from './quotePresentationValueAllocation';
import {normalizeMaterialSearch} from './quoteMaterials';
import {buildPiecePricingBreakdowns, type PiecePricingBreakdown} from './quotePiecePricing';

export const MAX_MATERIAL_ALTERNATIVES = 100;
export type MaterialSelections = Record<string, string>;

export function calculateAlternativePieceDeltas(
  parameters: Parameters<typeof buildPiecePricingBreakdowns>[0], eligibleIds: string[], pricePerM2: number,
  original: PiecePricingBreakdown[], chargeMaterialLoss: boolean,
) {
  const eligible = new Set(eligibleIds);
  const changed = buildPiecePricingBreakdowns({...parameters,
    resolveMaterialPricePerM2: (piece) => eligible.has(piece.id) ? pricePerM2 : parameters.resolveMaterialPricePerM2(piece)});
  return Object.fromEntries(parameters.pieces.flatMap((piece, index) => eligible.has(piece.id) ? [[piece.id,
    Math.round((changed[index].pieceSubtotalValue - original[index].pieceSubtotalValue
      - (chargeMaterialLoss ? 0 : changed[index].materialLossValue - original[index].materialLossValue)) * 100) / 100,
  ]] : []));
}
export const belongsToPrincipal = (piece: QuotePiece, option: Pick<QuoteMaterialAlternative, 'principalMaterialId' | 'principalVariantKey'>) =>
  piece.materialId === option.principalMaterialId && (piece.materialVariantKey || '') === (option.principalVariantKey || '');

export function validateAlternative(option: QuoteMaterialAlternative, options: QuoteMaterialAlternative[], pieces: QuotePiece[]) {
  if (!option.id || !option.materialId || !option.principalMaterialId || option.materialId === option.principalMaterialId) return 'Selecione um material diferente do principal.';
  if (options.length > MAX_MATERIAL_ALTERNATIVES) return 'Limite de 100 alternativas por orçamento.';
  if (options.some((other) => other.id !== option.id && other.principalMaterialId === option.principalMaterialId
    && (other.principalVariantKey || '') === (option.principalVariantKey || '') && other.materialId === option.materialId
    && (other.materialVariantKey || '') === (option.materialVariantKey || ''))) return 'Este material já foi oferecido neste grupo.';
  if (!option.pieceIds.length || new Set(option.pieceIds).size !== option.pieceIds.length
    || option.pieceIds.some((id) => !pieces.some((piece) => piece.id === id && belongsToPrincipal(piece, option)))) return 'Revise as peças elegíveis: a aplicação do material principal foi alterada.';
  return '';
}

export function alternativeReviewReason(pieces: QuotePiece[], principal: Material | undefined, alternative: Material | undefined) {
  if (pieces.some((piece) => piece.pricingMode === 'manual')) return 'Revisão comercial necessária: peça com preço manual.';
  if (!principal || !alternative) return 'Revisão comercial necessária: material indisponível.';
  for (const field of ['thicknessLabel', 'texture', 'materialType'] as const) {
    if (normalizeMaterialSearch(principal[field] || '') !== normalizeMaterialSearch(alternative[field] || '')) return 'Revisão comercial necessária: especificações de fabricação diferentes.';
  }
  return '';
}

export function calculateAlternativeTotal(config: QuoteMaterialAlternatives, originalTotal: number, productionDelta: number) {
  const delta = productionDelta * (1 + config.legacyComplexityPercent / 100);
  const before = calculateQuotePaymentTotals({...config.totalsInput, subtotalBeforeAdjustment: config.subtotalBeforeAdjustment}).totalPrice;
  const after = calculateQuotePaymentTotals({...config.totalsInput, subtotalBeforeAdjustment: config.subtotalBeforeAdjustment + delta}).totalPrice;
  return Math.round((originalTotal + after - before) * 100) / 100;
}

// A piece ID has one effective option. Replacing a choice never accumulates a previous delta.
export function simulateMaterialAlternatives(snapshot: QuotePresentationSnapshot, selections: MaterialSelections) {
  const config = snapshot.materialAlternatives;
  if (!config?.options.length) {
    if (Object.keys(selections).length) throw new Error('Esta proposta não oferece alternativas.');
    return {snapshot, total: Number(snapshot.investment?.totalPrice || 0), difference: 0, changes: []};
  }
  const options = new Map(config.options.map((option) => [option.id, option]));
  const pieces = snapshot.pieces || [];
  const pieceIds = new Set(pieces.map((piece) => piece.id));
  let deltaCents = 0;
  const changes = Object.entries(selections).sort(([a], [b]) => a.localeCompare(b)).map(([pieceId, optionId]) => {
    const option = options.get(optionId);
    if (!pieceIds.has(pieceId) || !option || option.reviewReason || !option.pieceIds.includes(pieceId) || !Number.isFinite(option.pieceDeltas[pieceId])) throw new Error('Escolha de material não autorizada para esta peça.');
    const delta = option.pieceDeltas[pieceId];
    deltaCents += Math.round(delta * 100);
    return {pieceId, optionId, materialName: option.material.name, delta};
  });
  const originalTotal = Number(snapshot.investment?.totalPrice || 0);
  const total = calculateAlternativeTotal(config, originalTotal, deltaCents / 100);
  let runningDelta = 0;
  let runningTotal = originalTotal;
  const pricedChanges = changes.map((change) => {
    runningDelta = Math.round((runningDelta + change.delta) * 100) / 100;
    const nextTotal = calculateAlternativeTotal(config, originalTotal, runningDelta);
    const difference = Math.round((nextTotal - runningTotal) * 100) / 100;
    runningTotal = nextTotal;
    return {...change, difference};
  });
  if (!changes.length) return {snapshot, total: originalTotal, difference: 0, changes};
  if (!Number.isFinite(total) || total < 0) throw new Error('Esta combinação exige revisão comercial.');
  const allocation = allocateQuotePresentationValues(pieces.map((piece) => ({
    pieceId: piece.id, baseValue: Number(piece.baseValue ?? piece.value ?? 0) + (selections[piece.id] ? options.get(selections[piece.id])!.pieceDeltas[piece.id] : 0),
  })), total);
  const effectivePieces = pieces.map((piece, index) => {
    const option = options.get(selections[piece.id]);
    const values = allocation.results[index];
    return {...piece, ...(option ? {materialId: option.materialId, materialName: option.material.name, material: option.material.name} : {}),
      value: values.finalValue, presentationFinalValue: values.finalValue, baseValue: values.baseValue,
      allocatedAdjustmentValue: values.allocatedAdjustmentValue, unitValue: values.finalValue / (piece.quantity || 1)};
  });
  const materials = new Map<string, NonNullable<QuotePresentationSnapshot['materials']>[number]>();
  const originals = snapshot.materials || (snapshot.material ? [snapshot.material] : []);
  effectivePieces.forEach((piece) => {
    const option = options.get(selections[piece.id]);
    const material = option?.material || originals.find((item) => item.id === piece.materialId);
    if (material) materials.set(material.id || material.name || '', material);
  });
  const effectiveSnapshot: QuotePresentationSnapshot = {...snapshot, pieces: effectivePieces, materials: [...materials.values()],
    investment: {...snapshot.investment, totalPrice: total}};
  return {snapshot: effectiveSnapshot, total, difference: Math.round((total - originalTotal) * 100) / 100, changes: pricedChanges};
}
