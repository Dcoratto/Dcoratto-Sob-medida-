export type QuotePaymentMethodOption = {
  name: string;
  adjustment: number;
};

export type QuotePaymentMode = 'total' | 'entry';

export type QuotePaymentTotalsInput = {
  subtotalBeforeAdjustment: number;
  paymentMode: QuotePaymentMode;
  entryAmount: number;
  selectedAdjustment: number;
  commissionPercent: number;
  negotiationDiscountPercent: number;
  rtPercent: number;
};

export type QuotePaymentTotals = {
  adjustmentBase: number;
  adjustmentValue: number;
  paymentAdjustedTotal: number;
  commissionValue: number;
  negotiationDiscountValue: number;
  rtValue: number;
  totalPrice: number;
};

export type QuotePaymentSimulationContext = {
  officialTotalPrice: number;
  officialPaymentMode?: QuotePaymentMode;
  officialTotalPaymentMethod?: string;
  officialRemainingPaymentMethod?: string;
  officialEntryAmount?: number;
  paymentMode: QuotePaymentMode;
  totalPaymentMethod?: string;
  remainingPaymentMethod?: string;
  entryAmount?: number;
  simulationPaymentMode?: QuotePaymentMode;
  simulationEntryAmount?: number;
  commissionPercent?: number;
  negotiationDiscountPercent?: number;
  rtPercent?: number;
  paymentMethods?: QuotePaymentMethodOption[];
};

export type QuotePaymentSimulationOption = {
  methodName: string;
  adjustment: number;
  subtotalBeforeAdjustment: number;
  financedAmount: number;
  totalPrice: number;
  installmentCount: number;
  installmentAmount: number;
  entryAmount: number;
  paymentMode: QuotePaymentMode;
  isCurrent: boolean;
};

const normalizePercent = (value?: number) => Math.max(0, Number(value) || 0);

const resolveOfficialPaymentMode = (context: QuotePaymentSimulationContext): QuotePaymentMode =>
  context.officialPaymentMode
  || context.paymentMode
  || ((Number(context.officialEntryAmount ?? context.entryAmount) || 0) > 0 ? 'entry' : 'total');

const resolveOfficialEntryAmount = (context: QuotePaymentSimulationContext) =>
  Math.max(0, Number(context.officialEntryAmount ?? context.entryAmount) || 0);

const resolveOfficialMethodName = (context: QuotePaymentSimulationContext) => {
  const officialPaymentMode = resolveOfficialPaymentMode(context);
  return officialPaymentMode === 'entry'
    ? context.officialRemainingPaymentMethod || context.remainingPaymentMethod
    : context.officialTotalPaymentMethod || context.totalPaymentMethod;
};

const resolveSimulationEntryAmount = (context: QuotePaymentSimulationContext) =>
  Math.max(0, Number(context.simulationEntryAmount ?? context.entryAmount ?? 0) || 0);

const resolveSimulationPaymentMode = (context: QuotePaymentSimulationContext): QuotePaymentMode => {
  if (context.simulationPaymentMode) return context.simulationPaymentMode;
  return resolveSimulationEntryAmount(context) > 0 ? 'entry' : 'total';
};

export const parseInstallmentCountFromMethod = (value?: string) => {
  const match = String(value || '').match(/(\d{1,2})\s*x/i);
  return match ? Math.max(1, Number(match[1]) || 1) : 1;
};

export const findPaymentMethodAdjustment = (
  paymentMethods: QuotePaymentMethodOption[] = [],
  methodName?: string,
) => paymentMethods.find((method) => method.name === methodName)?.adjustment || 0;

export const calculateQuotePaymentTotals = ({
  subtotalBeforeAdjustment,
  paymentMode,
  entryAmount,
  selectedAdjustment,
  commissionPercent,
  negotiationDiscountPercent,
  rtPercent,
}: QuotePaymentTotalsInput): QuotePaymentTotals => {
  const normalizedSubtotal = Math.max(0, Number(subtotalBeforeAdjustment) || 0);
  const normalizedEntryAmount = Math.min(Math.max(Number(entryAmount) || 0, 0), normalizedSubtotal);
  const normalizedAdjustment = Number(selectedAdjustment) || 0;
  const financedAmount = Math.max(0, normalizedSubtotal - normalizedEntryAmount);
  const adjustmentBase = paymentMode === 'entry' ? financedAmount : normalizedSubtotal;
  const adjustmentValue = adjustmentBase * (normalizedAdjustment / 100);
  const paymentAdjustedTotal = normalizedSubtotal + adjustmentValue;
  const normalizedCommissionPercent = normalizePercent(commissionPercent);
  const normalizedNegotiationDiscountPercent = normalizePercent(negotiationDiscountPercent);
  const normalizedRtPercent = normalizePercent(rtPercent);
  const commissionValue = paymentAdjustedTotal * (normalizedCommissionPercent / 100);
  const negotiationDiscountValue = paymentAdjustedTotal * (normalizedNegotiationDiscountPercent / 100);
  const rtValue = paymentAdjustedTotal * (normalizedRtPercent / 100);
  const totalPrice = paymentAdjustedTotal + commissionValue - negotiationDiscountValue + rtValue;

  return {
    adjustmentBase,
    adjustmentValue,
    paymentAdjustedTotal,
    commissionValue,
    negotiationDiscountValue,
    rtValue,
    totalPrice,
  };
};

export const calculateQuoteInstallmentAmount = ({
  totalPrice,
  paymentMode,
  entryAmount,
  installmentCount,
}: {
  totalPrice: number;
  paymentMode: QuotePaymentMode;
  entryAmount: number;
  installmentCount: number;
}) => {
  const normalizedTotalPrice = Math.max(0, Number(totalPrice) || 0);
  const normalizedEntryAmount = Math.max(0, Number(entryAmount) || 0);
  const normalizedInstallmentCount = Math.max(1, Number(installmentCount) || 1);
  const installmentBase = paymentMode === 'entry'
    ? Math.max(0, normalizedTotalPrice - normalizedEntryAmount)
    : normalizedTotalPrice;
  return normalizedInstallmentCount > 0 ? installmentBase / normalizedInstallmentCount : installmentBase;
};

const resolvePricingMultiplier = ({
  commissionPercent,
  negotiationDiscountPercent,
  rtPercent,
}: {
  commissionPercent?: number;
  negotiationDiscountPercent?: number;
  rtPercent?: number;
}) => (
  1
  + (normalizePercent(commissionPercent) / 100)
  - (normalizePercent(negotiationDiscountPercent) / 100)
  + (normalizePercent(rtPercent) / 100)
);

export const deriveSubtotalBeforeAdjustmentFromOfficialTotal = ({
  officialTotalPrice,
  officialPaymentMode,
  officialTotalPaymentMethod,
  officialRemainingPaymentMethod,
  officialEntryAmount,
  paymentMode,
  totalPaymentMethod,
  remainingPaymentMethod,
  entryAmount,
  commissionPercent,
  negotiationDiscountPercent,
  rtPercent,
  paymentMethods,
}: QuotePaymentSimulationContext) => {
  const normalizedOfficialTotalPrice = Math.max(0, Number(officialTotalPrice) || 0);
  if (!normalizedOfficialTotalPrice) return 0;

  const multiplier = resolvePricingMultiplier({commissionPercent, negotiationDiscountPercent, rtPercent});
  if (multiplier <= 0) return null;

  const normalizedEntryAmount = Math.max(0, Number(officialEntryAmount ?? entryAmount) || 0);
  const resolvedOfficialPaymentMode = officialPaymentMode || paymentMode || 'total';
  const currentMethodName = resolvedOfficialPaymentMode === 'entry'
    ? officialRemainingPaymentMethod || remainingPaymentMethod
    : officialTotalPaymentMethod || totalPaymentMethod;
  const selectedAdjustment = findPaymentMethodAdjustment(paymentMethods || [], currentMethodName);
  const selectedAdjustmentRatio = selectedAdjustment / 100;
  const paymentAdjustedTotal = normalizedOfficialTotalPrice / multiplier;

  if (resolvedOfficialPaymentMode === 'entry') {
    const divisor = 1 + selectedAdjustmentRatio;
    if (divisor <= 0) return null;
    return (paymentAdjustedTotal + (normalizedEntryAmount * selectedAdjustmentRatio)) / divisor;
  }

  const divisor = 1 + selectedAdjustmentRatio;
  if (divisor <= 0) return null;
  return paymentAdjustedTotal / divisor;
};

export const resolveQuotePaymentSimulationBase = (
  context: QuotePaymentSimulationContext,
) => {
  const subtotalBeforeAdjustment = deriveSubtotalBeforeAdjustmentFromOfficialTotal(context);
  if (subtotalBeforeAdjustment == null) return null;

  const normalizedSubtotal = Math.max(0, Number(subtotalBeforeAdjustment) || 0);
  const normalizedOfficialEntryAmount = Math.min(resolveOfficialEntryAmount(context), normalizedSubtotal);

  return {
    subtotalBeforeAdjustment: normalizedSubtotal,
    officialPaymentMode: resolveOfficialPaymentMode(context),
    officialEntryAmount: normalizedOfficialEntryAmount,
    officialMethodName: resolveOfficialMethodName(context),
  };
};

export const buildQuotePaymentSimulationOptions = (
  context: QuotePaymentSimulationContext,
): QuotePaymentSimulationOption[] => {
  const paymentMethods = (context.paymentMethods || []).filter((method) => method?.name?.trim());
  if (!paymentMethods.length) return [];

  const simulationBase = resolveQuotePaymentSimulationBase(context);
  if (!simulationBase) return [];

  const paymentMode = resolveSimulationPaymentMode(context);
  const normalizedEntryAmount = Math.min(
    resolveSimulationEntryAmount(context),
    simulationBase.subtotalBeforeAdjustment,
  );
  const financedAmount = Math.max(0, simulationBase.subtotalBeforeAdjustment - normalizedEntryAmount);
  const isOfficialScenario = paymentMode === simulationBase.officialPaymentMode
    && Math.abs(normalizedEntryAmount - simulationBase.officialEntryAmount) < 0.000001;

  return paymentMethods.map((method) => {
    const totals = calculateQuotePaymentTotals({
      subtotalBeforeAdjustment: simulationBase.subtotalBeforeAdjustment,
      paymentMode,
      entryAmount: normalizedEntryAmount,
      selectedAdjustment: method.adjustment,
      commissionPercent: normalizePercent(context.commissionPercent),
      negotiationDiscountPercent: normalizePercent(context.negotiationDiscountPercent),
      rtPercent: normalizePercent(context.rtPercent),
    });
    const installmentCount = parseInstallmentCountFromMethod(method.name);
    const installmentAmount = calculateQuoteInstallmentAmount({
      totalPrice: totals.totalPrice,
      paymentMode,
      entryAmount: normalizedEntryAmount,
      installmentCount,
    });

    return {
      methodName: method.name,
      adjustment: method.adjustment,
      subtotalBeforeAdjustment: simulationBase.subtotalBeforeAdjustment,
      financedAmount,
      totalPrice: totals.totalPrice,
      installmentCount,
      installmentAmount,
      entryAmount: normalizedEntryAmount,
      paymentMode,
      isCurrent: isOfficialScenario && method.name === simulationBase.officialMethodName,
    };
  });
};
