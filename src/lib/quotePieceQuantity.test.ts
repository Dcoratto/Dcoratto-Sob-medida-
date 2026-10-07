import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {QuotePiece, Settings, Material} from '../types';
import {getPieceQuantity, getPieceTotalArea, getPieceReservationArea, getQuoteUnitCount, isValidPieceQuantity, MAX_PIECE_QUANTITY} from './quotePieceQuantity';
import {useQuoteCalculator} from '../hooks/useQuoteCalculator';
import {buildPieceCutoutSummary, buildPiecePricingBreakdowns, calculatePieceLaborValue} from './quotePiecePricing';
import {resolveQuoteCutoutSource} from './quotePieceCutouts';
import {calculateQuotePaymentTotals} from './quotePaymentSimulation';
import {MaterialApplicationDialog} from '../components/MaterialApplicationDialog';
import {PieceQuantityInput} from '../components/inputs/PieceQuantityInput';
import {planMaterialApplication} from './quoteMaterials';
import {validateQuoteBeforeSave} from './businessRules';

const settings = {
  laborRatePerLinearMeter: 100, laborMinimumByRegion: {altoTiete: 0, saoPaulo: 0},
  quoteComplexityOptions: [{key: 'normal', label: 'Normal', percent: 0, active: true}],
  cutoutPrices: {cooktop: 30, sinkUnder: 0, sinkOver: 0, faucetHole: 0},
} as unknown as Settings;
const material: Material = {id: 'stone', name: 'Preto', provider: '', category: '', pricePerM2: 1000, active: true};
const unit: QuotePiece = {id: 'a', name: 'Soleira', areaMode: 'manual', manualFinalArea: 0.331, manualLongestSide: 210, materialId: material.id, unit: 'cm', width: 15, length: 70, area: 0.331, sides: [], notes: ''};
const emptyCutouts = {cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0};
const calculator = useQuoteCalculator(settings, () => material);
const build = (pieces: QuotePiece[], options: {price?: number; globalCooktop?: number; totalQuotePrice?: number; manual?: boolean} = {}) => buildPiecePricingBreakdowns({
  pieces, quoteCutouts: {...emptyCutouts, cooktop: options.globalCooktop || 0}, settings,
  calculatePieceArea: calculator.calculatePieceArea, resolveMaterialPricePerM2: () => options.price ?? 1000,
  resolveManualPiecePrice: options.manual ? (piece) => piece.manualPrice : undefined,
  totalQuotePrice: options.totalQuotePrice,
});

test('legacy quantity defaults to one without modifying stored data or unit calculations', () => {
  const before = JSON.stringify(unit);
  assert.equal(getPieceQuantity(unit), 1);
  assert.deepEqual(build([unit]), build([{...unit, quantity: 1}]));
  assert.equal(calculator.calculatePieceArea({...unit, quantity: 3}).totalArea, 0.331);
  assert.equal(JSON.stringify(unit), before);
});

test('quantity validation rejects zero, negatives, decimals, non-numbers and abusive limits', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, -Infinity, '3', null, MAX_PIECE_QUANTITY + 1]) {
    assert.equal(isValidPieceQuantity(quantity), false);
    assert.equal(getPieceQuantity({quantity}), 1);
  }
  assert.equal(isValidPieceQuantity(1), true);
  assert.equal(isValidPieceQuantity(MAX_PIECE_QUANTITY), true);
});

test('invalid quantity is rejected before saving instead of silently using a fallback', () => {
  for (const quantity of [0, -3, 1.5, NaN, Infinity, 1001]) {
    assert.match(validateQuoteBeforeSave({clientId: 'client', selectedClient: {} as never, pieces: [{...unit, quantity}], totalArea: 0.331, totalPrice: 100, calculatePieceArea: calculator.calculatePieceArea}) || '', /quantidade inteira/);
  }
});

test('total area and physical units multiply while dimensions remain unitary', () => {
  const piece = {...unit, quantity: 3};
  assert.ok(Math.abs(getPieceTotalArea(piece, calculator.calculatePieceArea(piece).totalArea) - 0.993) < 0.0000001);
  assert.equal(getQuoteUnitCount([piece, {...unit, id: 'b', quantity: 2}]), 5);
  assert.equal(piece.manualFinalArea, 0.331);
  assert.equal(piece.manualLongestSide, 210);
});

test('automatic subtotal, material and loss repeat exactly once', () => {
  const [single] = build([unit]);
  const [triple] = build([{...unit, quantity: 3}]);
  assert.equal(triple.stoneBaseValue, 993);
  assert.equal(triple.materialLossValue, 99.3);
  assert.equal(triple.pieceSubtotalValue, Math.round(single.pieceSubtotalValue * 3 * 100) / 100);
  assert.equal(triple.unitSubtotalValue, single.pieceSubtotalValue);
});

test('manual price is unitary and repeated once', () => {
  const [result] = build([{...unit, quantity: 3, pricingMode: 'manual', manualPrice: 500}], {manual: true});
  assert.equal(result.unitSubtotalValue, 500);
  assert.equal(result.pieceSubtotalValue, 1500);
});

test('reservation consumption multiplies unit area and sides once without creating unit records', () => {
  const piece = {...unit, quantity: 3, sides: [{length: 100, height: 10, quantity: 2} as QuotePiece['sides'][number]]};
  assert.ok(Math.abs(getPieceReservationArea(piece) - 1.593) < 0.0000001);
  assert.equal(piece.sides.length, 1);
});

test('linear labor repeats the unit charge including the unit regional minimum', () => {
  assert.equal(calculatePieceLaborValue({...unit, quantity: 3}, 100), 630);
  assert.equal(calculator.calculateLabor([{...unit, quantity: 3}]), 630);
  assert.equal(calculatePieceLaborValue({...unit, quantity: 3}, 100, 300), 900);
});

test('piece cutouts repeat while explicitly global legacy cutouts are charged once', () => {
  const scoped = {...unit, quantity: 3, manualCutouts: [{type: 'cooktop' as const, quantity: 1}]};
  assert.equal(build([scoped])[0].cutoutValue, 90);
  assert.equal(build([scoped])[0].cutoutCount, 3);
  assert.equal(resolveQuoteCutoutSource([scoped], emptyCutouts).cooktop, 3);
  assert.equal(buildPieceCutoutSummary({piece: {...scoped, quantity: 1}, pieces: [scoped], quoteCutouts: emptyCutouts, settings}).rows[0].count, 1);
  assert.equal(build([{...unit, quantity: 3}], {globalCooktop: 1})[0].cutoutValue, 30);
});

test('custom material price and complexity repeat unit amounts without double multiplication', () => {
  assert.equal(build([{...unit, quantity: 3}], {price: 900})[0].stoneBaseValue, 893.7);
  const complexSettings = {...settings, quoteComplexityOptions: [{key: 'complex', label: 'Complex', percent: 5, active: true, sortOrder: 0}]};
  const run = (quantity: number) => buildPiecePricingBreakdowns({pieces: [{...unit, quantity}], quoteCutouts: emptyCutouts, settings: complexSettings, calculatePieceArea: calculator.calculatePieceArea, resolveMaterialPricePerM2: () => 1234.56})[0];
  assert.equal(run(3).pieceSubtotalValue, Math.round(run(1).pieceSubtotalValue * 3 * 100) / 100);
});

test('nested sink and stair quantities retain their unit geometry and repeat only the piece', () => {
  const sinkPiece: QuotePiece = {...unit, sculptedSink: {active: true, drainType: 'Válvula oculta', quantity: 2, width: 50, depth: 40, height: 20, unit: 'cm', calculatedArea: 0, calculatedValue: 0}};
  const stairPiece: QuotePiece = {...unit, areaMode: 'dimensions', stair: {active: true, unit: 'cm', stepCount: 4, stepWidth: 100, treadDepth: 30, riserHeight: 15, landingCount: 1, landingWidth: 100, landingDepth: 100, leftBaseboard: true, rightBaseboard: false, baseboardHeight: 10}};
  for (const piece of [sinkPiece, stairPiece]) {
    const single = build([piece])[0];
    const repeated = {...piece, quantity: 3};
    assert.equal(calculator.calculatePieceArea(repeated).totalArea, calculator.calculatePieceArea(piece).totalArea);
    assert.equal(build([repeated])[0].pieceSubtotalValue, Math.round(single.pieceSubtotalValue * 3 * 100) / 100);
  }
});

test('changing 3 to 5 to 1 units recalculates immediately and payment receives the aggregate', () => {
  for (const quantity of [3, 5, 1]) {
    const subtotal = build([{...unit, quantity, manualPrice: 500}], {manual: true})[0].pieceSubtotalValue;
    const payment = calculateQuotePaymentTotals({subtotalBeforeAdjustment: subtotal, paymentMode: 'total', entryAmount: 0, selectedAdjustment: 0, commissionPercent: 0, negotiationDiscountPercent: 0, rtPercent: 0});
    assert.equal(payment.totalPrice, quantity * 500);
  }
});

test('global adjustment allocation uses aggregate subtotals without repeating the target total', () => {
  const results = build([{...unit, quantity: 3, manualPrice: 500}, {...unit, id: 'b', quantity: 2, manualPrice: 500}], {manual: true, totalQuotePrice: 2800});
  assert.equal(results.reduce((sum, item) => sum + item.pieceFinalValue, 0), 2800);
  assert.equal(results.length, 2);
});

test('JSON roundtrip and material application preserve quantity and a single record', () => {
  const reloaded = JSON.parse(JSON.stringify([{...unit, quantity: 3}])) as QuotePiece[];
  const applied = planMaterialApplication(reloaded, ['a'], {...material, id: 'other'}).pieces;
  assert.equal(applied.length, 1);
  assert.equal(applied[0].quantity, 3);
  assert.equal(build(applied)[0].quantity, 3);
});

test('material application renders one checkbox for one record with three units', () => {
  const markup = renderToStaticMarkup(createElement(MaterialApplicationDialog, {selection: {materialId: 'stone', mode: 'specific', selectedIds: ['a'], search: ''}, name: 'Preto', pieces: [{...unit, quantity: 3}], onChange: () => {}, onClose: () => {}, onApply: () => {}}));
  assert.equal((markup.match(/type="checkbox"/g) || []).length, 1);
  assert.match(markup, /3 un\./);
});

test('quantity control displays legacy one and plural units without duplicating the piece', () => {
  assert.match(renderToStaticMarkup(createElement(PieceQuantityInput, {onChange: () => {}})), /1 unidade/);
  assert.match(renderToStaticMarkup(createElement(PieceQuantityInput, {quantity: 3, onChange: () => {}})), /3 unidades/);
  assert.equal(getPieceQuantity({}), 1); // Old public snapshots use the same fallback.
});
