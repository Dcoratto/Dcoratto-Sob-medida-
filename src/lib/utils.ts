import {type ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatNumber(value: number, decimals = 3) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function roundNumber(value: number | string, decimals = 3) {
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** decimals;
  return Math.round(parsed * factor) / factor;
}

export function formatMeasure(value: number | string, decimals = 3) {
  return formatNumber(roundNumber(value, decimals), decimals);
}

export function formatArea(value: number | string) {
  return `${formatMeasure(value)} m²`;
}

export function formatCentimeters(value: number | string) {
  return `${formatMeasure(value)} cm`;
}

export function formatMeters(value: number | string) {
  return `${formatMeasure(value)} m`;
}

export function formatMeasureInput(value: number | string, decimals = 3) {
  const rounded = roundNumber(value, decimals);
  return rounded.toFixed(decimals).replace('.', ',');
}

export function parseMeasureInput(value: string) {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseCurrencyInput(value: string) {
  const text = String(value || '').trim();
  if (!text) return 0;

  const cleaned = text.replace(/[^\d,.-]/g, '');
  const hasComma = cleaned.includes(',');

  if (hasComma) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const dotParts = cleaned.split('.');
  if (dotParts.length === 2 && dotParts[1].length <= 2) {
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(cleaned.replace(/\./g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrencyInput(value: string | number) {
  return formatCurrency(parseCurrencyInput(String(value || '0')));
}

const TEXT_REPAIR_REPLACEMENTS: Array<[string, string]> = [
  ['\u00c3\u00a7', 'ç'],
  ['\u00c3\u00a1', 'á'],
  ['\u00c3\u00a2', 'â'],
  ['\u00c3\u00a3', 'ã'],
  ['\u00c3\u00a9', 'é'],
  ['\u00c3\u00aa', 'ê'],
  ['\u00c3\u00ad', 'í'],
  ['\u00c3\u00b3', 'ó'],
  ['\u00c3\u00b4', 'ô'],
  ['\u00c3\u00b5', 'õ'],
  ['\u00c3\u00ba', 'ú'],
  ['\u00c3\u0081', 'Á'],
  ['\u00c3\u0080', 'À'],
  ['\u00c3\u0087', 'Ç'],
  ['\u00c3\u0089', 'É'],
  ['\u00c3\u008a', 'Ê'],
  ['\u00c3\u0093', 'Ó'],
  ['\u00c3\u0094', 'Ô'],
  ['\u00c3\u009a', 'Ú'],
  ['\u00c3\u00a0', 'à'],
  ['m\u00c2\u00b2', 'm²'],
  ['M\u00c2\u00b2', 'm²'],
  ['\u00c2\u00b2', '²'],
  ['\u00c2\u00b0', '°'],
  ['\u00c2\u00b7', '·'],
  ['\u00c2\u00ba', 'º'],
  ['\u00c2\u00aa', 'ª'],
  ['A\ufffd\ufffdes', 'Ações'],
  ['a\ufffd\ufffdo', 'ação'],
  ['a\ufffd\ufffdes', 'ações'],
  ['or\ufffdamento', 'orçamento'],
  ['Or\ufffdamento', 'Orçamento'],
  ['pe\ufffda', 'peça'],
  ['Pe\ufffda', 'Peça'],
  ['Voc\ufffd', 'Você'],
  ['N\ufffdo', 'Não'],
  ['n\ufffdo', 'não'],
  ['Dispon\ufffdvel', 'Disponível'],
  ['dispon\ufffdvel', 'disponível'],
  ['M\ufffd', 'm²'],
  ['m\ufffd', 'm²'],
];

const applyRepairRules = (text: string) => {
  let next = text;
  let changed = true;

  while (changed) {
    changed = false;
    for (const [broken, fixed] of TEXT_REPAIR_REPLACEMENTS) {
      if (!next.includes(broken)) continue;
      next = next.split(broken).join(fixed);
      changed = true;
    }
  }

  return next;
};

export function repairText(value: unknown) {
  return applyRepairRules(String(value ?? ''));
}

export function repairTextDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return repairText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => repairTextDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, repairTextDeep(entry)]),
    ) as T;
  }
  return value;
}
