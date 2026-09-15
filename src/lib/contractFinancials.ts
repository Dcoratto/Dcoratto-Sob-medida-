import type {ClientContract, Quote} from '../types';

export const safeContractMoney = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : 0;
};

export const resolveContractFinancialTotal = (
  contract: Pick<ClientContract, 'contractTotal'> & {quote?: Pick<Quote, 'totalPrice'> | null},
) => {
  if (contract.contractTotal !== null && typeof contract.contractTotal !== 'undefined') {
    return safeContractMoney(contract.contractTotal);
  }
  return safeContractMoney(contract.quote?.totalPrice);
};

export const sumContractFinancialTotals = <T extends {
  client_id?: string;
  quote_id?: string | null;
  contract_total?: unknown;
}>(
  contractRows: T[],
  quoteTotalsById: Map<string, number>,
  clientId?: string,
) => contractRows
  .filter((contract) => !clientId || contract.client_id === clientId)
  .reduce((sum, contract) => {
    const storedTotal = contract.contract_total === null || typeof contract.contract_total === 'undefined'
      ? null
      : Number(contract.contract_total);
    const quoteTotal = contract.quote_id ? quoteTotalsById.get(contract.quote_id) : undefined;
    return sum + safeContractMoney(storedTotal ?? quoteTotal);
  }, 0);
