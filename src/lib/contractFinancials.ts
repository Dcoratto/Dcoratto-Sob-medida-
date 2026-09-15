import type {ClientContract, Quote} from '../types';

export type ContractFinancialSourceDocument = {
  financial?: {
    contractTotal?: unknown;
    pieces?: Array<{
      quotePieceId?: string | null;
      label?: string | null;
      sortOrder?: number | null;
      value?: unknown;
    }>;
  };
};

export const safeContractMoney = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : 0;
};

export const getSourceDocumentContractTotal = (sourceDocument?: ContractFinancialSourceDocument | Record<string, unknown> | null) => {
  const value = (sourceDocument as ContractFinancialSourceDocument | null | undefined)?.financial?.contractTotal;
  return value === null || typeof value === 'undefined' ? null : safeContractMoney(value);
};

export const getSourceDocumentPieceTotal = (
  sourceDocument: ContractFinancialSourceDocument | Record<string, unknown> | null | undefined,
  piece: {quotePieceId?: string | null; pieceLabel?: string | null; sortOrder?: number | null},
) => {
  const financialPieces = (sourceDocument as ContractFinancialSourceDocument | null | undefined)?.financial?.pieces;
  if (!Array.isArray(financialPieces)) return null;
  const match = financialPieces.find((item) => (
    (piece.quotePieceId && item.quotePieceId === piece.quotePieceId)
    || (Number(item.sortOrder) === Number(piece.sortOrder) && String(item.label || '') === String(piece.pieceLabel || ''))
  ));
  if (!match || match.value === null || typeof match.value === 'undefined') return null;
  return safeContractMoney(match.value);
};

export const resolveContractFinancialTotal = (
  contract: Pick<ClientContract, 'contractTotal' | 'sourceDocument'> & {quote?: Pick<Quote, 'totalPrice'> | null},
) => {
  if (contract.contractTotal !== null && typeof contract.contractTotal !== 'undefined') {
    return safeContractMoney(contract.contractTotal);
  }
  return safeContractMoney(contract.quote?.totalPrice ?? getSourceDocumentContractTotal(contract.sourceDocument));
};

export const sumContractFinancialTotals = <T extends {
  client_id?: string;
  quote_id?: string | null;
  source_document?: ContractFinancialSourceDocument | Record<string, unknown> | null;
}>(
  contractRows: T[],
  quoteTotalsById: Map<string, number>,
  clientId?: string,
) => contractRows
  .filter((contract) => !clientId || contract.client_id === clientId)
  .reduce((sum, contract) => {
    const sourceDocumentTotal = getSourceDocumentContractTotal(contract.source_document);
    const quoteTotal = contract.quote_id ? quoteTotalsById.get(contract.quote_id) : undefined;
    return sum + safeContractMoney(quoteTotal ?? sourceDocumentTotal);
  }, 0);
