import {QuotePiece} from '../types';

const normalizePositive = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const resolveMainAreaFromDimensions = (piece: QuotePiece) => {
  if (piece.stair?.active) {
    const factor = piece.stair.unit === 'cm' ? 100 : 1;
    const stepCount = Math.max(0, piece.stair.stepCount || 0);
    const stepWidth = Math.max(0, piece.stair.stepWidth || 0) / factor;
    const treadDepth = Math.max(0, piece.stair.treadDepth || 0) / factor;
    const riserHeight = Math.max(0, piece.stair.riserHeight || 0) / factor;
    const landingCount = Math.max(0, piece.stair.landingCount || 0);
    const landingWidth = Math.max(0, piece.stair.landingWidth || 0) / factor;
    const landingDepth = Math.max(0, piece.stair.landingDepth || 0) / factor;
    const baseboardHeight = Math.max(0, piece.stair.baseboardHeight || 0) / factor;
    const sideCount = Number(Boolean(piece.stair.leftBaseboard)) + Number(Boolean(piece.stair.rightBaseboard));

    const treadArea = stepCount * stepWidth * treadDepth;
    const riserArea = stepCount * stepWidth * riserHeight;
    const landingArea = landingCount * landingWidth * landingDepth;
    const baseboardLinear = (stepCount * treadDepth) + (landingCount * landingDepth);
    const baseboardArea = sideCount * baseboardLinear * baseboardHeight;
    return treadArea + riserArea + landingArea + baseboardArea;
  }

  if (piece.unit === 'cm') {
    return (Number(piece.width || 0) * Number(piece.length || 0)) / 10000;
  }

  return Number(piece.width || 0) * Number(piece.length || 0);
};

export const getPieceAreaMode = (piece: QuotePiece) =>
  piece.areaMode === 'manual' ? 'manual' : 'dimensions';

export const getStoredDrawingArea = (piece: QuotePiece) => normalizePositive(piece.manualArea);

export const getStoredManualFinalArea = (piece: QuotePiece) => normalizePositive(piece.manualFinalArea);

export const getEffectivePieceBaseArea = (piece: QuotePiece) => {
  if (getPieceAreaMode(piece) === 'manual') {
    return getStoredManualFinalArea(piece);
  }

  const drawingArea = getStoredDrawingArea(piece);
  if (drawingArea > 0) return drawingArea;

  return resolveMainAreaFromDimensions(piece);
};
