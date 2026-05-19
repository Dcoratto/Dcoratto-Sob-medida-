import {GoogleGenAI} from '@google/genai';

export type ParsedContractClient = {
  sellerName: string;
  storeName: string;
  contractDate: string;
  contractNumber: string;
  contractType: string;
  clientName: string;
  cpfCnpj: string;
  rgIe: string;
  birthDate: string;
  currentAddress: string;
  currentNeighborhood: string;
  currentCity: string;
  currentUf: string;
  currentCep: string;
  phone: string;
  profession: string;
  email: string;
  deliveryAddress: string;
  deliveryNeighborhood: string;
  deliveryCity: string;
  deliveryUf: string;
  deliveryCep: string;
  deliveryDeadline: string;
  rawText: string;
};

type LabelConfig = {
  key: keyof Omit<ParsedContractClient, 'contractNumber' | 'rawText'>;
  label: string;
};

type PositionedLabel = {
  key: LabelConfig['key'];
  start: number;
  end: number;
};

const LABELS: LabelConfig[] = [
  {key: 'sellerName', label: 'RESPONSAVEL PELA VENDA'},
  {key: 'storeName', label: 'LOJA'},
  {key: 'contractDate', label: 'DATA DO CONTRATO'},
  {key: 'clientName', label: 'CLIENTE'},
  {key: 'contractType', label: 'TIPO DE CONTRATO'},
  {key: 'cpfCnpj', label: 'CPF/CNPJ'},
  {key: 'rgIe', label: 'R.G / INSCRICAO ESTADUAL'},
  {key: 'birthDate', label: 'DATA DE NASCIMENTO'},
  {key: 'currentAddress', label: 'ENDERECO ATUAL'},
  {key: 'currentNeighborhood', label: 'BAIRRO'},
  {key: 'currentCity', label: 'CIDADE'},
  {key: 'currentUf', label: 'UF'},
  {key: 'currentCep', label: 'CEP'},
  {key: 'phone', label: 'TELEFONE'},
  {key: 'profession', label: 'PROFISSAO'},
  {key: 'email', label: 'E-MAIL'},
  {key: 'deliveryAddress', label: 'ENDERECO DE ENTREGA'},
  {key: 'deliveryDeadline', label: 'PRAZO ENTREGA'},
  {key: 'deliveryNeighborhood', label: 'BAIRRO'},
  {key: 'deliveryCity', label: 'CIDADE'},
  {key: 'deliveryUf', label: 'UF'},
  {key: 'deliveryCep', label: 'CEP'},
] as const;

const STOP_MARKERS = ['CONDICOES GERAIS', 'CLAUSULA', 'CLÁUSULA', 'PAGINA 2', 'PÁGINA 2', '2/2'] as const;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const normalizeToken = (value: string) =>
  normalizeText(value)
    .replace(/[^A-Z0-9/@.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const decodePdfEscapes = (value: string) =>
  value
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');

const decodeHexPdfString = (hex: string) => {
  const clean = hex.replace(/\s+/g, '');
  if (!clean || clean.length % 2 !== 0) return '';

  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = parseInt(clean.slice(index, index + 2), 16);
  }

  const looksUtf16 = bytes.length > 2 && (bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x00);
  try {
    if (looksUtf16) {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes).replace(/\u0000/g, '').trim();
      }
      return new TextDecoder('utf-16be').decode(bytes).replace(/\u0000/g, '').trim();
    }
  } catch {
    // Fallback below.
  }

  return new TextDecoder('latin1').decode(bytes).replace(/\u0000/g, '').trim();
};

const sanitizeValue = (value: string) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s*-\s*/, '')
    .trim();

const extractPdfTokens = (buffer: ArrayBuffer) => {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const tokens: string[] = [];

  for (const match of raw.matchAll(/(?:\((?:\\.|[^\\()])*\))|(?:<([0-9A-Fa-f\s]{8,})>)/g)) {
    const token = match[0];
    if (token.startsWith('(')) {
      const decoded = decodePdfEscapes(token.slice(1, -1)).replace(/\u0000/g, '').trim();
      if (decoded) tokens.push(decoded);
      continue;
    }

    const hexBody = match[1] || '';
    const decodedHex = decodeHexPdfString(hexBody);
    if (decodedHex) tokens.push(decodedHex);
  }

  return tokens.filter(Boolean);
};

const trimToFirstPageTokens = (tokens: string[]) => {
  const startIndex = tokens.findIndex((token) => normalizeToken(token).includes('RESPONSAVEL PELA VENDA'));
  const scoped = startIndex === -1 ? tokens : tokens.slice(startIndex);
  const stopIndex = scoped.findIndex((token, index) => {
    if (index < 20) return false;
    const normalized = normalizeToken(token);
    return STOP_MARKERS.some((marker) => normalized.includes(normalizeToken(marker)));
  });

  return stopIndex === -1 ? scoped : scoped.slice(0, stopIndex);
};

const labelWords = (label: string) => normalizeToken(label).split(' ').filter(Boolean);

const matchLabelAt = (tokens: string[], startIndex: number, words: string[]) => {
  let cursor = startIndex;

  for (const word of words) {
    const token = normalizeToken(tokens[cursor] || '');
    if (!token) return null;
    if (!token.includes(word)) return null;
    cursor += 1;
  }

  return cursor;
};

const findLabelPositions = (tokens: string[]) => {
  const positions: PositionedLabel[] = [];
  let searchFrom = 0;

  for (const config of LABELS) {
    const words = labelWords(config.label);
    let found: PositionedLabel | null = null;

    for (let index = searchFrom; index < tokens.length; index += 1) {
      const end = matchLabelAt(tokens, index, words);
      if (end === null) continue;
      found = {key: config.key, start: index, end};
      searchFrom = end;
      break;
    }

    if (found) positions.push(found);
  }

  return positions;
};

const buildRawText = (tokens: string[]) => tokens.map((token) => sanitizeValue(token)).filter(Boolean).join('\n');

const parseFromTokens = (tokens: string[]) => {
  const positions = findLabelPositions(tokens);
  const result: Omit<ParsedContractClient, 'contractNumber' | 'rawText'> = {
    sellerName: '',
    storeName: '',
    contractDate: '',
    contractType: '',
    clientName: '',
    cpfCnpj: '',
    rgIe: '',
    birthDate: '',
    currentAddress: '',
    currentNeighborhood: '',
    currentCity: '',
    currentUf: '',
    currentCep: '',
    phone: '',
    profession: '',
    email: '',
    deliveryAddress: '',
    deliveryNeighborhood: '',
    deliveryCity: '',
    deliveryUf: '',
    deliveryCep: '',
    deliveryDeadline: '',
  };

  positions.forEach((label, index) => {
    const next = positions[index + 1];
    const slice = tokens.slice(label.end, next ? next.start : tokens.length);
    result[label.key] = sanitizeValue(slice.join(' '));
  });

  return {result, positions};
};

const getContractNumber = (tokens: string[], rawText: string) => {
  const fullText = `${tokens.join(' ')} ${rawText}`;
  const normalized = normalizeText(fullText);
  const match = normalized.match(/CONTRATO\s+N(?:\.|O|°|º)?\s*([0-9]{4,})/);
  return match?.[1]?.trim() || '';
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const extractJsonPayload = (value: string) => {
  const text = String(value || '').trim();
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  const source = fenced?.[1] || text;
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('GEMINI_JSON_INVALIDO');
  }
  return JSON.parse(source.slice(firstBrace, lastBrace + 1));
};

const coerceParsedClient = (payload: Record<string, unknown>): ParsedContractClient => ({
  sellerName: sanitizeValue(String(payload.sellerName || '')),
  storeName: sanitizeValue(String(payload.storeName || '')),
  contractDate: sanitizeValue(String(payload.contractDate || '')),
  contractNumber: sanitizeValue(String(payload.contractNumber || '')),
  contractType: sanitizeValue(String(payload.contractType || '')),
  clientName: sanitizeValue(String(payload.clientName || '')),
  cpfCnpj: sanitizeValue(String(payload.cpfCnpj || '')),
  rgIe: sanitizeValue(String(payload.rgIe || '')),
  birthDate: sanitizeValue(String(payload.birthDate || '')),
  currentAddress: sanitizeValue(String(payload.currentAddress || '')),
  currentNeighborhood: sanitizeValue(String(payload.currentNeighborhood || '')),
  currentCity: sanitizeValue(String(payload.currentCity || '')),
  currentUf: sanitizeValue(String(payload.currentUf || '')),
  currentCep: sanitizeValue(String(payload.currentCep || '')),
  phone: sanitizeValue(String(payload.phone || '')),
  profession: sanitizeValue(String(payload.profession || '')),
  email: sanitizeValue(String(payload.email || '')),
  deliveryAddress: sanitizeValue(String(payload.deliveryAddress || '')),
  deliveryNeighborhood: sanitizeValue(String(payload.deliveryNeighborhood || '')),
  deliveryCity: sanitizeValue(String(payload.deliveryCity || '')),
  deliveryUf: sanitizeValue(String(payload.deliveryUf || '')),
  deliveryCep: sanitizeValue(String(payload.deliveryCep || '')),
  deliveryDeadline: sanitizeValue(String(payload.deliveryDeadline || '')),
  rawText: sanitizeValue(String(payload.rawText || '')),
});

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isTransientGeminiError = (error: unknown) => {
  const message = String((error as any)?.message || error || '').toUpperCase();
  const status = Number((error as any)?.status || (error as any)?.code || 0);
  return status === 503 || message.includes('503') || message.includes('UNAVAILABLE') || message.includes('TIMEOUT') || message.includes('HIGH DEMAND');
};

const isQuotaGeminiError = (error: unknown) => {
  const message = String((error as any)?.message || error || '').toUpperCase();
  const status = Number((error as any)?.status || (error as any)?.code || 0);
  return status === 429 || message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('QUOTA EXCEEDED');
};

const parseWithGeminiFallback = async (buffer: ArrayBuffer) => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY_NAO_CONFIGURADA');
  }

  const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});
  const prompt = `
Leia apenas a primeira página deste contrato em PDF e extraia os campos do cliente.
Responda somente com JSON válido, sem explicações e sem markdown.

Use exatamente estas chaves:
sellerName, storeName, contractDate, contractNumber, contractType, clientName, cpfCnpj, rgIe, birthDate, currentAddress, currentNeighborhood, currentCity, currentUf, currentCep, phone, profession, email, deliveryAddress, deliveryNeighborhood, deliveryCity, deliveryUf, deliveryCep, deliveryDeadline, rawText

Regras:
- Leia apenas a primeira página.
- Preserve os textos como aparecem no documento.
- Se algum campo não existir, retorne string vazia.
- rawText deve trazer um resumo em texto do conteúdo identificado da primeira página.
`.trim();

  let lastError: unknown = null;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {text: prompt},
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: arrayBufferToBase64(buffer),
                  },
                },
              ],
            },
          ],
        });

        const payload = extractJsonPayload(response.text || '');
        return coerceParsedClient(payload);
      } catch (error) {
        lastError = error;
        if (isQuotaGeminiError(error)) {
          throw new Error('GEMINI_QUOTA_EXCEDIDA');
        }
        if (!isTransientGeminiError(error)) {
          throw error;
        }
        if (attempt < 2) {
          await sleep(1200 * (attempt + 1));
        }
      }
    }
  }

  if (isTransientGeminiError(lastError)) {
    throw new Error('GEMINI_TEMPORARIAMENTE_INDISPONIVEL');
  }

  throw lastError instanceof Error ? lastError : new Error('GEMINI_FALHOU');
};

export const parseClientContractPdf = async (file: File): Promise<ParsedContractClient> => {
  const buffer = await file.arrayBuffer();
  const extractedTokens = extractPdfTokens(buffer);
  const firstPageTokens = trimToFirstPageTokens(extractedTokens);
  const rawText = buildRawText(firstPageTokens);
  const {result, positions} = parseFromTokens(firstPageTokens);
  const contractNumber = getContractNumber(firstPageTokens, rawText);

  const principalFields = [result.clientName, result.currentAddress, result.phone].filter(Boolean).length;
  const foundCoreLabels = positions.length;

  if (principalFields < 2) {
    if (foundCoreLabels < 3) {
      return parseWithGeminiFallback(buffer);
    }
    throw new Error('PDF_PADRAO_NAO_RECONHECIDO');
  }

  return {
    ...result,
    contractNumber,
    rawText,
  };
};
