import {QuoteStatus} from '../types';

export const QUOTE_STATUSES: QuoteStatus[] = [
  'Orçamento',
  'Medição',
  'Projeto',
  'Aprovado',
  'Produção',
  'Acabamento',
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
  if (text.includes('entrega') || text.includes('entregue')) return 'Entrega';
  if (text.includes('acabamento') || text.includes('pronto')) return 'Acabamento';
  if (text.includes('producao')) return 'Produção';
  if (text.includes('aprovacao') || text.includes('aprovado')) return 'Aprovado';
  if (text.includes('projeto') || text.includes('enviado')) return 'Projeto';
  if (text.includes('medicao') || text.includes('medido') || text.includes('aguardando')) return 'Medição';
  return 'Orçamento';
};

export const isQuoteOpen = (status?: string) =>
  !['Finalizado'].includes(normalizeQuoteStatus(status));

export const isQuoteApprovedOrBeyond = (status?: string) =>
  ['Aprovado', 'Produção', 'Acabamento', 'Entrega', 'Finalizado'].includes(normalizeQuoteStatus(status));

export const quoteStatusColor = (status?: string) => {
  switch (normalizeQuoteStatus(status)) {
    case 'Orçamento':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Medição':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    case 'Projeto':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'Aprovado':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'Produção':
      return 'bg-zinc-900 text-white border-zinc-900';
    case 'Acabamento':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'Entrega':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'Finalizado':
      return 'bg-emerald-600 text-white border-emerald-600';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export const quoteStatusDotColor = (status?: string) => {
  switch (normalizeQuoteStatus(status)) {
    case 'Orçamento': return 'bg-blue-500';
    case 'Medição': return 'bg-yellow-400';
    case 'Projeto': return 'bg-orange-500';
    case 'Aprovado': return 'bg-violet-500';
    case 'Produção': return 'bg-zinc-950';
    case 'Acabamento': return 'bg-amber-800';
    case 'Entrega': return 'bg-green-500';
    case 'Finalizado': return 'bg-emerald-600';
    default: return 'bg-slate-300';
  }
};
