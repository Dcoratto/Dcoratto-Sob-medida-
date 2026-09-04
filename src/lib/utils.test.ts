import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrencyInputFromCents,
  formatPercentage,
  formatPercentageInputValue,
  normalizePercentageInput,
  parseCurrencyInputToCents,
} from './utils';

test('mascara monetaria interpreta digitacao como centavos', () => {
  assert.equal(formatCurrencyInputFromCents(0), 'R$ 0,00');
  assert.equal(formatCurrencyInputFromCents(parseCurrencyInputToCents('1')), 'R$ 0,01');
  assert.equal(formatCurrencyInputFromCents(parseCurrencyInputToCents('100')), 'R$ 1,00');
  assert.equal(formatCurrencyInputFromCents(parseCurrencyInputToCents('12990000')), 'R$ 129.900,00');
});

test('parse monetario preserva valores ja formatados em reais', () => {
  assert.equal(parseCurrencyInputToCents('R$ 129.900,00'), 12990000);
  assert.equal(parseCurrencyInputToCents('R$ 0,01'), 1);
  assert.equal(parseCurrencyInputToCents('-R$ 10,50'), -1050);
});

test('formatacao percentual usa pt-BR com no maximo quatro casas', () => {
  assert.equal(formatPercentage(21), '21%');
  assert.equal(formatPercentage(21.19), '21,19%');
  assert.equal(formatPercentage(21.196793802442404), '21,1968%');
  assert.equal(formatPercentage(5.0000), '5%');
  assert.equal(formatPercentage(0.125), '0,125%');
  assert.equal(formatPercentageInputValue(12.34567), '12,3457');
});

test('entrada percentual normaliza para quatro casas sem alterar formulas externas', () => {
  assert.equal(normalizePercentageInput('21,196793802442404'), 21.1968);
  assert.equal(normalizePercentageInput('21.196793802442404'), 21.1968);
});
