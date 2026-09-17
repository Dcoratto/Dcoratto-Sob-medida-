export type HistoricalContractItem = {
  itemNumber: number;
  quantity: string;
  description: string;
  supplier: string;
  line: string;
  deadline: string;
  value: number;
};

const KNOWN_SUPPLIERS = [
  'DCORATTO SOB MEDIDA',
  'BOA VISTA PLANEJADOS',
  'VITTA PLANEJADOS',
  'NOVA SOLUCOES PLANEJADOS',
  'NOVA SOLUÇÕES PLANEJADOS',
] as const;

export const normalizeMasonryToken = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isMasonryContractItem = (item: Pick<HistoricalContractItem, 'supplier' | 'line'>) => {
  const supplier = normalizeMasonryToken(item.supplier);
  const line = normalizeMasonryToken(item.line);

  return supplier === 'DCORATTO SOB MEDIDA'
    && (line === 'GRANITOS E MARMORES' || line === 'GRANITOS E');
};

export const isMasonryContractItemText = (value: string) => {
  const normalized = normalizeMasonryToken(value);
  return normalized.includes('DCORATTO SOB MEDIDA')
    && (normalized.includes('GRANITOS E MARMORES') || normalized.includes('GRANITOS E'));
};

export const parseBrazilianCurrencyValue = (value: string) => {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const cleanText = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

const isCurrencyToken = (value: string) => /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(value);

const findSupplier = (body: string) => {
  const normalizedBody = normalizeMasonryToken(body);
  return KNOWN_SUPPLIERS
    .map((supplier) => ({
      supplier,
      normalized: normalizeMasonryToken(supplier),
      index: normalizedBody.indexOf(normalizeMasonryToken(supplier)),
    }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => right.normalized.length - left.normalized.length)[0] || null;
};

export const parseHistoricalContractItemsFromText = (text: string): HistoricalContractItem[] => {
  const itemBlockMatch = String(text || '').match(/ITEM\s+QTD\s+DESCRI[\s\S]{0,120}?VALOR\s+([\s\S]*?)Total do pedido:/i);
  const sourceText = itemBlockMatch?.[1] || '';
  const items: HistoricalContractItem[] = [];
  const linePattern = /^\s*(\d{1,3})\s+([\d,.]+)\s+(.+?)\s+(\d{1,3})\s+([\d.]+,\d{2})\s*$/gim;

  for (const match of sourceText.matchAll(linePattern)) {
    const body = cleanText(match[3] || '');
    const deadline = match[4] || '';
    const value = parseBrazilianCurrencyValue(match[5] || '');
    const supplierMatch = findSupplier(body);
    const beforeSupplier = supplierMatch ? cleanText(body.slice(0, supplierMatch.index)) : body;
    const afterSupplier = supplierMatch ? cleanText(body.slice(supplierMatch.index + supplierMatch.normalized.length)) : '';

    if (!beforeSupplier || value <= 0 || !isCurrencyToken(match[5] || '')) continue;

    items.push({
      itemNumber: Number(match[1]),
      quantity: match[2] || '',
      description: beforeSupplier,
      supplier: supplierMatch?.supplier || '',
      line: afterSupplier,
      deadline,
      value,
    });
  }

  return items.sort((left, right) => left.itemNumber - right.itemNumber);
};

export const toMasonryPieces = (items: HistoricalContractItem[]) =>
  items
    .filter(isMasonryContractItem)
    .map((item) => ({
      label: item.description.slice(0, 180),
      value: item.value,
      itemNumber: item.itemNumber,
      supplier: item.supplier,
      line: item.line,
    }));

export const sumMasonryPieces = (pieces: Array<{value: number}>) =>
  Number(pieces.reduce((sum, piece) => sum + (Number(piece.value) || 0), 0).toFixed(2));
