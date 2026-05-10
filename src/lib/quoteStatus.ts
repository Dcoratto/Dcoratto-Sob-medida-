import {QuoteStatus} from '../types';

export const QUOTE_STATUSES: QuoteStatus[] = [
  'Orçamento',
  'Orçamento Aprovado',
  'Medição',
  'Projeto',
  'Projeto Aprovado',
  'Corte',
  'Acabamento',
  'Montagem',
  'Produção Finalizada',
  'Conferência Final',
  'Entrega',
  'Finalizado',
];

export const normalizeText = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const normalizeQuoteStatus = (status?: string): QuoteStatus => {
  const text = normalizeText(status);
  if (text.includes('finalizado') || text.includes('concluido')) return 'Finalizado';
  if (text.includes('conferencia') || text.includes('conferido')) return 'Conferência Final';
  if (text.includes('producao finalizada')) return 'Produção Finalizada';
  if (text.includes('entrega') || text.includes('entregue')) return 'Entrega';
  if (text.includes('montagem') || text.includes('instalacao')) return 'Montagem';
  if (text.includes('acabamento') || text.includes('pronto')) return 'Acabamento';
  if (text.includes('corte') || text.includes('cortado')) return 'Corte';
  if (text.includes('projeto') && text.includes('aprovado')) return 'Projeto Aprovado';
  if (text.includes('projeto') || text.includes('enviado')) return 'Projeto';
  if (text.includes('medicao') || text.includes('medido') || text.includes('aguardando')) return 'Medição';
  if (text.includes('orcamento') && text.includes('aprovado')) return 'Orçamento Aprovado';
  if (text === 'aprovado' || text.includes('aprovacao')) return 'Orçamento Aprovado';
  return 'Orçamento';
};

export const isQuoteOpen = (status?: string) =>
  !['Finalizado'].includes(normalizeQuoteStatus(status));

export const isQuoteApprovedOrBeyond = (status?: string) =>
  [
    'Orçamento Aprovado',
    'Medição',
    'Projeto',
    'Projeto Aprovado',
    'Corte',
    'Acabamento',
    'Montagem',
    'Produção Finalizada',
    'Conferência Final',
    'Entrega',
    'Finalizado',
  ].includes(normalizeQuoteStatus(status));

export const quoteStatusColor = (status?: string) => {
  switch (normalizeQuoteStatus(status)) {
    case 'Orçamento':
      return 'bg-[#B0BEC5]/20 text-[#455A64] border-[#B0BEC5]';
    case 'Orçamento Aprovado':
      return 'bg-[#66BB6A]/20 text-[#2E7D32] border-[#66BB6A]';
    case 'Medição':
      return 'bg-[#1565C0]/15 text-[#1565C0] border-[#1565C0]';
    case 'Projeto':
      return 'bg-[#7E57C2]/15 text-[#7E57C2] border-[#7E57C2]';
    case 'Projeto Aprovado':
      return 'bg-[#43A047]/20 text-[#1B5E20] border-[#43A047]';
    case 'Corte':
      return 'bg-[#E53935]/15 text-[#B71C1C] border-[#E53935]';
    case 'Acabamento':
      return 'bg-[#FDD835]/25 text-[#8D6E00] border-[#FDD835]';
    case 'Montagem':
      return 'bg-[#8D6E63]/20 text-[#5D4037] border-[#8D6E63]';
    case 'Produção Finalizada':
      return 'bg-[#2E7D32]/20 text-[#1B5E20] border-[#2E7D32]';
    case 'Conferência Final':
      return 'bg-[#1B5E20]/20 text-[#1B5E20] border-[#1B5E20]';
    case 'Entrega':
      return 'bg-[#00838F]/15 text-[#006064] border-[#00838F]';
    case 'Finalizado':
      return 'bg-[#0B3D0B] text-white border-[#0B3D0B]';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export const quoteStatusDotColor = (status?: string) => {
  switch (normalizeQuoteStatus(status)) {
    case 'Orçamento': return 'bg-[#B0BEC5]';
    case 'Orçamento Aprovado': return 'bg-[#66BB6A]';
    case 'Medição': return 'bg-[#1565C0]';
    case 'Projeto': return 'bg-[#7E57C2]';
    case 'Projeto Aprovado': return 'bg-[#43A047]';
    case 'Corte': return 'bg-[#E53935]';
    case 'Acabamento': return 'bg-[#FDD835]';
    case 'Montagem': return 'bg-[#8D6E63]';
    case 'Produção Finalizada': return 'bg-[#2E7D32]';
    case 'Conferência Final': return 'bg-[#1B5E20]';
    case 'Entrega': return 'bg-[#00838F]';
    case 'Finalizado': return 'bg-[#0B3D0B]';
    default: return 'bg-slate-300';
  }
};
