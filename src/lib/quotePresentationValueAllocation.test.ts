import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateQuotePresentationValues} from './quotePresentationValueAllocation';

const sumFinalValues = (values: Array<{finalValue: number}>) => (
  Math.round(values.reduce((sum, item) => sum + item.finalValue, 0) * 100) / 100
);

test('CASO A rateia acrescimo proporcionalmente', () => {
  const allocation = allocateQuotePresentationValues([
    {pieceId: 'A', baseValue: 6000},
    {pieceId: 'B', baseValue: 3000},
    {pieceId: 'C', baseValue: 1000},
  ], 12000);

  assert.deepEqual(
    allocation.results.map((item) => item.finalValue),
    [7200, 3600, 1200],
  );
  assert.equal(sumFinalValues(allocation.results), 12000);
});

test('CASO B distribui desconto sem perder centavos', () => {
  const allocation = allocateQuotePresentationValues([
    {pieceId: 'A', baseValue: 6000},
    {pieceId: 'B', baseValue: 3000},
    {pieceId: 'C', baseValue: 1000},
  ], 9500);

  assert.equal(sumFinalValues(allocation.results), 9500);
  assert.deepEqual(
    allocation.results.map((item) => item.finalValue),
    [5700, 2850, 950],
  );
});

test('CASO C fecha exatamente cenarios com centavos residuais', () => {
  const allocation = allocateQuotePresentationValues([
    {pieceId: 'A', baseValue: 3333.33},
    {pieceId: 'B', baseValue: 3333.33},
    {pieceId: 'C', baseValue: 3333.34},
  ], 10000.01);

  assert.equal(sumFinalValues(allocation.results), 10000.01);
  assert.deepEqual(
    allocation.results.map((item) => item.finalValue),
    [3333.33, 3333.33, 3333.35],
  );
});

test('CASO D com uma unica peca usa o total oficial', () => {
  const allocation = allocateQuotePresentationValues([
    {pieceId: 'A', baseValue: 6000},
  ], 7500);

  assert.equal(allocation.results[0].finalValue, 7500);
  assert.equal(allocation.results[0].allocatedAdjustmentValue, 1500);
});

test('CASO E com diferenca zero preserva os valores', () => {
  const allocation = allocateQuotePresentationValues([
    {pieceId: 'A', baseValue: 6000},
    {pieceId: 'B', baseValue: 3000},
    {pieceId: 'C', baseValue: 1000},
  ], 10000);

  assert.deepEqual(
    allocation.results.map((item) => item.finalValue),
    [6000, 3000, 1000],
  );
  assert.equal(sumFinalValues(allocation.results), 10000);
});

test('trata soma base zero com fallback documentado e deterministico', () => {
  const allocation = allocateQuotePresentationValues([
    {pieceId: 'A', baseValue: 0},
    {pieceId: 'B', baseValue: 0},
    {pieceId: 'C', baseValue: 0},
  ], 150);

  assert.equal(allocation.mode, 'equal-zero-base');
  assert.equal(sumFinalValues(allocation.results), 150);
  assert.deepEqual(
    allocation.results.map((item) => item.finalValue),
    [50, 50, 50],
  );
});
