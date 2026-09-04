import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPiecePricingBreakdowns} from './quotePiecePricing';
import {QuotePiece, Settings} from '../types';

const settings = {
  laborRatePerLinearMeter: 100,
  quoteComplexityOptions: [
    {key: 'normal', label: 'Normal', percent: 0, active: true, sortOrder: 0},
    {key: 'baixa', label: 'Baixa', percent: 1, active: true, sortOrder: 1},
    {key: 'media', label: 'Media', percent: 5, active: true, sortOrder: 2},
    {key: 'alta', label: 'Alta', percent: 10, active: true, sortOrder: 3},
  ],
  cutoutPrices: {
    cooktop: 500,
    sinkUnder: 0,
    sinkOver: 0,
    faucetHole: 0,
  },
  laborMinimumByRegion: {cities: []},
} as unknown as Settings;

const piece = (id: string, area: number, complexityKey?: string): QuotePiece => ({
  id,
  name: `Peça ${id}`,
  pricingMode: 'automatic',
  complexityKey,
  materialId: 'material-a',
  unit: 'm',
  width: 1,
  length: area,
  area,
  sides: [],
  notes: '',
});

const build = (
  pieces: QuotePiece[],
  totalQuotePrice?: number,
  options: {includeComplexity?: boolean; pricePerM2?: number} = {},
) => buildPiecePricingBreakdowns({
  pieces,
  quoteCutouts: {cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0},
  totalQuotePrice,
  settings,
  calculatePieceArea: (quotePiece) => ({
    totalArea: quotePiece.area,
    lossArea: quotePiece.area * 0.1,
    sinkAdditionalValue: 0,
  }),
  resolveMaterialPricePerM2: () => options.pricePerM2 ?? 1000,
  includeLabor: false,
  includeMaterialLoss: true,
  includeCutouts: true,
  includeSculptedSink: true,
  includeComplexity: options.includeComplexity ?? true,
  complexityOptions: settings.quoteComplexityOptions,
});

const sumFinalValues = (items: Array<{pieceFinalValue: number}>) => (
  Math.round(items.reduce((sum, item) => sum + item.pieceFinalValue, 0) * 100) / 100
);

test('TESTE 1 orçamento sem complexidade permanece com subtotal próprio atual', () => {
  const [breakdown] = build([piece('1', 10, 'normal')]);

  assert.equal(breakdown.stoneBaseValue, 10000);
  assert.equal(breakdown.materialLossValue, 1000);
  assert.equal(breakdown.complexityValue, 0);
  assert.equal(breakdown.pieceSubtotalValue, 11000);
});

test('TESTE 2 uma única peça com complexidade aumenta somente ela', () => {
  const [breakdown] = build([piece('1', 10, 'alta')]);

  assert.equal(breakdown.ownSubtotalValue, 11000);
  assert.equal(breakdown.complexityValue, 1100);
  assert.equal(breakdown.pieceSubtotalValue, 12100);
});

test('TESTE 3 duas peças com complexidades diferentes recebem apenas sua própria complexidade', () => {
  const [first, second] = build([piece('1', 10, 'baixa'), piece('2', 20, 'alta')]);

  assert.equal(first.complexityValue, 110);
  assert.equal(second.complexityValue, 2200);
  assert.equal(first.pieceSubtotalValue, 11110);
  assert.equal(second.pieceSubtotalValue, 24200);
});

test('TESTE 4 remover complexidade da peça volta ao valor sem acréscimo próprio', () => {
  const [withComplexity] = build([piece('1', 10, 'alta')]);
  const [withoutComplexity] = build([piece('1', 10, 'normal')]);

  assert.equal(withComplexity.pieceSubtotalValue, 12100);
  assert.equal(withoutComplexity.pieceSubtotalValue, 11000);
});

test('TESTE 5 ajustes globais são rateados e fecham exatamente', () => {
  const breakdowns = build([piece('1', 10, 'normal'), piece('2', 20, 'normal')], 40000);

  assert.equal(sumFinalValues(breakdowns), 40000);
  assert.equal(breakdowns.reduce((sum, item) => sum + item.allocatedQuoteAdjustmentValue, 0), 7000);
});

test('TESTE 9 valores com centavos preservam subtotal monetário', () => {
  const [breakdown] = build([piece('1', 3.33, 'media')], undefined, {pricePerM2: 1234.56});

  assert.equal(breakdown.stoneBaseValue, 4111.08);
  assert.equal(breakdown.materialLossValue, 411.11);
  assert.equal(breakdown.complexityValue, 226.11);
  assert.equal(breakdown.pieceSubtotalValue, 4748.3);
});

test('TESTE 10 rateio com divisão não exata fecha até o último centavo', () => {
  const breakdowns = build([
    piece('1', 1, 'normal'),
    piece('2', 1, 'normal'),
    piece('3', 1, 'normal'),
  ], 10000.01);

  assert.equal(sumFinalValues(breakdowns), 10000.01);
});

test('TESTE 11 complexidade individual permanece na estrutura salva e recarregada', () => {
  const savedPiece = piece('1', 10, 'alta');
  const reloadedPiece = JSON.parse(JSON.stringify(savedPiece)) as QuotePiece;
  const [breakdown] = build([reloadedPiece]);

  assert.equal(reloadedPiece.complexityKey, 'alta');
  assert.equal(breakdown.complexityValue, 1100);
});

test('TESTE 12 orçamento histórico sem complexityKey por peça não ganha complexidade individual silenciosa', () => {
  const [breakdown] = build([piece('1', 10)]);

  assert.equal(breakdown.complexityValue, 0);
  assert.equal(breakdown.pieceSubtotalValue, 11000);
});
