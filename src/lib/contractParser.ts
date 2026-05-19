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

const KNOWN_LABELS = [
  'RESPONSAVEL PELA VENDA',
  'LOJA',
  'DATA DO CONTRATO',
  'CLIENTE',
  'TIPO DE CONTRATO',
  'CPF/CNPJ',
  'R.G / INSCRICAO ESTADUAL',
  'DATA DE NASCIMENTO',
  'ENDERECO ATUAL',
  'BAIRRO',
  'CIDADE',
  'UF',
  'CEP',
  'TELEFONE',
  'PROFISSAO',
  'E-MAIL',
  'ENDERECO DE ENTREGA',
  'PRAZO ENTREGA',
  'CONTRATO N.O',
  'CONTRATO N°',
  'CONTRATO Nº',
] as const;

const foldText = (value: string) =>
  String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

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

  const utf16Like = bytes.length > 2 && (bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x00);
  try {
    if (utf16Like) {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes).replace(/\u0000/g, '').trim();
      }
      return new TextDecoder('utf-16be').decode(bytes).replace(/\u0000/g, '').trim();
    }
  } catch {
    // Falls back to latin1 below.
  }

  return new TextDecoder('latin1').decode(bytes).replace(/\u0000/g, '').trim();
};

const normalizeExtractedText = (value: string) =>
  value
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/ ?\n ?/g, '\n')
    .trim();

const cleanValue = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s*-\s*/, '')
    .trim();

const toSingleLine = (value: string) => cleanValue(value).replace(/\n+/g, ' ');

const extractPdfVisibleText = (buffer: ArrayBuffer) => {
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

  if (tokens.length > 20) {
    return normalizeExtractedText(tokens.join('\n'));
  }

  return normalizeExtractedText(raw.replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g, ' '));
};

const extractFirstPageText = (text: string) => {
  const folded = foldText(text);
  const firstPageStart = folded.indexOf('RESPONSAVEL PELA VENDA');
  if (firstPageStart === -1) return text;

  const laterPages = [
    '2/2',
    'PAGINA 2',
    'PÁGINA 2',
    'PAG. 2',
    'PAG 2',
    'CONDICOES GERAIS',
    'CLAUSULA',
  ];

  let endIndex = text.length;
  for (const marker of laterPages) {
    const position = folded.indexOf(foldText(marker), firstPageStart + 50);
    if (position !== -1 && position < endIndex) endIndex = position;
  }

  return text.slice(firstPageStart, endIndex).trim();
};

const getContractNumber = (text: string) => {
  const folded = foldText(text);
  const match = folded.match(/CONTRATO\s+N(?:\.|O|°|º)?\s*([0-9]{4,})/);
  return match?.[1]?.trim() || '';
};

const findSection = (text: string, startLabel: string, endLabels: string | string[]) => {
  const folded = foldText(text);
  const start = folded.indexOf(foldText(startLabel));
  if (start === -1) return '';

  const valueStart = start + foldText(startLabel).length;
  const candidates = Array.isArray(endLabels) ? endLabels : [endLabels];
  let end = text.length;

  for (const label of candidates) {
    const position = folded.indexOf(foldText(label), valueStart);
    if (position !== -1 && position < end) end = position;
  }

  return cleanValue(text.slice(valueStart, end));
};

const findInlineValue = (text: string, label: string) => {
  const folded = foldText(text);
  const lines = text.split('\n');

  for (const line of lines) {
    const foldedLine = foldText(line);
    const labelIndex = foldedLine.indexOf(foldText(label));
    if (labelIndex === -1) continue;
    const sameLineValue = cleanValue(line.slice(labelIndex + label.length));
    if (sameLineValue) return sameLineValue;
  }

  const labelPosition = folded.indexOf(foldText(label));
  if (labelPosition === -1) return '';
  const after = text.slice(labelPosition + label.length);
  return cleanValue(after.split('\n')[0] || '');
};

const parseSequentialContract = (text: string) => {
  const sellerName = toSingleLine(findSection(text, 'RESPONSAVEL PELA VENDA', 'LOJA'));
  const storeName = toSingleLine(findSection(text, 'LOJA', 'DATA DO CONTRATO'));
  const contractDate = toSingleLine(findSection(text, 'DATA DO CONTRATO', ['CLIENTE', 'TIPO DE CONTRATO']));
  const clientName = toSingleLine(findSection(text, 'CLIENTE', ['TIPO DE CONTRATO', 'CPF/CNPJ']));
  const contractType = toSingleLine(findSection(text, 'TIPO DE CONTRATO', ['CPF/CNPJ', 'DATA DE NASCIMENTO']));
  const cpfCnpj = toSingleLine(findSection(text, 'CPF/CNPJ', ['R.G / INSCRICAO ESTADUAL', 'R.G / INSCRIÇÃO ESTADUAL']));
  const rgIe = toSingleLine(findSection(text, 'R.G / INSCRICAO ESTADUAL', ['DATA DE NASCIMENTO', 'ENDERECO ATUAL'])) || toSingleLine(findSection(text, 'R.G / INSCRIÇÃO ESTADUAL', ['DATA DE NASCIMENTO', 'ENDERECO ATUAL']));
  const birthDate = toSingleLine(findSection(text, 'DATA DE NASCIMENTO', 'ENDERECO ATUAL'));

  const currentAddress = toSingleLine(findSection(text, 'ENDERECO ATUAL', 'BAIRRO'));
  const currentNeighborhood = toSingleLine(findSection(text, 'BAIRRO', 'CIDADE'));
  const currentCity = toSingleLine(findSection(text, 'CIDADE', 'UF'));
  const currentUf = toSingleLine(findSection(text, 'UF', 'CEP'));
  const currentCep = toSingleLine(findSection(text, 'CEP', ['TELEFONE', 'PROFISSAO']));
  const phone = toSingleLine(findSection(text, 'TELEFONE', 'PROFISSAO'));
  const profession = toSingleLine(findSection(text, 'PROFISSAO', 'E-MAIL'));
  const email = toSingleLine(findSection(text, 'E-MAIL', ['ENDERECO DE ENTREGA', 'PRAZO ENTREGA']));

  const deliveryBlock = findSection(text, 'ENDERECO DE ENTREGA', ['PRAZO ENTREGA']) || '';
  const deliveryAddress = toSingleLine(deliveryBlock);
  const deliveryDeadline = toSingleLine(findSection(text, 'PRAZO ENTREGA', ['BAIRRO', 'CONDICOES GERAIS', 'CLAUSULA'])) || toSingleLine(findInlineValue(text, 'PRAZO ENTREGA'));

  const afterDelivery = findSection(text, 'PRAZO ENTREGA', ['CONDICOES GERAIS', 'CLÁUSULA', 'CLAUSULA']);
  const deliveryNeighborhood = toSingleLine(findSection(afterDelivery, 'BAIRRO', 'CIDADE'));
  const deliveryCity = toSingleLine(findSection(afterDelivery, 'CIDADE', 'UF'));
  const deliveryUf = toSingleLine(findSection(afterDelivery, 'UF', 'CEP'));
  const deliveryCep = toSingleLine(findSection(afterDelivery, 'CEP', ['CONTRATO', 'CONDICOES GERAIS', 'CLÁUSULA', 'CLAUSULA']));

  return {
    sellerName,
    storeName,
    contractDate,
    clientName,
    contractType,
    cpfCnpj,
    rgIe,
    birthDate,
    currentAddress,
    currentNeighborhood,
    currentCity,
    currentUf,
    currentCep,
    phone,
    profession,
    email,
    deliveryAddress,
    deliveryNeighborhood,
    deliveryCity,
    deliveryUf,
    deliveryCep,
    deliveryDeadline,
  };
};

export const parseClientContractPdf = async (file: File): Promise<ParsedContractClient> => {
  const buffer = await file.arrayBuffer();
  const rawText = extractPdfVisibleText(buffer);
  const firstPageText = extractFirstPageText(rawText);
  const parsed = parseSequentialContract(firstPageText);
  const contractNumber = getContractNumber(firstPageText || rawText);

  const mainFieldsFound = [parsed.clientName, parsed.currentAddress, parsed.phone].filter(Boolean).length;
  if (mainFieldsFound < 2) {
    throw new Error('Nao foi possivel identificar os dados principais do contrato.');
  }

  return {
    ...parsed,
    contractNumber,
    rawText: firstPageText || rawText,
  };
};
