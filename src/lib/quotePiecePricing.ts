import {Settings, Quote, QuotePiece} from '../types';

type QuoteCutoutState = {
  cooktop: number;
  sinkUnder: number;
  sinkOver: number;
  faucetHole: number;
  trashBinCutout: number;
  popUpTowerCutout: number;
  wetAreaAmericanRecess: number;
  wetAreaItalianRecess: number;
};

export type PieceCutoutRow = {
  label: string;
  count: number;
  price: number;
};

export type PiecePricingBreakdown = {
  stoneBaseValue: number;
  materialLossValue: number;
  stoneWithLossValue: number;
  laborValue: number;
  cutoutValue: number;
  sinkAdditionalValue: number;
  pieceSubtotalValue: number;
  allocatedQuoteAdjustmentValue: number;
  pieceFinalValue: number;
  cutoutCount: number;
  cutoutRows: PieceCutoutRow[];
};

const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const countPieceDrawingCutouts = (drawingCutouts?: QuotePiece['cutouts']): QuoteCutoutState => {
  const counts: QuoteCutoutState = {
    cooktop: 0,
    sinkUnder: 0,
    sinkOver: 0,
    faucetHole: 0,
    trashBinCutout: 0,
    popUpTowerCutout: 0,
    wetAreaAmericanRecess: 0,
    wetAreaItalianRecess: 0,
  };

  (drawingCutouts || []).forEach((item) => {
    if (item.type === 'cooktop') counts.cooktop += 1;
    if (item.type === 'torneira') counts.faucetHole += 1;
    if (item.type === 'cuba') counts.sinkUnder += 1;
    if (item.type === 'lixeira') counts.trashBinCutout += 1;
    if (item.type === 'torre_tomada') counts.popUpTowerCutout += 1;
  });

  return counts;
};

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
  const pieceCutouts = countPieceDrawingCutouts(piece.cutouts);
  const sourceCutouts = piece.cutouts?.length || pieces.length !== 1
    ? pieceCutouts
    : {
      cooktop: quoteCutouts?.cooktop || 0,
      sinkUnder: quoteCutouts?.sinkUnder || 0,
      sinkOver: quoteCutouts?.sinkOver || 0,
      faucetHole: quoteCutouts?.faucetHole || 0,
      trashBinCutout: quoteCutouts?.trashBinCutout || 0,
      popUpTowerCutout: quoteCutouts?.popUpTowerCutout || 0,
      wetAreaAmericanRecess: quoteCutouts?.wetAreaAmericanRecess || 0,
      wetAreaItalianRecess: quoteCutouts?.wetAreaItalianRecess || 0,
    };

  const rows: PieceCutoutRow[] = [
    {label: 'Cooktop', count: sourceCutouts.cooktop || 0, price: settings.cutoutPrices?.cooktop || 0},
    {label: 'Cuba embutida', count: sourceCutouts.sinkUnder || 0, price: settings.cutoutPrices?.sinkUnder || 0},
    {label: 'Cuba sobreposta', count: sourceCutouts.sinkOver || 0, price: settings.cutoutPrices?.sinkOver || 0},
    {label: 'Furo torneira', count: sourceCutouts.faucetHole || 0, price: settings.cutoutPrices?.faucetHole || 0},
    {label: 'Lixeira', count: sourceCutouts.trashBinCutout || 0, price: settings.cutoutPrices?.trashBinCutout || 0},
    {label: 'Torre tomada', count: sourceCutouts.popUpTowerCutout || 0, price: settings.cutoutPrices?.popUpTowerCutout || 0},
    {label: 'Rebaixo americano', count: sourceCutouts.wetAreaAmericanRecess || 0, price: settings.cutoutPrices?.wetAreaAmericanRecess || 0},
    {label: 'Rebaixo italiano', count: sourceCutouts.wetAreaItalianRecess || 0, price: settings.cutoutPrices?.wetAreaItalianRecess || 0},
  ].filter((item) => item.count > 0);

  return {
    rows,
    totalCount: rows.reduce((sum, item) => sum + item.count, 0),
    totalValue: roundCurrency(rows.reduce((sum, item) => sum + item.count * item.price, 0)),
  };
};

export const calculatePieceLaborValue = (piece: QuotePiece, laborRatePerLinearMeter: number) => {
  const largestDim = piece.stair?.active
    ? Math.max(piece.stair.stepWidth || 0, (piece.stair.stepCount || 0) * (piece.stair.treadDepth || 0))
    : piece.largestSide || Math.max(piece.width, piece.length);
  const unit = piece.stair?.active ? piece.stair.unit : piece.unit;
  const largestSideM = largestDim / (unit === 'cm' ? 100 : 1);
  return roundCurrency(laborRatePerLinearMeter * largestSideM);
};

export const buildPiecePricingBreakdowns = ({
  pieces,
  quoteCutouts,
  totalQuotePrice,
  settings,
  calculatePieceArea,
  resolveMaterialPricePerM2,
  includeLabor = true,
  resolveManualPiecePrice,
}: {
  pieces: QuotePiece[];
  quoteCutouts: Quote['cutouts'];
  totalQuotePrice?: number;
  settings: Settings;
  calculatePieceArea: (piece: QuotePiece) => {totalArea: number; lossArea?: number; sinkAdditionalValue?: number};
  resolveMaterialPricePerM2: (piece: QuotePiece) => number;
  includeLabor?: boolean;
  resolveManualPiecePrice?: (piece: QuotePiece) => number | undefined;
}) => {
  const breakdowns = pieces.map((piece) => {
    const totals = calculatePieceArea(piece);
    const cutoutSummary = buildPieceCutoutSummary({piece, pieces, quoteCutouts, settings});
    const materialPricePerM2 = resolveMaterialPricePerM2(piece);
    const stoneBaseValue = roundCurrency((totals.totalArea || 0) * materialPricePerM2);
    const materialLossValue = roundCurrency((totals.lossArea || 0) * materialPricePerM2);
    const stoneWithLossValue = roundCurrency(stoneBaseValue + materialLossValue);
    const laborValue = includeLabor ? calculatePieceLaborValue(piece, settings.laborRatePerLinearMeter) : 0;
    const sinkAdditionalValue = roundCurrency(totals.sinkAdditionalValue || 0);
    const automaticPieceSubtotalValue = roundCurrency(stoneWithLossValue + laborValue + cutoutSummary.totalValue + sinkAdditionalValue);
    const manualPiecePrice = resolveManualPiecePrice?.(piece);
    const pieceSubtotalValue = typeof manualPiecePrice === 'number'
      ? roundCurrency(Math.max(0, manualPiecePrice))
      : automaticPieceSubtotalValue;

    return {
      stoneBaseValue,
      materialLossValue,
      stoneWithLossValue,
      laborValue,
      cutoutValue: cutoutSummary.totalValue,
      sinkAdditionalValue,
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
