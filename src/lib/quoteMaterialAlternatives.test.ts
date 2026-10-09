import test from 'node:test';
import assert from 'node:assert/strict';
import {alternativeReviewReason, calculateAlternativePieceDeltas, calculateAlternativeTotal, simulateMaterialAlternatives, validateAlternative} from './quoteMaterialAlternatives';
import {buildPiecePricingBreakdowns} from './quotePiecePricing';
import {useQuoteCalculator} from '../hooks/useQuoteCalculator';
import {buildQuoteMaterialOptions, matchesMaterialSearch} from './quoteMaterials';
import type {Material, QuoteMaterialAlternative, QuoteMaterialAlternatives, QuotePiece, Settings} from '../types';
import type {QuotePresentationSnapshot} from './quoteDigital';

const stone = (id: string, pricePerM2 = 900): Material => ({id, name: id === 'main' ? 'Preto São Gabriel' : 'Branco Itaúnas', pricePerM2, provider: '', category: 'Nacional', active: true, materialType: 'Chapa', thicknessLabel: '2cm', texture: 'Polido'});
const pieces: QuotePiece[] = [{id: 'kitchen', name: 'Bancada cozinha', materialId: 'main', quantity: 3, area: 2, width: 1, length: 2, unit: 'm', sides: [], notes: '', complexityKey: 'normal'},
  {id: 'bath', name: 'Lavatório', materialId: 'main', quantity: 1, area: 1, width: 1, length: 1, unit: 'm', sides: [], notes: '', complexityKey: 'normal'}];
const option: QuoteMaterialAlternative = {id: 'alt', principalMaterialId: 'main', materialId: 'other', pieceIds: ['kitchen']};
const settings = {laborRatePerLinearMeter: 100, laborMinimumByRegion: {cities: []}, cutoutPrices: {}, sculptedSinkRates: {}, quoteComplexityOptions: [{key: 'normal', percent: 0, active: true}]} as unknown as Settings;
const {calculatePieceArea} = useQuoteCalculator(settings);
const pricing = (price: number, includeMaterialLoss = true) => buildPiecePricingBreakdowns({pieces, settings, calculatePieceArea,
  quoteCutouts: {cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0}, resolveMaterialPricePerM2: () => price, includeMaterialLoss});
const principal = pricing(900);
const alternate = pricing(1800);
export const config: QuoteMaterialAlternatives = {
  ruleVersion: 1, subtotalBeforeAdjustment: principal.reduce((sum, piece) => sum + piece.pieceSubtotalValue, 0), legacyComplexityPercent: 0,
  totalsInput: {paymentMode: 'total', entryAmount: 0, selectedAdjustment: 0, commissionPercent: 0, negotiationDiscountPercent: 0, rtPercent: 0},
  options: [{...option, material: stone('other', 1800), pricePerM2: 1800, standardPrice: 1800, minimumPrice: 800, pieceDeltas: {kitchen: alternate[0].pieceSubtotalValue - principal[0].pieceSubtotalValue}},
    {...option, id: 'cheaper', materialId: 'cheap', pieceIds: ['kitchen', 'bath'], material: stone('cheap', 500), pricePerM2: 500, standardPrice: 500, minimumPrice: 400,
      pieceDeltas: Object.fromEntries(pieces.map((piece, index) => [piece.id, pricing(500)[index].pieceSubtotalValue - principal[index].pieceSubtotalValue]))}],
};
export const snapshot: QuotePresentationSnapshot = {investment: {totalPrice: config.subtotalBeforeAdjustment}, materials: [stone('main')],
  pieces: pieces.map((piece, index) => ({id: piece.id, name: piece.name, quantity: piece.quantity, environment: piece.id, materialId: 'main', materialName: 'Preto São Gabriel', value: principal[index].pieceSubtotalValue, baseValue: principal[index].pieceSubtotalValue})), materialAlternatives: config};

test('adiciona uma ou várias alternativas e rejeita duplicatas/principal', () => {
  assert.equal(validateAlternative(option, [option], pieces), '');
  assert.equal(validateAlternative({...option, id: 'b', materialId: 'b'}, [option], pieces), '');
  assert.match(validateAlternative({...option, id: 'duplicate'}, [option], pieces), /já foi oferecido/);
  assert.match(validateAlternative({...option, materialId: 'main'}, [], pieces), /diferente/);
});
test('catálogo inclui ativos sem estoque; busca parcial e sem acentos por especificação', () => {
  const catalog = buildQuoteMaterialOptions([stone('main'), stone('other'), {...stone('inactive'), active: false}], []);
  assert.equal(catalog.length, 2);
  for (const search of ['itaunas', 'ITAÚNAS', 'chapa 2cm polido', 'itaú']) assert.ok(matchesMaterialSearch(catalog.find((material) => material.id === 'other')!, search));
  assert.equal(catalog[0].availableArea, 0);
});
test('aplicação a todas ou peças específicas preserva registros e quantidades', () => {
  assert.equal(validateAlternative({...option, pieceIds: pieces.map((piece) => piece.id)}, [], pieces), '');
  assert.match(validateAlternative({...option, pieceIds: ['foreign']}, [], pieces), /Revise/);
  assert.match(validateAlternative({...option, pieceIds: ['kitchen', 'kitchen']}, [], pieces), /Revise/);
  assert.equal(snapshot.pieces!.length, 2);
  assert.equal(config.options[0].pieceDeltas.kitchen, 5940); // 2m² × 3 × 900 + 10% loss, exactly once.
});
test('diferenças positivas/negativas, combinação independente e retorno ao principal', () => {
  assert.equal(simulateMaterialAlternatives(snapshot, {kitchen: 'alt'}).difference, 5940);
  assert.equal(simulateMaterialAlternatives(snapshot, {bath: 'cheaper'}).difference, -440);
  const mixed = simulateMaterialAlternatives(snapshot, {kitchen: 'alt', bath: 'cheaper'});
  assert.equal(mixed.difference, 5500);
  assert.equal(Math.round(mixed.snapshot.pieces!.reduce((sum, piece) => sum + Number(piece.value), 0) * 100) / 100, mixed.total);
  assert.equal(mixed.snapshot.pieces![0].quantity, 3);
  assert.deepEqual(mixed.snapshot.materials!.map((material) => material.id).sort(), ['cheap', 'other']);
  assert.deepEqual(simulateMaterialAlternatives(snapshot, {}).snapshot, snapshot);
});
test('cliques repetidos e ordem das escolhas não acumulam; original permanece intacto', () => {
  const original = JSON.stringify(snapshot);
  for (let i = 0; i < 100; i++) {
    simulateMaterialAlternatives(snapshot, {kitchen: i % 2 ? 'cheaper' : 'alt'});
    assert.equal(simulateMaterialAlternatives(snapshot, {}).total, snapshot.investment!.totalPrice);
  }
  assert.deepEqual(simulateMaterialAlternatives(snapshot, {bath: 'cheaper', kitchen: 'alt'}), simulateMaterialAlternatives(snapshot, {kitchen: 'alt', bath: 'cheaper'}));
  assert.equal(JSON.stringify(snapshot), original);
});
test('fonte única por peça rejeita material não oferecido e elegibilidade de outro grupo', () => {
  assert.throws(() => simulateMaterialAlternatives(snapshot, {bath: 'alt'}), /não autorizada/);
  assert.throws(() => simulateMaterialAlternatives(snapshot, {foreign: 'alt'}), /não autorizada/);
  assert.throws(() => simulateMaterialAlternatives(snapshot, {kitchen: 'arbitrary'}), /não autorizada/);
});
test('snapshot JSON conserva preço personalizado e funciona sem catálogo; antigos continuam iguais', () => {
  const roundtrip = JSON.parse(JSON.stringify(snapshot));
  roundtrip.materialAlternatives.options[0].pricePerM2 = 1950;
  roundtrip.materialAlternatives.options[0].customPriceInput = 'R$ 1.950,00';
  assert.equal(JSON.parse(JSON.stringify(roundtrip)).materialAlternatives.options[0].pricePerM2, 1950);
  assert.equal(simulateMaterialAlternatives(roundtrip, {kitchen: 'alt'}).difference, 5940);
  const old = {pieces: [{id: 'legacy'}], investment: {totalPrice: 1000}};
  assert.equal(simulateMaterialAlternatives(old, {}).snapshot, old);
  assert.throws(() => simulateMaterialAlternatives(old, {legacy: 'alt'}), /não oferece/);
});
test('preço manual ou fabricação diferente exige revisão e impede seleção', () => {
  assert.match(alternativeReviewReason([{...pieces[0], pricingMode: 'manual'}], stone('main'), stone('other')), /manual/);
  assert.match(alternativeReviewReason(pieces, stone('main'), {...stone('other'), thicknessLabel: '3cm'}), /especificações/);
  assert.equal(alternativeReviewReason(pieces, stone('main'), stone('other')), '');
  const reviewed = structuredClone(snapshot);
  reviewed.materialAlternatives!.options[0].reviewReason = 'Revisão necessária';
  assert.throws(() => simulateMaterialAlternatives(reviewed, {kitchen: 'alt'}), /não autorizada/);
});
test('arredondamento e perda seguem motor oficial; custos independentes não são duplicados', () => {
  const withLoss = pricing(1800)[0].pieceSubtotalValue - pricing(900)[0].pieceSubtotalValue;
  const withoutLoss = pricing(1800, false)[0].pieceSubtotalValue - pricing(900, false)[0].pieceSubtotalValue;
  assert.equal(withLoss, 5940);
  assert.equal(withoutLoss, 5400);
  assert.equal(pricing(1800)[0].laborValue, pricing(900)[0].laborValue);
});
test('total usa cálculo comercial existente, inclusive entrada cruzada e complexidade global', () => {
  const revised = {...config, legacyComplexityPercent: 10, totalsInput: {...config.totalsInput, paymentMode: 'entry' as const, entryAmount: config.subtotalBeforeAdjustment + 100, selectedAdjustment: 8, commissionPercent: 5, negotiationDiscountPercent: 2, rtPercent: 1}};
  assert.equal(calculateAlternativeTotal(revised, 10000, 0), 10000);
  assert.ok(calculateAlternativeTotal(revised, 10000, 1000) > 11100);
  assert.equal(calculateAlternativeTotal(revised, 10000, -1000), 8856);
});

test('preço personalizado recalcula só a alternativa daquele orçamento e persiste o resultado correto', () => {
  const parameters = {pieces, settings, calculatePieceArea, quoteCutouts: {cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0},
    resolveMaterialPricePerM2: () => 900, includeMaterialLoss: true};
  const customDeltas = calculateAlternativePieceDeltas(parameters, ['kitchen'], 1950, principal, true);
  assert.deepEqual(customDeltas, {kitchen: 6930});
  const custom = structuredClone(snapshot);
  custom.materialAlternatives!.options[0] = {...custom.materialAlternatives!.options[0], pricePerM2: 1950, customPriceInput: 'R$ 1.950,00', pieceDeltas: customDeltas};
  const reopened = JSON.parse(JSON.stringify(custom));
  assert.equal(simulateMaterialAlternatives(reopened, {kitchen: 'alt'}).difference, 6930);
  assert.equal(simulateMaterialAlternatives(snapshot, {kitchen: 'alt'}).difference, 5940);
  assert.equal(principal[0].pieceSubtotalValue, 6540);
});

test('diferença salva respeita perda desativada e preço principal personalizado', () => {
  const parameters = {pieces, settings, calculatePieceArea, quoteCutouts: {cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0},
    resolveMaterialPricePerM2: () => 1000, includeMaterialLoss: true};
  const customizedPrincipal = buildPiecePricingBreakdowns(parameters);
  assert.deepEqual(calculateAlternativePieceDeltas(parameters, ['kitchen'], 1800, customizedPrincipal, false), {kitchen: 4800});
  assert.deepEqual(calculateAlternativePieceDeltas(parameters, ['kitchen'], 1800, customizedPrincipal, true), {kitchen: 5280});
});
