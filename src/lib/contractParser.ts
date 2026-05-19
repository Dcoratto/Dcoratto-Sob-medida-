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

const LABELS_IN_ORDER = [
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
  'BAIRRO',
  'CIDADE',
  'UF',
  'CEP',
] as const;

const foldText = (value: string) =>
  value
    .toUpperCase()
    .replace(/[ÁÀÂÃÄ]/g, 'A')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÕÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U')
    .replace(/[Ç]/g, 'C');

const decodePdfString = (value: string) =>
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

const normalizeExtractedText = (value: string) =>
  value
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/ ?\n ?/g, '\n')
    .trim();

const sanitizeValue = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s*-\s*/, '')
    .trim();

const extractPdfVisibleText = (buffer: ArrayBuffer) => {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const chunks = Array.from(raw.matchAll(/\((?:\\.|[^\\()])*\)/g))
    .map((match) => match[0].slice(1, -1))
    .map(decodePdfString)
    .map((item) => item.replace(/\u0000/g, '').trim())
    .filter(Boolean);

  if (chunks.length > 20) {
    return normalizeExtractedText(chunks.join('\n'));
  }

  return normalizeExtractedText(raw.replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g, ' '));
};

const getContractNumber = (text: string) => {
  const match = text.match(/CONTRATO\s+N(?:\.|º|O)?\s*([0-9]{4,})/i);
  return match?.[1]?.trim() || '';
};

const findLabelIndex = (foldedText: string, label: string, fromIndex: number) => foldedText.indexOf(label, fromIndex);

const parseSequentialFields = (text: string) => {
  const foldedText = foldText(text);
  const values: string[] = [];
  let searchFrom = 0;

  for (let index = 0; index < LABELS_IN_ORDER.length; index += 1) {
    const currentLabel = LABELS_IN_ORDER[index];
    const nextLabel = LABELS_IN_ORDER[index + 1];
    const labelStart = findLabelIndex(foldedText, currentLabel, searchFrom);
    if (labelStart === -1) {
      values.push('');
      continue;
    }

    const valueStart = labelStart + currentLabel.length;
    const nextStart = nextLabel ? findLabelIndex(foldedText, nextLabel, valueStart) : text.length;
    const value = text.slice(valueStart, nextStart === -1 ? text.length : nextStart);
    values.push(sanitizeValue(value));
    searchFrom = valueStart;
  }

  return {
    sellerName: values[0] || '',
    storeName: values[1] || '',
    contractDate: values[2] || '',
    clientName: values[3] || '',
    contractType: values[4] || '',
    cpfCnpj: values[5] || '',
    rgIe: values[6] || '',
    birthDate: values[7] || '',
    currentAddress: values[8] || '',
    currentNeighborhood: values[9] || '',
    currentCity: values[10] || '',
    currentUf: values[11] || '',
    currentCep: values[12] || '',
    phone: values[13] || '',
    profession: values[14] || '',
    email: values[15] || '',
    deliveryAddress: values[16] || '',
    deliveryDeadline: values[17] || '',
    deliveryNeighborhood: values[18] || '',
    deliveryCity: values[19] || '',
    deliveryUf: values[20] || '',
    deliveryCep: values[21] || '',
  };
};

export const parseClientContractPdf = async (file: File): Promise<ParsedContractClient> => {
  const buffer = await file.arrayBuffer();
  const rawText = extractPdfVisibleText(buffer);
  const parsed = parseSequentialFields(rawText);
  const contractNumber = getContractNumber(rawText);

  if (!parsed.clientName || !parsed.currentAddress || !parsed.phone) {
    throw new Error('Não foi possível identificar os dados principais do contrato.');
  }

  return {
    ...parsed,
    contractNumber,
    rawText,
  };
};
