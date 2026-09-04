import {type ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value).replace(/\u00a0/g, ' ');
}

export const currencyAmountToCents = (value: number) => Math.round((Number(value) || 0) * 100);

export const currencyCentsToAmount = (value: number) => value / 100;

export function parseCurrencyInputToCents(value: string) {
  const isNegative = /^\s*-/.test(value);
  const digits = String(value || '').replace(/\D/g, '');
  const cents = digits ? Number(digits) : 0;
  return isNegative ? -cents : cents;
}

export function formatCurrencyInputFromCents(value: number) {
  return `${value < 0 ? '-' : ''}${formatCurrency(currencyCentsToAmount(Math.abs(value)))}`;
}

export function formatPercentage(value: number, maximumFractionDigits = 4) {
  const numericValue = Number(value) || 0;
  return `${formatPercentageInputValue(numericValue, maximumFractionDigits)}%`;
}

export function formatPercentageInputValue(value: number, maximumFractionDigits = 4) {
  const numericValue = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits,
  }).format(numericValue);
}

export function normalizePercentageInput(value: string | number, maximumFractionDigits = 4) {
  const parsed = parseFlexibleNumberInput(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** maximumFractionDigits;
  return Math.round(parsed * factor) / factor;
}

export function formatNumber(value: number, decimals = 3) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function roundNumber(value: number | string, decimals = 3) {
  const parsed = typeof value === 'number' ? value : parseFlexibleNumberInput(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** decimals;
  return Math.round(parsed * factor) / factor;
}

export function formatMeasure(value: number | string, decimals = 3) {
  return formatNumber(roundNumber(value, decimals), decimals);
}

export function formatArea(value: number | string | null | undefined) {
  if (value == null || value === '') return '-';
  const parsed = typeof value === 'number' ? value : parseFlexibleNumberInput(value);
  if (!Number.isFinite(parsed)) return '-';
  return `${formatMeasure(parsed, 1)} m²`;
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
  return parseFlexibleNumberInput(value);
}

export function parseCurrencyInput(value: string) {
  return parseFlexibleNumberInput(value);
}

export function formatCurrencyInput(value: string | number) {
  return formatCurrency(parseCurrencyInput(String(value || '0')));
}

export function parseFlexibleNumberInput(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const text = String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/^R\$/i, '')
    .replace(/[^\d,.-]/g, '');

  if (!text || text === '-' || text === ',' || text === '.') return 0;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  const decimalSeparator = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : '';
  let normalized = text;

  if (decimalSeparator) {
    const integerPart = text.slice(0, text.lastIndexOf(decimalSeparator)).replace(/[.,]/g, '');
    const decimalPart = text.slice(text.lastIndexOf(decimalSeparator) + 1);
    const treatAsThousandsOnly = decimalSeparator === '.'
      && lastComma === -1
      && decimalPart.length === 3
      && /^\d{1,3}(?:\.\d{3})+$/.test(text);

    normalized = treatAsThousandsOnly
      ? text.replace(/\./g, '')
      : `${integerPart || '0'}.${decimalPart.replace(/[.,]/g, '')}`;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
