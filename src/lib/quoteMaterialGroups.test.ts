import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProposalMaterialAlternatives} from '../components/ProposalMaterialAlternatives';
import {applyMaterialGroup, buildAlternativeGallery, buildOriginalMaterialGroups, resolveGroupAlternative, restoreMaterialGroup} from './quoteMaterialGroups';
import {simulateMaterialAlternatives} from './quoteMaterialAlternatives';
import type {QuotePresentationSnapshot} from './quoteDigital';

export function groupFixture(count: number): QuotePresentationSnapshot {
  return {investment: {totalPrice: 10000}, materials: Array.from({length: count}, (_, i) => ({id: `main-${i}`, name: `Principal ${i}`})),
    pieces: Array.from({length: count * 2}, (_, i) => ({id: `piece-${i}`, materialId: `main-${Math.floor(i / 2)}`, materialName: `Principal ${Math.floor(i / 2)}`,
      name: `Peça ${i}`, quantity: i % 2 ? 1 : 3, value: 10000 / (count * 2), baseValue: 10000 / (count * 2)})),
    materialAlternatives: {ruleVersion: 1, subtotalBeforeAdjustment: 10000, legacyComplexityPercent: 0,
      totalsInput: {paymentMode: 'total', entryAmount: 0, selectedAdjustment: 0, commissionPercent: 0, negotiationDiscountPercent: 0, rtPercent: 0},
      options: Array.from({length: count}, (_, i) => ({id: `option-${i}`, principalMaterialId: `main-${i}`, materialId: 'green', materialVariantKey: 'green|polido',
        material: {id: 'green', name: 'Verde Ubatuba', pricePerM2: 650, category: 'Granito', provider: '', texture: 'Polido', imageUrl: '/material-placeholder.svg'},
        pricePerM2: 650, standardPrice: 700, minimumPrice: 600, customPriceInput: 'R$ 650,00', pieceIds: [`piece-${i * 2}`, `piece-${i * 2 + 1}`],
        pieceDeltas: {[`piece-${i * 2}`]: -300, [`piece-${i * 2 + 1}`]: -100}}))}};
}

for (const count of [1, 2, 4]) test(`${count} materiais originais: galeria única, grupos completos e unidades`, () => {
  const snapshot = groupFixture(count);
  const groups = buildOriginalMaterialGroups(snapshot);
  assert.equal(groups.length, count);
  assert.equal(buildAlternativeGallery(snapshot).length, 1);
  const choices = applyMaterialGroup(snapshot, {}, groups[0].id, 'green');
  assert.deepEqual(Object.keys(choices).sort(), ['piece-0', 'piece-1']);
  assert.equal(groups[0].units, 4);
  const simulation = simulateMaterialAlternatives(snapshot, choices);
  assert.equal(simulation.total, 9600);
  assert.equal(simulation.snapshot.pieces![0].quantity, 3);
  assert.equal(simulation.snapshot.pieces![1].quantity, 1);
  assert.equal(snapshot.materialAlternatives!.options[0].pricePerM2, 650);
  if (count > 1) assert.equal(simulation.snapshot.pieces![2].materialId, 'main-1');
  const html = renderToStaticMarkup(createElement(ProposalMaterialAlternatives, {snapshot, selections: {}, disabled: false, onChange() {}, onConfirm() {}, onZoom() {}}));
  assert.equal((html.match(/aria-label="Galeria de materiais alternativos"/g) || []).length, 1);
  assert.equal((html.match(/aria-label="Escolher Verde Ubatuba"/g) || []).length, 1);
  assert.ok(!html.includes('Escolha o material de Peça'));
  assert.ok(!html.includes('Peça 0'));
});

test('substituições independentes, restauração por grupo e cliques sem acumular diferenças', () => {
  const snapshot = groupFixture(4);
  const original = JSON.stringify(snapshot);
  const [a, b] = buildOriginalMaterialGroups(snapshot);
  const one = applyMaterialGroup(snapshot, {}, a.id, 'green');
  const two = applyMaterialGroup(snapshot, one, b.id, 'green');
  assert.equal(simulateMaterialAlternatives(snapshot, two).total, 9200);
  for (let i = 0; i < 20; i++) assert.deepEqual(applyMaterialGroup(snapshot, two, a.id, 'green'), two);
  const restored = restoreMaterialGroup(snapshot, two, a.id);
  assert.deepEqual(restored, {'piece-2': 'option-1', 'piece-3': 'option-1'});
  assert.equal(simulateMaterialAlternatives(snapshot, restored).total, 9600);
  assert.deepEqual(buildOriginalMaterialGroups(snapshot).map((group) => group.materialId), ['main-0', 'main-1', 'main-2', 'main-3']);
  assert.equal(JSON.stringify(snapshot), original);
});

test('bloqueia elegibilidade parcial, revisão comercial, IDs externos e variantes ambíguas', () => {
  const snapshot = groupFixture(2);
  const [group] = buildOriginalMaterialGroups(snapshot);
  snapshot.materialAlternatives!.options[0].pieceIds = ['piece-0'];
  assert.throws(() => applyMaterialGroup(snapshot, {}, group.id, 'green'), /todas as peças/);
  assert.equal(resolveGroupAlternative(snapshot, group.id, 'catalog-only').selections, null);
  assert.throws(() => restoreMaterialGroup(snapshot, {}, 'foreign'), /não pertence/);
  snapshot.materialAlternatives!.options[0].pieceIds.push('piece-1');
  snapshot.materialAlternatives!.options[0].reviewReason = 'Acabamento diferente';
  assert.equal(resolveGroupAlternative(snapshot, group.id, 'green').selections, null);
  delete snapshot.materialAlternatives!.options[0].reviewReason;
  snapshot.materialAlternatives!.options.push({...snapshot.materialAlternatives!.options[0], id: 'ambiguous', materialVariantKey: 'green|escovado'});
  assert.equal(buildAlternativeGallery(snapshot).length, 1);
  assert.equal(resolveGroupAlternative(snapshot, group.id, 'green').selections, null);
});

test('opções distintas do mesmo material cobrem o grupo sem perder preços ou vínculos', () => {
  const snapshot = groupFixture(1);
  const first = snapshot.materialAlternatives!.options[0];
  snapshot.materialAlternatives!.options = [{...first, pieceIds: ['piece-0']}, {...first, id: 'specific', pieceIds: ['piece-1'], pricePerM2: 680}];
  const group = buildOriginalMaterialGroups(snapshot)[0];
  const choices = applyMaterialGroup(snapshot, {}, group.id, 'green');
  assert.deepEqual(choices, {'piece-0': 'option-0', 'piece-1': 'specific'});
  assert.equal(simulateMaterialAlternatives(snapshot, choices).total, 9600);
});

test('snapshots antigos e escolhas parciais já confirmadas continuam legíveis sem mutação', () => {
  const old: QuotePresentationSnapshot = {investment: {totalPrice: 123}, pieces: [{id: 'legacy', materialId: 'old'}]};
  assert.equal(buildAlternativeGallery(old).length, 0);
  assert.equal(simulateMaterialAlternatives(old, {}).total, 123);
  const snapshot = groupFixture(2);
  snapshot.materialSelection = {selections: {'piece-0': 'option-0'}, total: 9700, originalTotal: 10000, confirmedAt: '2026-10-09T00:00:00Z'};
  const reopened = JSON.parse(JSON.stringify(snapshot));
  const html = renderToStaticMarkup(createElement(ProposalMaterialAlternatives, {snapshot: reopened, selections: reopened.materialSelection.selections,
    disabled: true, onChange() {}, onConfirm() {}, onZoom() {}}));
  assert.ok(html.includes('Escolhas anteriores preservadas'));
  assert.deepEqual(reopened.materialSelection, snapshot.materialSelection);
  assert.equal(simulateMaterialAlternatives(reopened, reopened.materialSelection.selections).total, 9700);
});
