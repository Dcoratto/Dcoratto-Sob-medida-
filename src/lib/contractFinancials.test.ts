import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveContractFinancialTotal, safeContractMoney, sumContractFinancialTotals} from './contractFinancials';

test('soma total comprado por cliente usando contratos realizados sem dividir por pecas', () => {
  const rows = [
    {client_id: 'cliente-1', quote_id: null, contract_total: 10000},
    {client_id: 'cliente-1', quote_id: null, contract_total: 15000},
    {client_id: 'cliente-1', quote_id: null, contract_total: 22850},
    {client_id: 'cliente-2', quote_id: null, contract_total: 999},
  ];

  assert.equal(sumContractFinancialTotals(rows, new Map(), 'cliente-1'), 47850);
});

test('usa total oficial do orcamento quando contrato nao tem total proprio', () => {
  const quoteTotals = new Map([['quote-1', 32100]]);
  const rows = [{client_id: 'cliente-1', quote_id: 'quote-1', contract_total: null}];

  assert.equal(sumContractFinancialTotals(rows, quoteTotals, 'cliente-1'), 32100);
});

test('total persistido no contrato tem prioridade sobre fallback do orcamento', () => {
  const total = resolveContractFinancialTotal({
    contractTotal: 25000,
    quote: {totalPrice: 99999},
  });

  assert.equal(total, 25000);
});

test('normaliza dinheiro invalido para zero sem criar valores negativos', () => {
  assert.equal(safeContractMoney(-10), 0);
  assert.equal(safeContractMoney('abc'), 0);
  assert.equal(safeContractMoney(100.129), 100.13);
});
