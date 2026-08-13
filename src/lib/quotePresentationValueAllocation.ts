export type QuotePresentationAllocationInput = {
  pieceId: string;
  baseValue: number;
};

export type QuotePresentationAllocationMode =
  | 'unchanged'
  | 'proportional'
  | 'single-piece'
  | 'equal-zero-base';

export type QuotePresentationAllocationResult = {
  pieceId: string;
  baseValue: number;
  allocatedAdjustmentValue: number;
  finalValue: number;
};

export type QuotePresentationAllocationSummary = {
  mode: QuotePresentationAllocationMode;
  targetTotalValue: number;
  baseTotalValue: number;
  allocatedTotalValue: number;
  results: QuotePresentationAllocationResult[];
};

const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const toCents = (value: number) => Math.round((Number(value) || 0) * 100);

const fromCents = (value: number) => value / 100;

export const allocateQuotePresentationValues = (
  pieces: QuotePresentationAllocationInput[],
  targetTotalValue: number,
): QuotePresentationAllocationSummary => {
  const normalizedPieces = pieces.map((piece) => ({
    pieceId: piece.pieceId,
    baseCents: Math.max(0, toCents(piece.baseValue)),
  }));
  const targetTotalCents = Math.max(0, toCents(targetTotalValue));
  const baseTotalCents = normalizedPieces.reduce((sum, piece) => sum + piece.baseCents, 0);
  const diffCents = targetTotalCents - baseTotalCents;

  if (!normalizedPieces.length) {
    return {
      mode: 'unchanged',
      targetTotalValue: fromCents(targetTotalCents),
      baseTotalValue: fromCents(baseTotalCents),
      allocatedTotalValue: 0,
      results: [],
    };
  }

  if (normalizedPieces.length === 1) {
    const onlyPiece = normalizedPieces[0];
    return {
      mode: diffCents === 0 ? 'unchanged' : 'single-piece',
      targetTotalValue: fromCents(targetTotalCents),
      baseTotalValue: fromCents(baseTotalCents),
      allocatedTotalValue: fromCents(diffCents),
      results: [{
        pieceId: onlyPiece.pieceId,
        baseValue: fromCents(onlyPiece.baseCents),
        allocatedAdjustmentValue: fromCents(diffCents),
        finalValue: fromCents(targetTotalCents),
      }],
    };
  }

  if (diffCents === 0) {
    return {
      mode: 'unchanged',
      targetTotalValue: fromCents(targetTotalCents),
      baseTotalValue: fromCents(baseTotalCents),
      allocatedTotalValue: 0,
      results: normalizedPieces.map((piece) => ({
        pieceId: piece.pieceId,
        baseValue: fromCents(piece.baseCents),
        allocatedAdjustmentValue: 0,
        finalValue: fromCents(piece.baseCents),
      })),
    };
  }

  const absDiffCents = Math.abs(diffCents);
  const sign = diffCents >= 0 ? 1 : -1;
  const weightTotal = normalizedPieces.reduce((sum, piece) => sum + piece.baseCents, 0);
  const usesZeroBaseFallback = weightTotal === 0;
  const effectiveWeights = usesZeroBaseFallback
    ? normalizedPieces.map(() => 1)
    : normalizedPieces.map((piece) => piece.baseCents);
  const effectiveWeightTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0);

  const shares = normalizedPieces.map((piece, index) => {
    const numerator = absDiffCents * effectiveWeights[index];
    const allocatedBaseCents = Math.floor(numerator / effectiveWeightTotal);
    const remainderNumerator = numerator % effectiveWeightTotal;
    return {
      ...piece,
      allocatedBaseCents,
      remainderNumerator,
      weight: effectiveWeights[index],
      index,
    };
  });

  let remainingCents = absDiffCents - shares.reduce((sum, share) => sum + share.allocatedBaseCents, 0);
  shares
    .slice()
    .sort((left, right) => {
      if (right.remainderNumerator !== left.remainderNumerator) {
        return right.remainderNumerator - left.remainderNumerator;
      }
      if (right.weight !== left.weight) {
        return right.weight - left.weight;
      }
      return left.index - right.index;
    })
    .forEach((share) => {
      if (remainingCents <= 0) return;
      share.allocatedBaseCents += 1;
      remainingCents -= 1;
    });

  const results = shares
    .sort((left, right) => left.index - right.index)
    .map((share) => {
      const signedAdjustmentCents = share.allocatedBaseCents * sign;
      return {
        pieceId: share.pieceId,
        baseValue: fromCents(share.baseCents),
        allocatedAdjustmentValue: fromCents(signedAdjustmentCents),
        finalValue: fromCents(share.baseCents + signedAdjustmentCents),
      };
    });

  return {
    mode: usesZeroBaseFallback ? 'equal-zero-base' : 'proportional',
    targetTotalValue: roundCurrency(fromCents(targetTotalCents)),
    baseTotalValue: roundCurrency(fromCents(baseTotalCents)),
    allocatedTotalValue: roundCurrency(fromCents(diffCents)),
    results,
  };
};
