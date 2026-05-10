import { QuotePiece, QuoteCutouts, Settings, Material, SculptedSink } from '../types';

export const useQuoteCalculator = (settings: Settings, material?: Material) => {
  const calculateSculptedSink = (sink: SculptedSink) => {
    if (!sink.active) return { area: 0, value: 0, materialValue: 0, laborValue: 0, extraSinkValue: 0, lossValue: 0 };
    
    const factor = sink.unit === 'cm' ?100 : 1;
    const l = sink.width / factor;
    const p = sink.depth / factor;
    const h = sink.height / factor;

    const areaFundo = l * p;
    const areaLaterais = 2 * p * h;
    const areaFrenteTraseira = 2 * l * h;
    const areaCuba = areaFundo + areaLaterais + areaFrenteTraseira;

    let typeFactor = 1.0;
    let laborBase = settings.sculptedSinkRates?.simple || 0;

    if (sink.type === 'Com rampa') {
      typeFactor = 1.15;
      laborBase = settings.sculptedSinkRates?.ramp || 0;
    } else if (sink.type === 'Válvula oculta') {
      typeFactor = 1.25;
      laborBase = settings.sculptedSinkRates?.hiddenValve || 0;
    } else if (sink.type === 'Cuba dupla') {
      typeFactor = 1.10;
      laborBase = settings.sculptedSinkRates?.simple || 0; // Or another logic
    }

    const totalArea = areaCuba * sink.quantity * typeFactor;
    const materialValue = totalArea * (material?.pricePerM2 || 0);
    
    // Additional sinks (more than 1)
    const extraSinkValue = (sink.quantity - 1) * (settings.sculptedSinkRates?.extraSink || 0);
    const laborValue = laborBase;

    const subtotal = materialValue + laborValue + extraSinkValue;
    const lossPercentage = settings.sculptedSinkRates?.riskPercentage || 0;
    const lossValue = subtotal * (lossPercentage / 100);
    const totalValue = subtotal + lossValue;

    // The "additional" value is everything except the material cost which is handled by totalArea * m2
    const totalAdditionalValue = totalValue - materialValue;

    return { 
      area: totalArea, 
      value: totalValue,
      additionalValue: totalAdditionalValue,
      materialValue,
      laborValue,
      extraSinkValue,
      lossValue,
      details: {
        fundo: areaFundo,
        laterais: areaLaterais,
        frenteTraseira: areaFrenteTraseira,
        fator: typeFactor
      }
    };
  };

  const calculatePieceArea = (piece: QuotePiece) => {
    // Area of main stone
    let mainArea = 0;
    if (piece.unit === 'cm') {
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
    const sinkResult = piece.sculptedSink ?calculateSculptedSink(piece.sculptedSink) : { area: 0, value: 0, additionalValue: 0 };

    return { 
      mainArea: piece.manualArea || mainArea, 
      sidesArea, 
      sinkArea: sinkResult.area,
      sinkValue: sinkResult.value,
      sinkAdditionalValue: sinkResult.additionalValue,
      totalArea: (piece.manualArea || mainArea) + sidesArea + sinkResult.area 
    };
  };

  const calculateLabor = (pieces: QuotePiece[]) => {
    return pieces.reduce((acc, p) => {
      // Labor per linear meter * largest side
      const largestDim = p.largestSide || Math.max(p.width, p.length);
      const largestSideM = largestDim / (p.unit === 'cm' ?100 : 1);
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
    if (!material) return 0;
    
    const totals = pieces.map(p => calculatePieceArea(p));
    const totalArea = totals.reduce((acc, t) => acc + t.totalArea, 0);
    const sinkAdditionalValue = totals.reduce((acc, t) => acc + (t.sinkAdditionalValue || 0), 0);
    
    const stonesCost = totalArea * material.pricePerM2;
    const laborCost = calculateLabor(pieces);
    
    // Drawing cutouts update the quote cutout counters when the drawing is saved.
    // Charging only from the counters avoids duplicating the same recorte.
    let totalCutoutsCost = calculateCutouts(cutouts);

    const subtotal = stonesCost + laborCost + totalCutoutsCost + sinkAdditionalValue;
    const adjustmentValue = subtotal * (paymentMethodAdjustment / 100);
    
    return subtotal + adjustmentValue;
  };

  return { calculatePieceArea, calculateTotal, calculateLabor, calculateSculptedSink };
};
