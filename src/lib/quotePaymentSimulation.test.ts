import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuotePaymentSimulationOptions,
  calculateQuoteDisplayInstallmentAmount,
  calculateQuoteInstallmentBreakdown,
  calculateDesiredTotalAdjustment,
  calculateQuotePaymentTotals,
  currencyAmountToCents,
  currencyCentsToAmount,
  parseCurrencyInputToCents,
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

test('CASO G2 exibe parcela representativa sem mostrar ajuste da última parcela', () => {
  const breakdown = calculateQuoteInstallmentBreakdown({
    totalPrice: 41931.94,
    paymentMode: 'total',
    entryAmount: 0,
    installmentCount: 5,
  });
  const displayInstallmentAmount = calculateQuoteDisplayInstallmentAmount({
    installmentTotalAmount: breakdown.installmentTotalAmount,
    installmentCount: 5,
  });

  assert.equal(displayInstallmentAmount, 8386.39);
  assert.equal(breakdown.installmentAmount, 8386.38);
  assert.equal(breakdown.lastInstallmentAmount, 8386.42);
  assert.equal(Math.round(((breakdown.installmentAmount * 4) + breakdown.lastInstallmentAmount) * 100), 4193194);
});

test('CASO G3 exibição resumida funciona para várias quantidades de parcelas', () => {
  const scenarios = [
    {count: 3, expectedDisplay: 13977.31},
    {count: 6, expectedDisplay: 6988.66},
    {count: 7, expectedDisplay: 5990.28},
    {count: 9, expectedDisplay: 4659.1},
    {count: 10, expectedDisplay: 4193.19},
    {count: 11, expectedDisplay: 3811.99},
  ];

  scenarios.forEach(({count, expectedDisplay}) => {
    const breakdown = calculateQuoteInstallmentBreakdown({
      totalPrice: 41931.94,
      paymentMode: 'total',
      entryAmount: 0,
      installmentCount: count,
    });
    const displayInstallmentAmount = calculateQuoteDisplayInstallmentAmount({
      installmentTotalAmount: breakdown.installmentTotalAmount,
      installmentCount: count,
    });
    const internalTotal = (breakdown.installmentAmount * (count - 1)) + breakdown.lastInstallmentAmount;

    assert.equal(displayInstallmentAmount, expectedDisplay);
    assert.equal(Math.round(internalTotal * 100) / 100, 41931.94);
  });
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

const realProposalContext = {
  officialTotalPrice: 129900.2,
  officialPaymentMode: 'total' as const,
  officialTotalPaymentMethod: 'Crédito 10x',
  paymentMode: 'total' as const,
  totalPaymentMethod: 'Crédito 10x',
  commissionPercent: 5,
  negotiationDiscountPercent: 2,
  rtPercent: 3,
  paymentMethods: [
    {name: 'Pix', adjustment: 0},
    {name: 'Crédito 10x', adjustment: 10},
  ],
};

test('TESTE A caso real com entrada zero usa total oficial como saldo', () => {
  const entryCents = parseCurrencyInputToCents('R$ 0,00');
  const proposalTotalCents = currencyAmountToCents(realProposalContext.officialTotalPrice);
  const options = buildQuotePaymentSimulationOptions({
    ...realProposalContext,
    simulationPaymentMode: 'total',
    simulationEntryAmount: currencyCentsToAmount(entryCents),
  });
  const pix = options.find((option) => option.methodName === 'Pix');

  assert.equal(entryCents, 0);
  assert.equal(proposalTotalCents, 12990020);
  assert.equal(currencyCentsToAmount(proposalTotalCents - entryCents), 129900.2);
  assert.equal(validateQuoteSimulationEntryAmount({entryAmount: 0, subtotalBeforeAdjustment: 129900.2}), '');
  assert.ok(pix);
  assert.equal(pix.entryAmount, 0);
  assert.equal(pix.balanceBeforeAdjustment, 129900.2);
  assert.equal(pix.totalPrice, 129900.2);
});

test('TESTE B caso real com entrada de R$ 50.000,00 calcula saldo correto', () => {
  const entryCents = parseCurrencyInputToCents('R$ 50.000,00');
  const proposalTotalCents = currencyAmountToCents(realProposalContext.officialTotalPrice);
  const options = buildQuotePaymentSimulationOptions({
    ...realProposalContext,
    simulationPaymentMode: 'entry',
    simulationEntryAmount: currencyCentsToAmount(entryCents),
  });
  const pix = options.find((option) => option.methodName === 'Pix');

  assert.equal(entryCents, 5000000);
  assert.equal(currencyCentsToAmount(proposalTotalCents - entryCents), 79900.2);
  assert.equal(validateQuoteSimulationEntryAmount({entryAmount: 50000, subtotalBeforeAdjustment: 129900.2}), '');
  assert.ok(pix);
  assert.equal(pix.entryAmount, 50000);
  assert.equal(pix.balanceBeforeAdjustment, 79900.2);
  assert.equal(pix.financedAmount, 79900.2);
  assert.equal(pix.totalPrice, 129900.2);
});

test('TESTE C caso real permite entrada igual ao valor oficial', () => {
  const options = buildQuotePaymentSimulationOptions({
    ...realProposalContext,
    simulationPaymentMode: 'entry',
    simulationEntryAmount: 129900.2,
  });
  const pix = options.find((option) => option.methodName === 'Pix');

  assert.equal(validateQuoteSimulationEntryAmount({entryAmount: 129900.2, subtotalBeforeAdjustment: 129900.2}), '');
  assert.ok(pix);
  assert.equal(pix.balanceBeforeAdjustment, 0);
  assert.equal(pix.financedAmount, 0);
  assert.equal(pix.totalPrice, 129900.2);
});

test('TESTE D caso real bloqueia apenas entrada acima do valor oficial', () => {
  assert.equal(
    validateQuoteSimulationEntryAmount({entryAmount: 129900.21, subtotalBeforeAdjustment: 129900.2}),
    'A entrada não pode ser maior que o valor base da proposta.',
  );
  assert.deepEqual(buildQuotePaymentSimulationOptions({
    ...realProposalContext,
    simulationPaymentMode: 'entry',
    simulationEntryAmount: 129900.21,
  }), []);
});

test('TESTE E topo, base do simulador e formas partem do mesmo valor oficial', () => {
  const options = buildQuotePaymentSimulationOptions(realProposalContext);
  const pix = options.find((option) => option.methodName === 'Pix');
  const credit = options.find((option) => option.methodName === 'Crédito 10x');

  assert.ok(pix);
  assert.ok(credit);
  assert.equal(pix.subtotalBeforeAdjustment, realProposalContext.officialTotalPrice);
  assert.equal(pix.balanceBeforeAdjustment, realProposalContext.officialTotalPrice);
  assert.equal(pix.totalPrice, realProposalContext.officialTotalPrice);
  assert.equal(credit.balanceBeforeAdjustment, realProposalContext.officialTotalPrice);
});

test('TESTE F entradas sucessivas atualizam saldo, resumo e formas pelo valor atual', () => {
  const proposalTotalCents = currencyAmountToCents(realProposalContext.officialTotalPrice);
  const inputs = [
    ['R$ 0,00', 129900.2],
    ['R$ 10.000,00', 119900.2],
    ['R$ 50.000,00', 79900.2],
    ['R$ 25.000,00', 104900.2],
  ] as const;

  inputs.forEach(([input, expectedBalance]) => {
    const entryCents = parseCurrencyInputToCents(input);
    const entryAmount = currencyCentsToAmount(entryCents);
    const paymentMode = entryCents > 0 ? 'entry' : 'total';
    const options = buildQuotePaymentSimulationOptions({
      ...realProposalContext,
      simulationPaymentMode: paymentMode,
      simulationEntryAmount: entryAmount,
    });
    const pix = options.find((option) => option.methodName === 'Pix');

    assert.ok(pix);
    assert.equal(currencyCentsToAmount(proposalTotalCents - entryCents), expectedBalance);
    assert.equal(pix.entryAmount, entryAmount);
    assert.equal(pix.balanceBeforeAdjustment, expectedBalance);
    assert.equal(pix.totalPrice, 129900.2);
  });
});
