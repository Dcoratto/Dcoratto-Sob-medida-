import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuotePaymentSimulationOptions,
  calculateQuoteInstallmentBreakdown,
  calculateDesiredTotalAdjustment,
  calculateQuotePaymentTotals,
  validateQuoteSimulationEntryAmount,
} from './quotePaymentSimulation';

const baseContext = {
  officialTotalPrice: 10000,
  officialPaymentMode: 'total' as const,
  officialTotalPaymentMethod: 'Pix',
  paymentMode: 'total' as const,
  totalPaymentMethod: 'Pix',
  paymentMethods: [
    {name: 'Pix', adjustment: 0},
    {name: 'Crédito 10x', adjustment: 10},
  ],
};

test('CASO A preserva simulacao sem entrada aplicando ajuste no total', () => {
  const [pix, credit] = buildQuotePaymentSimulationOptions(baseContext);

  assert.equal(pix.totalPrice, 10000);
  assert.equal(pix.entryAmount, 0);
  assert.equal(credit.totalPrice, 11000);
  assert.equal(credit.installmentAmount, 1100);
});

test('CASO B aplica ajuste somente sobre saldo quando existe entrada', () => {
  const options = buildQuotePaymentSimulationOptions({
    ...baseContext,
    simulationPaymentMode: 'entry',
    simulationEntryAmount: 2000,
  });
  const credit = options.find((option) => option.methodName === 'Crédito 10x');

  assert.ok(credit);
  assert.equal(credit.balanceBeforeAdjustment, 8000);
  assert.equal(credit.financedAmount, 8800);
  assert.equal(credit.totalPrice, 10800);
  assert.equal(credit.installmentAmount, 880);
});

test('CASO C entrada igual ao total zera saldo financiado', () => {
  const [pix] = buildQuotePaymentSimulationOptions({
    ...baseContext,
    simulationPaymentMode: 'entry',
    simulationEntryAmount: 10000,
  });

  assert.equal(pix.balanceBeforeAdjustment, 0);
  assert.equal(pix.financedAmount, 0);
  assert.equal(pix.totalPrice, 10000);
});

test('CASO D bloqueia entrada maior que o total base', () => {
  assert.equal(
    validateQuoteSimulationEntryAmount({entryAmount: 10000.01, subtotalBeforeAdjustment: 10000}),
    'A entrada não pode ser maior que o valor base da proposta.',
  );
  assert.deepEqual(buildQuotePaymentSimulationOptions({
    ...baseContext,
    simulationPaymentMode: 'entry',
    simulationEntryAmount: 10000.01,
  }), []);
});

test('CASO E bloqueia entrada negativa', () => {
  assert.equal(
    validateQuoteSimulationEntryAmount({entryAmount: -0.01, subtotalBeforeAdjustment: 10000}),
    'A entrada não pode ser negativa.',
  );
  assert.deepEqual(buildQuotePaymentSimulationOptions({
    ...baseContext,
    simulationPaymentMode: 'entry',
    simulationEntryAmount: -0.01,
  }), []);
});

test('CASO F suporta centavos sem aplicar ajuste sobre a entrada', () => {
  const totals = calculateQuotePaymentTotals({
    subtotalBeforeAdjustment: 1000.55,
    paymentMode: 'entry',
    entryAmount: 100.25,
    selectedAdjustment: 10,
    commissionPercent: 0,
    negotiationDiscountPercent: 0,
    rtPercent: 0,
  });

  assert.equal(totals.adjustmentBase, 900.3);
  assert.equal(totals.adjustmentValue, 90.03);
  assert.equal(totals.totalPrice, 1090.58);
});

test('CASO G fecha o total quando parcelas geram centavos residuais', () => {
  const breakdown = calculateQuoteInstallmentBreakdown({
    totalPrice: 1000,
    paymentMode: 'total',
    entryAmount: 0,
    installmentCount: 3,
  });

  assert.equal(breakdown.installmentAmount, 333.33);
  assert.equal(breakdown.lastInstallmentAmount, 333.34);
  assert.equal((breakdown.installmentAmount * 2) + breakdown.lastInstallmentAmount, 1000);
});

test('CASO H mantem entrada fora do saldo financiado mesmo com comissao', () => {
  const totals = calculateQuotePaymentTotals({
    subtotalBeforeAdjustment: 10000,
    paymentMode: 'entry',
    entryAmount: 2000,
    selectedAdjustment: 10,
    commissionPercent: 5,
    negotiationDiscountPercent: 0,
    rtPercent: 0,
  });

  assert.equal(totals.adjustmentBase, 8000);
  assert.equal(totals.adjustmentValue, 800);
  assert.equal(totals.paymentAdjustedTotal, 10800);
  assert.equal(totals.totalPrice, 11340);
});

test('CASO I helper compartilhado gera o mesmo total usado pelo simulador', () => {
  const directTotals = calculateQuotePaymentTotals({
    subtotalBeforeAdjustment: 10000,
    paymentMode: 'entry',
    entryAmount: 2000,
    selectedAdjustment: 10,
    commissionPercent: 0,
    negotiationDiscountPercent: 0,
    rtPercent: 0,
  });
  const credit = buildQuotePaymentSimulationOptions({
    ...baseContext,
    simulationPaymentMode: 'entry',
    simulationEntryAmount: 2000,
  }).find((option) => option.methodName === 'Crédito 10x');

  assert.ok(credit);
  assert.equal(credit.totalPrice, directTotals.totalPrice);
  assert.equal(credit.installmentTotalAmount + credit.entryAmount, credit.totalPrice);
});

test('TESTE 6 total desejado maior calcula acréscimo necessário', () => {
  const adjustment = calculateDesiredTotalAdjustment({
    desiredTotalPrice: 150000,
    paymentAdjustedTotal: 129900,
    commissionPercent: 0,
  });

  assert.ok(adjustment);
  assert.equal(adjustment.direction, 'increase');
  assert.equal(Number(adjustment.rtPercent.toFixed(6)), 15.473441);

  const totals = calculateQuotePaymentTotals({
    subtotalBeforeAdjustment: 129900,
    paymentMode: 'total',
    entryAmount: 0,
    selectedAdjustment: 0,
    commissionPercent: 0,
    negotiationDiscountPercent: adjustment.negotiationDiscountPercent,
    rtPercent: adjustment.rtPercent,
  });
  assert.equal(totals.totalPrice, 150000);
});

test('TESTE 7 total desejado menor calcula desconto necessário', () => {
  const adjustment = calculateDesiredTotalAdjustment({
    desiredTotalPrice: 90000,
    paymentAdjustedTotal: 100000,
    commissionPercent: 0,
  });

  assert.ok(adjustment);
  assert.equal(adjustment.direction, 'discount');
  assert.equal(Number(adjustment.negotiationDiscountPercent.toFixed(6)), 10);
  assert.equal(adjustment.rtPercent, 0);

  const totals = calculateQuotePaymentTotals({
    subtotalBeforeAdjustment: 100000,
    paymentMode: 'total',
    entryAmount: 0,
    selectedAdjustment: 0,
    commissionPercent: 0,
    negotiationDiscountPercent: adjustment.negotiationDiscountPercent,
    rtPercent: adjustment.rtPercent,
  });
  assert.equal(totals.totalPrice, 90000);
});

test('TESTE 8 total desejado igual ao atual zera ajuste comercial', () => {
  const adjustment = calculateDesiredTotalAdjustment({
    desiredTotalPrice: 100000,
    paymentAdjustedTotal: 100000,
    commissionPercent: 0,
  });

  assert.ok(adjustment);
  assert.equal(adjustment.direction, 'none');
  assert.equal(adjustment.calculatedPercent, 0);
});
