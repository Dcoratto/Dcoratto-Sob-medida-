type PieceMeasureLike = {
  length?: number;
  width?: number;
  largestSide?: number;
  smallestSide?: number;
};

const normalizeMeasure = (value?: number) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export const getPieceMajorMinorSides = (piece: PieceMeasureLike) => {
  const largestSide = normalizeMeasure(piece.largestSide);
  const smallestSide = normalizeMeasure(piece.smallestSide);

  if (largestSide && smallestSide) {
    return {
      major: Math.max(largestSide, smallestSide),
      minor: Math.min(largestSide, smallestSide),
    };
  }

  const length = normalizeMeasure(piece.length);
  const width = normalizeMeasure(piece.width);

  if (length && width) {
    return {
      major: Math.max(length, width),
      minor: Math.min(length, width),
    };
  }

  const fallback = Math.max(length, width, largestSide, smallestSide);
  return {
    major: fallback,
    minor: fallback,
  };
};
