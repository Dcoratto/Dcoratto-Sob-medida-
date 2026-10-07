export const MAX_PIECE_QUANTITY = 1000;

export const isValidPieceQuantity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PIECE_QUANTITY;

export const getPieceQuantity = (piece: {quantity?: unknown}) =>
  isValidPieceQuantity(piece.quantity) ? piece.quantity : 1;

export const getQuoteUnitCount = (pieces: Array<{quantity?: unknown}>) =>
  pieces.reduce((total, piece) => total + getPieceQuantity(piece), 0);

export const getPieceTotalArea = (piece: {quantity?: unknown}, unitArea: number) =>
  unitArea * getPieceQuantity(piece);
import type {QuotePiece} from '../types';
import {getEffectivePieceBaseArea} from './quotePieceArea';


export const getPieceReservationArea = (piece: QuotePiece) => {
  const sidesArea = (piece.sides || []).reduce((sum, side) =>
    sum + ((side.length || 0) * (side.height || 0) * (side.quantity || 1)) / (piece.unit === 'cm' ? 10000 : 1), 0);
  return getPieceTotalArea(piece, getEffectivePieceBaseArea(piece) + sidesArea);
};
