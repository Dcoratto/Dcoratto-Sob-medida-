import { QuotePiece, QuoteCutouts, Settings, Material, SculptedSink } from '../types';

const MATERIAL_LOSS_PERCENTAGE = 10;

export const useQuoteCalculator = (settings: Settings, materialForPiece?: (piece: QuotePiece) => Material | undefined) => {
  const calculateSculptedSink = (sink: SculptedSink, pieceMaterial?: Material) => {
    if (!sink.active) return { area: 0, baseArea: 0, lossArea: 0, value: 0, materialValue: 0, laborValue: 0, extraSinkValue: 0, lossValue: 0 };
    
    const factor = sink.unit === 'cm' ?100 : 1;
    const width = sink.width / factor;
    const length = sink.depth / factor;
    const depth = sink.height / factor;

    const areaFundo = width * length;
    const areaLaterais = 2 * (length * depth);
    const areaFrenteTraseira = 2 * (width * depth);
    const areaCuba = areaFundo + areaLaterais + areaFrenteTraseira;

    let laborBase = settings.sculptedSinkRates?.simple || 0;
    if (sink.drainType === 'Válvula oculta') {
      laborBase = settings.sculptedSinkRates?.hiddenValve || 0;
    }

    const hiddenDrainArea = sink.drainType === 'Ralo oculto' ?areaFundo * sink.quantity : 0;
    const baseArea = (areaCuba * sink.quantity) + hiddenDrainArea;
    const lossPercentage = MATERIAL_LOSS_PERCENTAGE;
    const lossArea = baseArea * (lossPercentage / 100);
    const totalArea = baseArea + lossArea;
    const materialValue = totalArea * (pieceMaterial?.pricePerM2 || 0);
    
    // Additional sinks (more than 1)
    const extraSinkValue = (sink.quantity - 1) * (settings.sculptedSinkRates?.extraSink || 0);
    const laborValue = laborBase;

    const totalValue = materialValue + laborValue + extraSinkValue;

    // The "additional" value is everything except the material cost which is handled by totalArea * m2
    const totalAdditionalValue = laborValue + extraSinkValue;

    return { 
      area: totalArea, 
      baseArea,
      lossArea,
      value: totalValue,
      additionalValue: totalAdditionalValue,
      materialValue,
      laborValue,
      extraSinkValue,
      lossValue: lossArea * (pieceMaterial?.pricePerM2 || 0),
      details: {
        fundo: areaFundo,
        laterais: areaLaterais,
        frenteTraseira: areaFrenteTraseira,
        raloOculto: hiddenDrainArea
      }
    };
  };

  const calculateWetAreaRecess = (piece: QuotePiece) => {
    const recess = piece.wetAreaRecess;
    if (!recess?.active) return 0;
    const factor = recess.unit === 'cm' ?100 : 1;
    return Math.max(0, recess.width / factor) * Math.max(0, recess.depth / factor);
  };

  const calculateStairArea = (piece: QuotePiece) => {
    const stair = piece.stair;
    if (!stair?.active) return {
      treadArea: 0,
      riserArea: 0,
      landingArea: 0,
      baseboardArea: 0,
      totalArea: 0,
    };

    const factor = stair.unit === 'cm' ?100 : 1;
    const stepCount = Math.max(0, stair.stepCount || 0);
    const stepWidth = Math.max(0, stair.stepWidth || 0) / factor;
    const treadDepth = Math.max(0, stair.treadDepth || 0) / factor;
    const riserHeight = Math.max(0, stair.riserHeight || 0) / factor;
    const landingCount = Math.max(0, stair.landingCount || 0);
    const landingWidth = Math.max(0, stair.landingWidth || 0) / factor;
    const landingDepth = Math.max(0, stair.landingDepth || 0) / factor;
    const baseboardHeight = Math.max(0, stair.baseboardHeight || 0) / factor;
    const sideCount = Number(Boolean(stair.leftBaseboard)) + Number(Boolean(stair.rightBaseboard));

    const treadArea = stepCount * stepWidth * treadDepth;
    const riserArea = stepCount * stepWidth * riserHeight;
    const landingArea = landingCount * landingWidth * landingDepth;
    const baseboardLinear = (stepCount * treadDepth) + (landingCount * landingDepth);
    const baseboardArea = sideCount * baseboardLinear * baseboardHeight;
    const totalArea = treadArea + riserArea + landingArea + baseboardArea;

    return {treadArea, riserArea, landingArea, baseboardArea, totalArea};
  };

  const calculatePieceArea = (piece: QuotePiece) => {
    // Area of main stone
    let mainArea = 0;
    const stairArea = calculateStairArea(piece);
    if (piece.stair?.active) {
      mainArea = stairArea.totalArea;
    } else if (piece.unit === 'cm') {
      mainArea = (piece.width * piece.length) / 10000;
    } else {
      mainArea = piece.width * piece.length;
    }
    
    // Area of side additions
    const sidesArea = piece.sides.reduce((acc, side) => {
      const sideArea = (side.length * side.height * side.quantity) / (piece.unit === 'cm' ?10000 : 1);
      return acc + sideArea;
    }, 0);

    // Sculpted sink area
    const sinkResult = piece.sculptedSink ?calculateSculptedSink(piece.sculptedSink, materialForPiece?.(piece)) : { area: 0, baseArea: 0, lossArea: 0, value: 0, additionalValue: 0 };
    const recessArea = calculateWetAreaRecess(piece);
    const subtotalArea = (piece.manualArea || mainArea) + sidesArea + sinkResult.baseArea + recessArea;
    const lossPercentage = MATERIAL_LOSS_PERCENTAGE;
    const pieceLossArea = subtotalArea * (lossPercentage / 100);

    return { 
      mainArea: piece.manualArea || mainArea, 
      sidesArea, 
      sinkArea: sinkResult.baseArea,
      stairArea: stairArea.totalArea,
      stairDetails: stairArea,
      lossArea: pieceLossArea,
      recessArea,
      sinkValue: sinkResult.value,
      sinkAdditionalValue: sinkResult.additionalValue,
      totalArea: subtotalArea
    };
  };

  const calculateLabor = (pieces: QuotePiece[]) => {
    return pieces.reduce((acc, p) => {
      // Labor per linear meter * largest side
      const largestDim = p.stair?.active ?Math.max(p.stair.stepWidth || 0, (p.stair.stepCount || 0) * (p.stair.treadDepth || 0)) : p.largestSide || Math.max(p.width, p.length);
      const unit = p.stair?.active ?p.stair.unit : p.unit;
      const largestSideM = largestDim / (unit === 'cm' ?100 : 1);
      return acc + (settings.laborRatePerLinearMeter * largestSideM);
    }, 0);
  };

  const calculateCutouts = (cutouts: QuoteCutouts) => {
    let total = 0;
    total += cutouts.cooktop * (settings.cutoutPrices?.cooktop || 0);
    total += cutouts.sinkUnder * (settings.cutoutPrices?.sinkUnder || 0);
    total += cutouts.sinkOver * (settings.cutoutPrices?.sinkOver || 0);
    total += (cutouts.faucetHole || 0) * (settings.cutoutPrices?.faucetHole || 0);
    total += (cutouts.trashBinCutout || 0) * (settings.cutoutPrices?.trashBinCutout || 0);
    total += (cutouts.popUpTowerCutout || 0) * (settings.cutoutPrices?.popUpTowerCutout || 0);
    total += (cutouts.wetAreaAmericanRecess || 0) * (settings.cutoutPrices?.wetAreaAmericanRecess || 0);
    total += (cutouts.wetAreaItalianRecess || 0) * (settings.cutoutPrices?.wetAreaItalianRecess || 0);
    return total;
  };

  const calculateTotal = (pieces: QuotePiece[], cutouts: QuoteCutouts, paymentMethodAdjustment: number) => {
    const totals = pieces.map(p => calculatePieceArea(p));
    const sinkAdditionalValue = totals.reduce((acc, t) => acc + (t.sinkAdditionalValue || 0), 0);
    
    const stonesCost = pieces.reduce((acc, piece, index) => {
      const pieceMaterial = materialForPiece?.(piece);
      return acc + totals[index].totalArea * (pieceMaterial?.pricePerM2 || 0);
    }, 0);
    const materialLossCost = pieces.reduce((acc, piece, index) => {
      const pieceMaterial = materialForPiece?.(piece);
      return acc + (totals[index].lossArea || 0) * (pieceMaterial?.pricePerM2 || 0);
    }, 0);
    const laborCost = calculateLabor(pieces);
    
    // Drawing cutouts update the quote cutout counters when the drawing is saved.
    // Charging only from the counters avoids duplicating the same recorte.
    let totalCutoutsCost = calculateCutouts(cutouts);

    const subtotal = stonesCost + materialLossCost + laborCost + totalCutoutsCost + sinkAdditionalValue;
    const adjustmentValue = subtotal * (paymentMethodAdjustment / 100);
    
    return subtotal + adjustmentValue;
  };

  return { calculatePieceArea, calculateTotal, calculateLabor, calculateCutouts, calculateSculptedSink, calculateStairArea };
};
