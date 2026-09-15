import {supabase} from './supabase';
import type {Client, ClientContract, ClientContractPiece, Quote} from '../types';

type Actor = {
  uid: string;
  name: string;
};

export type ContractClientSummary = Pick<Client, 'id' | 'name' | 'phone' | 'email' | 'cpf' | 'address' | 'city' | 'neighborhood'> & {
  contracts: ContractSummary[];
};

export type ContractSummary = ClientContract & {
  quote?: Pick<Quote, 'id' | 'environment' | 'status' | 'totalPrice'> | null;
  pieces: ClientContractPiece[];
};

export type ContractImportPieceDraft = {
  id?: string;
  label: string;
  pieceTypeKey?: string;
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

  const [contractRows, quoteRows] = await Promise.all([
    ensureSuccess(await supabase
      .from('client_contracts')
      .select('id,empresa_id,client_id,quote_id,contract_number,contract_date,status,source,review_status,source_document,created_at,updated_at,deleted_at')
      .in('client_id', clientIds)
      .is('deleted_at', null)
      .order('contract_date', {ascending: false})
      .order('created_at', {ascending: false})) as any[],
    ensureSuccess(await supabase
      .from('quotes')
      .select('id,environment,status,total_price,client_id')
      .in('client_id', clientIds)) as any[],
  ]);

  const contracts = contractRows.map(mapContract);
  const contractIds = contracts.map((item) => item.id);
  const pieceRows = contractIds.length
    ? ensureSuccess(await supabase
      .from('client_contract_pieces')
      .select('id,empresa_id,contract_id,quote_piece_id,piece_label,piece_type_key,sort_order,source,created_at,updated_at,deleted_at')
      .in('contract_id', contractIds)
      .is('deleted_at', null)
      .order('sort_order', {ascending: true})) as any[]
    : [];

  const piecesByContract = new Map<string, ClientContractPiece[]>();
  pieceRows.map(mapPiece).forEach((piece) => {
    const current = piecesByContract.get(piece.contractId) || [];
    current.push(piece);
    piecesByContract.set(piece.contractId, current);
  });

  const quotesById = new Map<string, Pick<Quote, 'id' | 'environment' | 'status' | 'totalPrice'>>();
  quoteRows.forEach((quote: any) => quotesById.set(quote.id, {
    id: quote.id,
    environment: quote.environment || '',
    status: quote.status || '',
    totalPrice: Number(quote.total_price) || 0,
  }));

  const contractsByClient = new Map<string, ContractSummary[]>();
  contracts.forEach((contract) => {
    const current = contractsByClient.get(contract.clientId) || [];
    current.push({
      ...contract,
      quote: contract.quoteId ? quotesById.get(contract.quoteId) || null : null,
      pieces: piecesByContract.get(contract.id) || [],
    });
    contractsByClient.set(contract.clientId, current);
  });

  return clients.map((client) => ({
    ...client,
    contracts: contractsByClient.get(client.id) || [],
  }));
};

export const listContractsForClient = async (clientId: string): Promise<ContractSummary[]> => {
  if (!clientId) return [];
  const contracts = (ensureSuccess(await supabase
    .from('client_contracts')
    .select('id,empresa_id,client_id,quote_id,contract_number,contract_date,status,source,review_status,source_document,created_at,updated_at,deleted_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('contract_date', {ascending: false})
    .order('created_at', {ascending: false})) as any[]).map(mapContract);

  if (contracts.length === 0) return [];
  const pieces = (ensureSuccess(await supabase
    .from('client_contract_pieces')
    .select('id,empresa_id,contract_id,quote_piece_id,piece_label,piece_type_key,sort_order,source,created_at,updated_at,deleted_at')
    .in('contract_id', contracts.map((item) => item.id))
    .is('deleted_at', null)
    .order('sort_order', {ascending: true})) as any[]).map(mapPiece);

  const piecesByContract = new Map<string, ClientContractPiece[]>();
  pieces.forEach((piece) => piecesByContract.set(piece.contractId, [...(piecesByContract.get(piece.contractId) || []), piece]));

  return contracts.map((contract) => ({
    ...contract,
    quote: null,
    pieces: piecesByContract.get(contract.id) || [],
  }));
};

export const confirmClientContractImport = async (input: {
  clientId: string;
  contractNumber: string;
  contractDate?: string;
  quoteId?: string | null;
  pieces: ContractImportPieceDraft[];
}, actor: Actor) => {
  return ensureSuccess(await supabase.rpc('confirm_client_contract_import', {
    p_client_id: input.clientId,
    p_contract_number: input.contractNumber,
    p_contract_date: input.contractDate || null,
    p_quote_id: input.quoteId || null,
    p_pieces: input.pieces.map((piece) => ({
      id: piece.id || null,
      label: piece.label,
      pieceTypeKey: piece.pieceTypeKey || null,
    })),
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  })) as string;
};
