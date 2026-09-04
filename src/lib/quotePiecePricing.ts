import {Settings, Quote, QuoteComplexityOption, QuotePiece} from '../types';
import {getRegionalLaborMinimum} from './laborRegion';
import {getEffectivePieceLinearLength} from './pieceDimensions';
import {
  buildCutoutCatalog,
  getCutoutLabel,
  getPieceScopedCutoutCounts,
  hasAnyScopedCutouts,
} from './quotePieceCutouts';

export type PieceCutoutRow = {
  label: string;
  count: number;
  price: number;
};

export type PiecePricingBreakdown = {
  stoneBaseValue: number;
  materialLossValue: number;
  calculatedLaborValue: number;
  calculatedCutoutValue: number;
  stoneWithLossValue: number;
  laborValue: number;
  cutoutValue: number;
  sinkAdditionalValue: number;
  complexityLabel: string;
  complexityPercent: number;
  complexityValue: number;
  ownSubtotalValue: number;
  pieceSubtotalValue: number;
  allocatedQuoteAdjustmentValue: number;
  pieceFinalValue: number;
  cutoutCount: number;
  cutoutRows: PieceCutoutRow[];
};

const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const buildPieceCutoutSummary = ({
  piece,
  pieces,
  quoteCutouts,
  settings,
}: {
  piece: QuotePiece;
  pieces: QuotePiece[];
  quoteCutouts: Quote['cutouts'];
  settings: Settings;
}) => {
  const scopedCutoutsExist = hasAnyScopedCutouts(pieces);
  const isLegacyFallbackPiece = !scopedCutoutsExist && pieces[0]?.id === piece.id;
  const pieceScopedCutouts = scopedCutoutsExist
    ? getPieceScopedCutoutCounts(piece)
    : {
      cooktop: isLegacyFallbackPiece ? Number(quoteCutouts?.cooktop || 0) : 0,
      sinkUnder: isLegacyFallbackPiece ? Number(quoteCutouts?.sinkUnder || 0) : 0,
      sinkOver: isLegacyFallbackPiece ? Number(quoteCutouts?.sinkOver || 0) : 0,
      faucetHole: isLegacyFallbackPiece ? Number(quoteCutouts?.faucetHole || 0) : 0,
      trashBinCutout: isLegacyFallbackPiece ? Number(quoteCutouts?.trashBinCutout || 0) : 0,
      popUpTowerCutout: isLegacyFallbackPiece ? Number(quoteCutouts?.popUpTowerCutout || 0) : 0,
      wetAreaAmericanRecess: isLegacyFallbackPiece ? Number(quoteCutouts?.wetAreaAmericanRecess || 0) : 0,
      wetAreaItalianRecess: isLegacyFallbackPiece ? Number(quoteCutouts?.wetAreaItalianRecess || 0) : 0,
    };

  const rows: PieceCutoutRow[] = buildCutoutCatalog(settings)
    .map((item) => ({
      label: getCutoutLabel(item.type),
      count: Number(pieceScopedCutouts[item.type] || 0),
      price: item.unitPrice,
    }))
    .filter((item) => item.count > 0);

  return {
    rows,
    totalCount: rows.reduce((sum, item) => sum + item.count, 0),
    totalValue: roundCurrency(rows.reduce((sum, item) => sum + item.count * item.price, 0)),
  };
};

export const calculatePieceLaborValue = (
  piece: QuotePiece,
  laborRatePerLinearMeter: number,
  regionalMinimum = 0,
) => {
  const largestSideM = piece.stair?.active
    ? Math.max(piece.stair.stepWidth || 0, (piece.stair.stepCount || 0) * (piece.stair.treadDepth || 0)) / (piece.stair.unit === 'cm' ? 100 : 1)
    : getEffectivePieceLinearLength(piece);
  const calculatedLabor = roundCurrency(laborRatePerLinearMeter * largestSideM);
  return roundCurrency(Math.max(calculatedLabor, regionalMinimum));
};

export const buildPiecePricingBreakdowns = ({
  pieces,
  quoteCutouts,
  totalQuotePrice,
  settings,
  calculatePieceArea,
  resolveMaterialPricePerM2,
  includeLabor = true,
  includeMaterialLoss = true,
  includeCutouts = true,
  includeSculptedSink = true,
  includeComplexity = true,
  complexityOptions,
  resolveManualPiecePrice,
  clientLocation,
}: {
  pieces: QuotePiece[];
  quoteCutouts: Quote['cutouts'];
  totalQuotePrice?: number;
  settings: Settings;
  calculatePieceArea: (piece: QuotePiece) => {totalArea: number; lossArea?: number; sinkAdditionalValue?: number};
  resolveMaterialPricePerM2: (piece: QuotePiece) => number;
  includeLabor?: boolean;
  includeMaterialLoss?: boolean;
  includeCutouts?: boolean;
  includeSculptedSink?: boolean;
  includeComplexity?: boolean;
  complexityOptions?: QuoteComplexityOption[];
  resolveManualPiecePrice?: (piece: QuotePiece) => number | undefined;
  clientLocation?: {city?: string; address?: string};
}) => {
  const regionalLaborMinimum = getRegionalLaborMinimum(settings, clientLocation || {});
  const activeComplexityOptions = (complexityOptions || settings.quoteComplexityOptions || [])
    .filter((option) => option.active !== false);
  const defaultComplexity = activeComplexityOptions.find((option) => Number(option.percent || 0) === 0)
    || activeComplexityOptions[0];
  const breakdowns = pieces.map((piece) => {
    const totals = calculatePieceArea(piece);
    const cutoutSummary = buildPieceCutoutSummary({piece, pieces, quoteCutouts, settings});
    const materialPricePerM2 = resolveMaterialPricePerM2(piece);
    const stoneBaseValue = roundCurrency((totals.totalArea || 0) * materialPricePerM2);
    const materialLossValue = includeMaterialLoss ? roundCurrency((totals.lossArea || 0) * materialPricePerM2) : 0;
    const stoneWithLossValue = roundCurrency(stoneBaseValue + materialLossValue);
    const calculatedLaborValue = calculatePieceLaborValue(piece, settings.laborRatePerLinearMeter, regionalLaborMinimum);
    const laborValue = includeLabor ? calculatedLaborValue : 0;
    const calculatedCutoutValue = cutoutSummary.totalValue;
    const cutoutValue = includeCutouts ? calculatedCutoutValue : 0;
    const sinkAdditionalValue = includeSculptedSink ? roundCurrency(totals.sinkAdditionalValue || 0) : 0;
    const ownSubtotalBeforeComplexity = roundCurrency(stoneWithLossValue + laborValue + cutoutValue + sinkAdditionalValue);
    const resolvedComplexity = activeComplexityOptions.find((option) => option.key === piece.complexityKey)
      || defaultComplexity;
    const complexityPercent = includeComplexity ? Number(resolvedComplexity?.percent || 0) : 0;
    const complexityValue = roundCurrency(ownSubtotalBeforeComplexity * (complexityPercent / 100));
    const automaticPieceSubtotalValue = roundCurrency(ownSubtotalBeforeComplexity + complexityValue);
    const manualPiecePrice = resolveManualPiecePrice?.(piece);
    const pieceSubtotalValue = typeof manualPiecePrice === 'number'
      ? roundCurrency(Math.max(0, manualPiecePrice))
      : automaticPieceSubtotalValue;
    const ownSubtotalValue = typeof manualPiecePrice === 'number'
      ? pieceSubtotalValue
      : ownSubtotalBeforeComplexity;

    return {
      stoneBaseValue,
      materialLossValue,
      calculatedLaborValue,
      calculatedCutoutValue,
      stoneWithLossValue,
      laborValue,
      cutoutValue,
      sinkAdditionalValue,
      complexityLabel: resolvedComplexity?.label || '',
      complexityPercent,
      complexityValue: typeof manualPiecePrice === 'number' ? 0 : complexityValue,
      ownSubtotalValue,
      pieceSubtotalValue,
      allocatedQuoteAdjustmentValue: 0,
      pieceFinalValue: pieceSubtotalValue,
      cutoutCount: cutoutSummary.totalCount,
      cutoutRows: cutoutSummary.rows,
    } satisfies PiecePricingBreakdown;
  });

  const subtotalCents = breakdowns.reduce((sum, item) => sum + Math.round(item.pieceSubtotalValue * 100), 0);
  const targetCents = Math.max(0, Math.round(Number(totalQuotePrice || 0) * 100));
  const diffCents = targetCents - subtotalCents;

  if (diffCents === 0 || !breakdowns.length) return breakdowns;

  const weights = breakdowns.map((item) => item.pieceSubtotalValue);
  const weightsTotal = weights.reduce((sum, value) => sum + value, 0);
  let remainingCents = diffCents;

  return breakdowns.map((item, index) => {
    let allocatedCents = 0;
    if (index === breakdowns.length - 1) {
      allocatedCents = remainingCents;
    } else if (weightsTotal > 0) {
      allocatedCents = Math.round(diffCents * (weights[index] / weightsTotal));
      remainingCents -= allocatedCents;
    } else {
      allocatedCents = Math.trunc(diffCents / breakdowns.length);
      remainingCents -= allocatedCents;
    }

    const allocatedQuoteAdjustmentValue = allocatedCents / 100;
    return {
      ...item,
      allocatedQuoteAdjustmentValue,
      pieceFinalValue: roundCurrency(item.pieceSubtotalValue + allocatedQuoteAdjustmentValue),
    };
  });
};
