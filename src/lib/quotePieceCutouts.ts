import {Quote, QuotePiece, QuotePieceCutoutItem, Settings} from '../types';

export type QuoteCutoutState = {
  cooktop: number;
  sinkUnder: number;
  sinkOver: number;
  faucetHole: number;
  trashBinCutout: number;
  popUpTowerCutout: number;
  wetAreaAmericanRecess: number;
  wetAreaItalianRecess: number;
};

export type PieceScopedCutoutType = QuotePieceCutoutItem['type'];

export type PieceCutoutCatalogItem = {
  type: PieceScopedCutoutType;
  label: string;
  unitPrice: number;
};

export const EMPTY_QUOTE_CUTOUTS: QuoteCutoutState = {
  cooktop: 0,
  sinkUnder: 0,
  sinkOver: 0,
  faucetHole: 0,
  trashBinCutout: 0,
  popUpTowerCutout: 0,
  wetAreaAmericanRecess: 0,
  wetAreaItalianRecess: 0,
};

const CUTOUT_LABELS: Record<PieceScopedCutoutType, string> = {
  cooktop: 'Cooktop',
  sinkUnder: 'Cuba embutida',
  sinkOver: 'Cuba sobreposta',
  faucetHole: 'Furo torneira',
  trashBinCutout: 'Lixeira',
  popUpTowerCutout: 'Torre tomada',
  wetAreaAmericanRecess: 'Rebaixo americano',
  wetAreaItalianRecess: 'Rebaixo italiano',
};

const DRAWING_TO_SCOPED_TYPE: Partial<Record<NonNullable<QuotePiece['cutouts']>[number]['type'], PieceScopedCutoutType>> = {
  cooktop: 'cooktop',
  cuba: 'sinkUnder',
  torneira: 'faucetHole',
  lixeira: 'trashBinCutout',
  torre_tomada: 'popUpTowerCutout',
};

const normalizeQuantity = (value: unknown) => {
  const quantity = Math.trunc(Number(value) || 0);
  return quantity > 0 ? quantity : 0;
};

export const buildCutoutCatalog = (settings: Settings): PieceCutoutCatalogItem[] => ([
  {type: 'cooktop', label: CUTOUT_LABELS.cooktop, unitPrice: Number(settings.cutoutPrices?.cooktop || 0)},
  {type: 'sinkUnder', label: CUTOUT_LABELS.sinkUnder, unitPrice: Number(settings.cutoutPrices?.sinkUnder || 0)},
  {type: 'sinkOver', label: CUTOUT_LABELS.sinkOver, unitPrice: Number(settings.cutoutPrices?.sinkOver || 0)},
  {type: 'faucetHole', label: CUTOUT_LABELS.faucetHole, unitPrice: Number(settings.cutoutPrices?.faucetHole || 0)},
  {type: 'trashBinCutout', label: CUTOUT_LABELS.trashBinCutout, unitPrice: Number(settings.cutoutPrices?.trashBinCutout || 0)},
  {type: 'popUpTowerCutout', label: CUTOUT_LABELS.popUpTowerCutout, unitPrice: Number(settings.cutoutPrices?.popUpTowerCutout || 0)},
  {type: 'wetAreaAmericanRecess', label: CUTOUT_LABELS.wetAreaAmericanRecess, unitPrice: Number(settings.cutoutPrices?.wetAreaAmericanRecess || 0)},
  {type: 'wetAreaItalianRecess', label: CUTOUT_LABELS.wetAreaItalianRecess, unitPrice: Number(settings.cutoutPrices?.wetAreaItalianRecess || 0)},
 ] satisfies PieceCutoutCatalogItem[]).filter((item) => item.unitPrice > 0);

export const countPieceDrawingCutouts = (drawingCutouts?: QuotePiece['cutouts']): QuoteCutoutState => {
  const counts = {...EMPTY_QUOTE_CUTOUTS};
  (drawingCutouts || []).forEach((item) => {
    const mappedType = DRAWING_TO_SCOPED_TYPE[item.type];
    if (!mappedType) return;
    counts[mappedType] += 1;
  });
  return counts;
};

export const normalizePieceManualCutouts = (manualCutouts?: QuotePiece['manualCutouts']) =>
  (manualCutouts || [])
    .map((item) => ({
      type: item.type,
      quantity: normalizeQuantity(item.quantity),
    }))
    .filter((item) => item.quantity > 0);

export const pieceHasScopedCutouts = (piece: QuotePiece) =>
  normalizePieceManualCutouts(piece.manualCutouts).length > 0;

export const getPieceScopedCutoutCounts = (piece: QuotePiece): QuoteCutoutState => {
  const manualCutouts = normalizePieceManualCutouts(piece.manualCutouts);
  if (manualCutouts.length > 0) {
    return manualCutouts.reduce((acc, item) => {
      acc[item.type] += item.quantity;
      return acc;
    }, {...EMPTY_QUOTE_CUTOUTS});
  }
  return countPieceDrawingCutouts(piece.cutouts);
};

export const buildQuoteCutoutTotalsFromPieces = (pieces: QuotePiece[]) =>
  pieces.reduce((acc, piece) => {
    const pieceCounts = getPieceScopedCutoutCounts(piece);
    (Object.keys(acc) as Array<keyof QuoteCutoutState>).forEach((key) => {
      acc[key] += Number(pieceCounts[key] || 0);
    });
    return acc;
  }, {...EMPTY_QUOTE_CUTOUTS});

export const hasAnyScopedCutouts = (pieces: QuotePiece[]) =>
  pieces.some((piece) => pieceHasScopedCutouts(piece) || Boolean(piece.cutouts?.length));

export const resolveQuoteCutoutSource = (pieces: QuotePiece[], quoteCutouts?: Quote['cutouts']) => {
  const pieceScopedTotals = buildQuoteCutoutTotalsFromPieces(pieces);
  const pieceScopedCount = Object.values(pieceScopedTotals).reduce((sum, value) => sum + value, 0);
  if (pieceScopedCount > 0) {
    return pieceScopedTotals;
  }
  return {
    ...EMPTY_QUOTE_CUTOUTS,
    ...(quoteCutouts || {}),
  };
};

export const updatePieceManualCutouts = (
  piece: QuotePiece,
  type: PieceScopedCutoutType,
  quantity: number,
) => {
  const nextQuantity = normalizeQuantity(quantity);
  const current = normalizePieceManualCutouts(piece.manualCutouts);
  const withoutType = current.filter((item) => item.type !== type);
  if (nextQuantity <= 0) return withoutType;
  return [...withoutType, {type, quantity: nextQuantity}];
};

export const getCutoutLabel = (type: PieceScopedCutoutType) => CUTOUT_LABELS[type];
