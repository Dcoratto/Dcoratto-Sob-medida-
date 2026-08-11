import {supabase} from './supabase';
import {QuotePresentationStatus} from '../types';

export type QuotePresentationVersionSummary = {
  id: string;
  quoteId: string;
  versionNumber: number;
  versionLabel: string;
  proposalCode: string;
  status: QuotePresentationStatus;
  publicToken: string;
  validUntil?: string | null;
  sharedAt?: string | null;
  firstViewedAt?: string | null;
  lastViewedAt?: string | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export type QuotePresentationAcceptanceSummary = {
  id: string;
  versionId: string;
  versionNumber: number;
  acceptedName: string;
  createdAt: string;
};

export type QuotePresentationSnapshot = {
  proposalCode?: string;
  versionLabel?: string;
  generatedAt?: string;
  validUntil?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  company?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    logoUrl?: string;
  };
  client?: {
    name?: string;
    city?: string;
    neighborhood?: string;
  };
  summary?: {
    environment?: string;
    responsible?: string;
    pieceCount?: number;
  };
  includedFeatures?: {
    materialSelected?: boolean;
    fabricationIncluded?: boolean;
    finishingIncluded?: boolean;
    cutoutsIncluded?: boolean;
    sculptedSinkIncluded?: boolean;
    deliveryIncluded?: boolean;
    installationIncluded?: boolean;
    measurementIncluded?: boolean;
  };
  material?: {
    name?: string;
    category?: string;
    materialLine?: string;
    materialType?: string;
    thicknessLabel?: string;
    texture?: string;
    description?: string;
    imageUrl?: string;
  };
  pieces?: Array<{
    id: string;
    name?: string;
    environment?: string;
    material?: string;
    dimensionsLabel?: string;
    imageUrl?: string;
    notes?: string;
  }>;
  investment?: {
    label?: string;
    description?: string;
    totalPrice?: number;
    totalArea?: number;
  };
  payment?: {
    method?: string;
    mode?: string;
    totalPaymentMethod?: string;
    remainingPaymentMethod?: string;
    entryAmount?: number;
    installmentCount?: number;
    installmentAmount?: number;
    notes?: string;
    simulation?: {
      availableMethods?: Array<{
        name?: string;
        adjustment?: number;
      }>;
      commissionPercent?: number;
      negotiationDiscountPercent?: number;
      rtPercent?: number;
    };
  };
  delivery?: {
    deliveryDays?: number;
    deliveryDate?: string;
    measurementDate?: string;
    deliveryIncluded?: boolean;
    installationIncluded?: boolean;
  };
  notes?: {
    commercialNotes?: string;
    defaultNotes?: string;
  };
};

export type PublicQuotePresentationResponse =
  | {
    state: 'available';
    status: QuotePresentationStatus;
    meta: {
      versionId: string;
      versionNumber: number;
      versionLabel: string;
      proposalCode: string;
      validUntil?: string | null;
      firstViewedAt?: string | null;
      lastViewedAt?: string | null;
      acceptedAt?: string | null;
      acceptedName?: string | null;
    };
    snapshot: QuotePresentationSnapshot;
  }
  | {
    state: 'missing' | 'expired' | 'revoked';
    status?: QuotePresentationStatus;
    company?: QuotePresentationSnapshot['company'];
    versionLabel?: string;
  };

const normalizeQuotePresentationError = (message?: string) => {
  const normalized = String(message || '').toLowerCase();
  if (
    normalized.includes('record "p_quote" has no field')
    || normalized.includes('record "p_client" has no field')
    || normalized.includes('schema cache')
    || normalized.includes('column')
  ) {
    return 'Nao foi possivel gerar a proposta digital agora. Revise os dados do orcamento e tente novamente.';
  }
  return message || 'Nao foi possivel concluir a operacao.';
};

const ensureSuccess = <T>(result: {
  data: T;
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;
}) => {
  if (result.error) {
    console.error('[quote-digital-rpc]', {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
    });
    throw new Error(normalizeQuotePresentationError(result.error.message));
  }
  return result.data;
};

const mapVersionRow = (row: any): QuotePresentationVersionSummary => ({
  id: row.id,
  quoteId: row.quote_id,
  versionNumber: Number(row.version_number || 0),
  versionLabel: `V${Number(row.version_number || 0)}`,
  proposalCode: row.proposal_code || '',
  status: row.status,
  publicToken: row.public_token,
  validUntil: row.valid_until || null,
  sharedAt: row.shared_at || null,
  firstViewedAt: row.first_viewed_at || null,
  lastViewedAt: row.last_viewed_at || null,
  acceptedAt: row.accepted_at || null,
  revokedAt: row.revoked_at || null,
  createdAt: row.created_at,
});

const mapAcceptanceRow = (row: any): QuotePresentationAcceptanceSummary => ({
  id: row.id,
  versionId: row.version_id,
  versionNumber: Number(row.version_number || 0),
  acceptedName: row.accepted_name || '',
  createdAt: row.created_at,
});

export const listQuotePresentationVersions = async (quoteId: string) => {
  if (!quoteId) return [];
  const rows = ensureSuccess(await supabase
    .from('quote_presentation_versions')
    .select('id, quote_id, version_number, proposal_code, status, public_token, valid_until, shared_at, first_viewed_at, last_viewed_at, accepted_at, revoked_at, created_at')
    .eq('quote_id', quoteId)
    .order('version_number', {ascending: false}));
  return (rows || []).map(mapVersionRow);
};

export const listQuotePresentationAcceptances = async (quoteId: string) => {
  if (!quoteId) return [];
  const rows = ensureSuccess(await supabase
    .from('quote_presentation_acceptances')
    .select('id, version_id, version_number, accepted_name, created_at')
    .eq('quote_id', quoteId)
    .order('created_at', {ascending: false}));
  return (rows || []).map(mapAcceptanceRow);
};

export const generateQuotePresentationVersion = async (quoteId: string, actorName: string) => {
  const rows = ensureSuccess(await supabase.rpc('generate_quote_presentation_version', {
    p_quote_id: quoteId,
    p_created_by_name: actorName || null,
  }));
  return Array.isArray(rows) ? rows[0] : rows;
};

export const markQuotePresentationShared = async (versionId: string, actorName: string) => {
  const rows = ensureSuccess(await supabase.rpc('mark_quote_presentation_shared', {
    p_version_id: versionId,
    p_actor_name: actorName || null,
  }));
  return Array.isArray(rows) ? rows[0] : rows;
};

export const revokeQuotePresentationVersion = async (versionId: string, actorName: string, reason?: string) => {
  const rows = ensureSuccess(await supabase.rpc('revoke_quote_presentation_version', {
    p_version_id: versionId,
    p_actor_name: actorName || null,
    p_reason: reason || null,
  }));
  return Array.isArray(rows) ? rows[0] : rows;
};

export const getPublicQuotePresentation = async (token: string) => {
  const payload = ensureSuccess(await supabase.rpc('get_public_quote_presentation', {
    p_token: token,
  }));
  return (payload || {state: 'missing'}) as PublicQuotePresentationResponse;
};

export const acceptQuotePresentation = async (token: string, acceptedName: string) => {
  const payload = ensureSuccess(await supabase.rpc('accept_quote_presentation', {
    p_token: token,
    p_accepted_name: acceptedName,
  }));
  return payload as {
    accepted: boolean;
    acceptedAt: string;
    acceptedName: string;
    versionLabel: string;
  };
};
