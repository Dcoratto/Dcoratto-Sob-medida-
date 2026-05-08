import {QuoteStatus} from '../types';

export const QUOTE_STATUSES: QuoteStatus[] = [
  'Orçamento',
  'Medição',
  'Projeto',
  'Aprovação',
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
  if (text.includes('aprovacao') || text.includes('aprovado')) return 'Aprovação';
  if (text.includes('projeto') || text.includes('enviado')) return 'Projeto';
  if (text.includes('medicao') || text.includes('medido') || text.includes('aguardando')) return 'Medição';
  return 'Orçamento';
};

export const isQuoteOpen = (status?: string) =>
  !['Finalizado'].includes(normalizeQuoteStatus(status));

export const isQuoteApprovedOrBeyond = (status?: string) =>
  ['Aprovação', 'Produção', 'Acabamento', 'Entrega', 'Finalizado'].includes(normalizeQuoteStatus(status));

export const quoteStatusColor = (status?: string) => {
  switch (normalizeQuoteStatus(status)) {
    case 'Orçamento':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'Medição':
      return 'bg-yellow-50 text-yellow-700 border-yellow-100';
    case 'Projeto':
      return 'bg-orange-50 text-orange-700 border-orange-100';
    case 'Aprovação':
      return 'bg-violet-50 text-violet-700 border-violet-100';
    case 'Produção':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    case 'Acabamento':
      return 'bg-amber-50 text-amber-800 border-amber-100';
    case 'Entrega':
      return 'bg-green-50 text-green-700 border-green-100';
    case 'Finalizado':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};
