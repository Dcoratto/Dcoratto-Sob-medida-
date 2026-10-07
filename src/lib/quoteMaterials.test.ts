import assert from 'node:assert/strict';
import test from 'node:test';
import type {InventoryItem, Material, QuotePiece} from '../types';
import {buildQuoteMaterialOptions, catalogMaterialVariantKey, matchesMaterialSearch, planMaterialApplication} from './quoteMaterials';

const stone: Material = {id: 'stone', name: 'Preto São Gabriel', category: 'Nacional', provider: 'Fornecedor', materialLine: 'Nacional', materialType: 'Chapa', thicknessLabel: '2cm', texture: 'Polido', pricePerM2: 850, active: true};
const other: Material = {...stone, id: 'other', name: 'Azzurr Crystal'};
const pieces = [
  {id: 'a', name: 'WC', materialId: stone.id, materialVariantKey: catalogMaterialVariantKey(stone), width: 50, length: 100, drawingJson: 'preserved', manualPrice: 1000},
  {id: 'b', name: 'WC', materialId: other.id, materialVariantKey: catalogMaterialVariantKey(other), width: 80, length: 100, pieceStatus: 'Produção'},
  {id: 'c', name: 'Bancada', materialId: ''},
] as QuotePiece[];

test('search handles full and partial names, accents, casing, spaces and specifications', () => {
  for (const term of ['Preto São Gabriel', 'preto', 'sao', 'são gabriel', '  SÃO   GABRIEL  ', 'nacional chapa 2cm polido']) assert.equal(matchesMaterialSearch(stone, term), true, term);
  for (const term of ['crystal', 'azz', 'AZZURR']) assert.equal(matchesMaterialSearch(other, term), true, term);
  assert.equal(matchesMaterialSearch(stone, 'crystal'), false);
  assert.equal(matchesMaterialSearch(stone, ''), true);
});

test('catalog keeps distinct active materials with identical specs, including zero stock', () => {
  const options = buildQuoteMaterialOptions([stone, other, {...stone, id: 'inactive', active: false}], []);
  assert.deepEqual(new Set(options.map((material) => material.id)), new Set(['stone', 'other']));
  assert.equal(new Set(options.map((material) => material.variantKey)).size, 2);
  assert.ok(options.every((material) => material.availableArea === 0));
  assert.equal(planMaterialApplication(pieces, ['c'], options[0], options[0].variantKey).pieces[2].materialId, options[0].id);
});

test('stock is informational and merges lots without duplicating the catalog variant', () => {
  const lot = {...stone, materialId: stone.id, id: 'lot', status: 'disponivel', area: 10} as unknown as InventoryItem;
  const options = buildQuoteMaterialOptions([stone, other], [lot, {...lot, id: 'reserved', status: 'Reservada', area: 4}]);
  assert.equal(options.length, 2);
  const option = options.find((material) => material.id === stone.id)!;
  assert.equal(option.availableArea, 10);
  assert.equal(option.stockArea, 14);
  assert.equal(options.find((material) => material.id === other.id)!.availableArea, 0);
});

test('bulk plan detects replacement, preserves fields and does not mutate previous state', () => {
  const before = structuredClone(pieces);
  const plan = planMaterialApplication(pieces, pieces.map((piece) => piece.id), stone, catalogMaterialVariantKey(stone));
  assert.equal(plan.replacementCount, 1);
  assert.ok(plan.pieces.every((piece) => piece.materialId === stone.id));
  assert.equal(plan.pieces[0].manualPrice, 1000);
  assert.equal(plan.pieces[0].drawingJson, 'preserved');
  assert.equal(plan.pieces[1].pieceStatus, 'Produção');
  assert.deepEqual(pieces, before);
});

test('specific selection touches only selected piece IDs, even with duplicate names', () => {
  const plan = planMaterialApplication(pieces, ['b'], stone, catalogMaterialVariantKey(stone));
  assert.equal(plan.pieces[0], pieces[0]);
  assert.equal(plan.pieces[2], pieces[2]);
  assert.equal(plan.replacementCount, 1);
  assert.equal(plan.pieces[1].materialId, stone.id);
});

test('invalid selection fails completely without changing any piece', () => {
  const before = structuredClone(pieces);
  for (const ids of [[], ['a', 'a'], ['a', 'foreign-piece']]) assert.throws(() => planMaterialApplication(pieces, ids, stone));
  assert.throws(() => planMaterialApplication(pieces, ['a'], {...stone, active: false}));
  assert.deepEqual(pieces, before);
});

test('legacy assignments without a variant keep the default price key', () => {
  const plan = planMaterialApplication(pieces, ['c'], stone);
  assert.equal(plan.pieces[2].materialVariantKey, undefined);
});
