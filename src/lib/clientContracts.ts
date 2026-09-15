import {supabase} from './supabase';
import type {Client, ClientContract, ClientContractPiece, Quote} from '../types';
import {safeContractMoney, sumContractFinancialTotals} from './contractFinancials';

type Actor = {
  uid: string;
  name: string;
};

export type ContractClientSummary = Pick<Client, 'id' | 'name' | 'phone' | 'email' | 'cpf' | 'address' | 'city' | 'neighborhood'> & {
  contracts: ContractSummary[];
  contractCount: number;
  pieceCount: number;
  lifetimeValue: number;
  latestContractNumber?: string | null;
  latestContractDate?: string | null;
};

export type ContractSummary = ClientContract & {
  quote?: Pick<Quote, 'id' | 'environment' | 'status' | 'totalPrice'> | null;
  pieces: ClientContractPiece[];
};

export type ContractImportPieceDraft = {
  id?: string;
  label: string;
  pieceTypeKey?: string;
  value?: number | null;
};

const ensureSuccess = <T>(result: {data: T; error: {message?: string} | null}) => {
  if (result.error) {
    throw new Error(result.error.message || 'Nao foi possivel concluir a operacao.');
  }
  return result.data;
};

const mapContract = (row: any): ClientContract => ({
  id: row.id,
  empresaId: row.empresa_id,
  clientId: row.client_id,
  quoteId: row.quote_id || null,
  contractNumber: row.contract_number || '',
  contractDate: row.contract_date || null,
  contractTotal: row.contract_total === null || typeof row.contract_total === 'undefined' ? null : Number(row.contract_total),
  status: row.status || 'active',
  source: row.source || 'manual',
  reviewStatus: row.review_status || 'confirmed',
  sourceDocument: row.source_document || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at || null,
});

const mapPiece = (row: any): ClientContractPiece => ({
  id: row.id,
  empresaId: row.empresa_id,
  contractId: row.contract_id,
  quotePieceId: row.quote_piece_id || null,
  pieceLabel: row.piece_label || '',
  pieceTypeKey: row.piece_type_key || null,
  pieceTotal: row.piece_total === null || typeof row.piece_total === 'undefined' ? null : Number(row.piece_total),
  sortOrder: Number(row.sort_order) || 0,
  source: row.source || 'manual',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at || null,
});

const mapClient = (row: any): ContractClientSummary => ({
  id: row.id,
  name: row.name || '',
  phone: row.phone || '',
  email: row.email || '',
  cpf: row.cpf || '',
  address: row.address || '',
  city: row.city || '',
  neighborhood: row.neighborhood || '',
  contracts: [],
  contractCount: 0,
  pieceCount: 0,
  lifetimeValue: 0,
  latestContractNumber: null,
  latestContractDate: null,
});

export const listContractClients = async (search = '', limit = 40): Promise<ContractClientSummary[]> => {
  const normalized = search.trim().replace(/[%_,()]/g, '');
  let clientRequest = supabase
    .from('clients')
    .select('id,name,phone,email,cpf,address,city,neighborhood')
    .order('name', {ascending: true})
    .limit(limit);

  if (normalized) {
    clientRequest = clientRequest.or(`name.ilike.%${normalized}%,phone.ilike.%${normalized}%,cpf.ilike.%${normalized}%,email.ilike.%${normalized}%`);
  }

  const directClientRowsPromise = clientRequest.then((result) => ensureSuccess(result) as any[]);
  const matchingContractsPromise = normalized
    ? supabase
      .from('client_contracts')
      .select('client_id')
      .ilike('contract_number', `%${normalized}%`)
      .is('deleted_at', null)
      .limit(limit)
      .then((result) => ensureSuccess(result) as any[])
    : Promise.resolve([] as any[]);
  const [directClientRows, matchingContracts] = await Promise.all([
    directClientRowsPromise,
    matchingContractsPromise,
  ]);
  const extraClientIds = Array.from(new Set(matchingContracts.map((item) => item.client_id).filter(Boolean)));
  const extraClientRows = extraClientIds.length
    ? ensureSuccess(await supabase
      .from('clients')
      .select('id,name,phone,email,cpf,address,city,neighborhood')
      .in('id', extraClientIds)) as any[]
    : [];
  const clientRows = Array.from(new Map([...directClientRows, ...extraClientRows].map((item) => [item.id, item])).values()).slice(0, limit);
  if (clientRows.length === 0) return [];

  const clients = clientRows.map(mapClient);
  const clientIds = clients.map((item) => item.id);

  const contractRows = ensureSuccess(await supabase
    .from('client_contracts')
    .select('id,client_id,quote_id,contract_number,contract_date,contract_total,created_at')
    .in('client_id', clientIds)
    .is('deleted_at', null)
    .order('contract_date', {ascending: false})
    .order('created_at', {ascending: false})) as any[];
  const contractIds = contractRows.map((item) => item.id).filter(Boolean);
  const quoteIds = Array.from(new Set(contractRows.map((item) => item.quote_id).filter(Boolean)));
  const quoteRows = quoteIds.length
    ? ensureSuccess(await supabase
      .from('quotes')
      .select('id,total_price')
      .in('id', quoteIds)) as any[]
    : [];
  const quoteTotalsById = new Map(quoteRows.map((quote) => [quote.id, safeContractMoney(quote.total_price)]));
  const pieceRows = contractIds.length
    ? ensureSuccess(await supabase
      .from('client_contract_pieces')
      .select('id,contract_id')
      .in('contract_id', contractIds)
      .is('deleted_at', null)) as any[]
    : [];

  const contractsByClient = new Map<string, any[]>();
  contractRows.forEach((contract) => {
    const current = contractsByClient.get(contract.client_id) || [];
    current.push(contract);
    contractsByClient.set(contract.client_id, current);
  });

  const contractClientById = new Map(contractRows.map((contract) => [contract.id, contract.client_id]));
  const pieceCountByClient = new Map<string, number>();
  pieceRows.forEach((piece) => {
    const clientId = contractClientById.get(piece.contract_id);
    if (!clientId) return;
    pieceCountByClient.set(clientId, (pieceCountByClient.get(clientId) || 0) + 1);
  });

  return clients.map((client) => {
    const clientContracts = contractsByClient.get(client.id) || [];
    const latestContract = clientContracts[0] || null;
    return {
      ...client,
      contractCount: clientContracts.length,
      pieceCount: pieceCountByClient.get(client.id) || 0,
      lifetimeValue: sumContractFinancialTotals(clientContracts, quoteTotalsById),
      latestContractNumber: latestContract?.contract_number || null,
      latestContractDate: latestContract?.contract_date || null,
      contracts: [],
    };
  });
};

export const getContractClientSummary = async (clientId: string): Promise<ContractClientSummary | null> => {
  if (!clientId) return null;
  const clientRows = ensureSuccess(await supabase
    .from('clients')
    .select('id,name,phone,email,cpf,address,city,neighborhood')
    .eq('id', clientId)
    .limit(1)) as any[];
  const client = clientRows[0] ? mapClient(clientRows[0]) : null;
  if (!client) return null;

  const contractRows = ensureSuccess(await supabase
    .from('client_contracts')
    .select('id,client_id,quote_id,contract_number,contract_date,contract_total,created_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('contract_date', {ascending: false})
    .order('created_at', {ascending: false})) as any[];
  const contractIds = contractRows.map((item) => item.id).filter(Boolean);
  const quoteIds = Array.from(new Set(contractRows.map((item) => item.quote_id).filter(Boolean)));
  const quoteRows = quoteIds.length
    ? ensureSuccess(await supabase
      .from('quotes')
      .select('id,total_price')
      .in('id', quoteIds)) as any[]
    : [];
  const quoteTotalsById = new Map(quoteRows.map((quote) => [quote.id, safeContractMoney(quote.total_price)]));
  const pieceRows = contractIds.length
    ? ensureSuccess(await supabase
      .from('client_contract_pieces')
      .select('id,contract_id')
      .in('contract_id', contractIds)
      .is('deleted_at', null)) as any[]
    : [];
  const latestContract = contractRows[0] || null;

  return {
    ...client,
    contractCount: contractRows.length,
    pieceCount: pieceRows.length,
    lifetimeValue: sumContractFinancialTotals(contractRows, quoteTotalsById),
    latestContractNumber: latestContract?.contract_number || null,
    latestContractDate: latestContract?.contract_date || null,
  };
};

export const listContractsForClient = async (clientId: string): Promise<ContractSummary[]> => {
  if (!clientId) return [];
  const contracts = (ensureSuccess(await supabase
    .from('client_contracts')
    .select('id,empresa_id,client_id,quote_id,contract_number,contract_date,contract_total,status,source,review_status,source_document,created_at,updated_at,deleted_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('contract_date', {ascending: false})
    .order('created_at', {ascending: false})) as any[]).map(mapContract);

  if (contracts.length === 0) return [];
  const quoteIds = contracts.map((item) => item.quoteId).filter(Boolean) as string[];
  const quoteRows = quoteIds.length
    ? ensureSuccess(await supabase
      .from('quotes')
      .select('id,environment,status,total_price,pieces')
      .in('id', quoteIds)) as any[]
    : [];
  const presentationVersionRows = quoteIds.length
    ? ensureSuccess(await supabase
      .from('quote_presentation_versions')
      .select('quote_id,snapshot,created_at')
      .in('quote_id', quoteIds)
      .neq('status', 'REVOGADO')
      .order('created_at', {ascending: false})) as any[]
    : [];
  const pieces = (ensureSuccess(await supabase
    .from('client_contract_pieces')
    .select('id,empresa_id,contract_id,quote_piece_id,piece_label,piece_type_key,piece_total,sort_order,source,created_at,updated_at,deleted_at')
    .in('contract_id', contracts.map((item) => item.id))
    .is('deleted_at', null)
    .order('sort_order', {ascending: true})) as any[]).map(mapPiece);

  const piecesByContract = new Map<string, ClientContractPiece[]>();
  pieces.forEach((piece) => piecesByContract.set(piece.contractId, [...(piecesByContract.get(piece.contractId) || []), piece]));
  const quotesById = new Map<string, Pick<Quote, 'id' | 'environment' | 'status' | 'totalPrice'>>();
  const quotePiecesById = new Map<string, Map<string, number>>();
  quoteRows.forEach((quote: any) => quotesById.set(quote.id, {
    id: quote.id,
    environment: quote.environment || '',
    status: quote.status || '',
    totalPrice: Number(quote.total_price) || 0,
  }));
  presentationVersionRows.forEach((version: any) => {
    if (quotePiecesById.has(version.quote_id)) return;
    const piecesById = new Map<string, number>();
    const snapshotPieces = Array.isArray(version.snapshot?.pieces) ? version.snapshot.pieces : [];
    snapshotPieces.forEach((piece: any) => {
      if (!piece?.id) return;
      const finalValue = piece.presentationFinalValue ?? piece.value;
      const pieceValue = safeContractMoney(finalValue);
      if (pieceValue > 0) piecesById.set(piece.id, pieceValue);
    });
    quotePiecesById.set(version.quote_id, piecesById);
  });
  quoteRows.forEach((quote: any) => {
    if (quotePiecesById.has(quote.id)) return;
    const piecesById = new Map<string, number>();
    const quotePieces = Array.isArray(quote.pieces) ? quote.pieces : [];
    quotePieces.forEach((piece: any) => {
      if (!piece?.id) return;
      const presentationValue = safeContractMoney(piece.presentationValue);
      if (presentationValue > 0) piecesById.set(piece.id, presentationValue);
    });
    quotePiecesById.set(quote.id, piecesById);
  });

  return contracts.map((contract) => {
    const quote = contract.quoteId ? quotesById.get(contract.quoteId) || null : null;
    const quotePieceValues = contract.quoteId ? quotePiecesById.get(contract.quoteId) : null;
    return {
      ...contract,
      quote,
      pieces: (piecesByContract.get(contract.id) || []).map((piece) => ({
        ...piece,
        pieceTotal: piece.pieceTotal ?? (piece.quotePieceId ? quotePieceValues?.get(piece.quotePieceId) ?? null : null),
      })),
    };
  });
};

export const confirmClientContractImport = async (input: {
  clientId: string;
  contractNumber: string;
  contractDate?: string;
  quoteId?: string | null;
  contractTotal?: number | null;
  pieces: ContractImportPieceDraft[];
}, actor: Actor) => {
  return ensureSuccess(await supabase.rpc('confirm_client_contract_import', {
    p_client_id: input.clientId,
    p_contract_number: input.contractNumber,
    p_contract_date: input.contractDate || null,
    p_quote_id: input.quoteId || null,
    p_contract_total: input.contractTotal ?? null,
    p_pieces: input.pieces.map((piece) => ({
      id: piece.id || null,
      label: piece.label,
      pieceTypeKey: piece.pieceTypeKey || null,
      value: piece.value ?? null,
    })),
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  })) as string;
};
