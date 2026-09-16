import fs from 'node:fs/promises';
import path from 'node:path';
import {File} from 'node:buffer';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {extractOfficialContractNumber, parseClientContractPdf, parseLegacyQuotePdf} from '../src/lib/contractParser.ts';

dotenv.config({path: '.env'});
dotenv.config({path: '.env.local', override: true});

if (!globalThis.btoa) {
  globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
}
if (!globalThis.window) {
  globalThis.window = {setTimeout};
}

const argv = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith('--')) continue;
  const [key, inlineValue] = value.slice(2).split('=');
  const nextValue = inlineValue ?? process.argv[index + 1];
  argv.set(key, nextValue);
  if (inlineValue === undefined) index += 1;
}

const rootDir = argv.get('root');
const outputDir = argv.get('out') || path.join(process.cwd(), 'reports');
const pythonExecutable = argv.get('python') || 'python';
const maxBytes = 12 * 1024 * 1024;
const supportedExtensions = new Set(['.pdf']);
const execFileAsync = promisify(execFile);

if (!rootDir) {
  throw new Error('Informe o diretorio raiz com --root "CAMINHO".');
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para a leitura administrativa.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {persistSession: false, autoRefreshToken: false},
});

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const digits = (value) => String(value || '').replace(/\D/g, '');

const parseFolderName = (folderName) => {
  const match = String(folderName || '').match(/^(.+?)\s*-\s*(.+)$/);
  return {
    code: match ? match[1].trim() : '',
    clientName: match ? match[2].trim() : folderName,
  };
};

const tokens = (value) => normalize(value).split(' ').filter((token) => token.length > 1);

const similarity = (left, right) => {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  const dice = (2 * intersection) / (leftTokens.size + rightTokens.size);
  const containment = Math.min(leftTokens.size, rightTokens.size) >= 2
    ? intersection / Math.min(leftTokens.size, rightTokens.size)
    : 0;
  return Math.max(dice, containment >= 1 ? 0.85 : containment * 0.75);
};

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
};

const maskDocument = (value) => {
  const raw = digits(value);
  if (!raw) return '';
  if (raw.length <= 4) return '***';
  return `${raw.slice(0, 3)}***${raw.slice(-2)}`;
};

const extractContractNumberFromFileName = (filePath) => {
  const base = path.basename(filePath, path.extname(filePath));
  const match = base.match(/100\d{5,}(?:-[A-Za-z0-9]+)?/i);
  return match ? match[0] : '';
};

const parseBrazilianCurrency = (value) => {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readDirectorySafe = async (dir) => {
  try {
    return await fs.readdir(dir, {withFileTypes: true});
  } catch {
    return [];
  }
};

const findContractDirectory = async (projectDir) => {
  const entries = await readDirectorySafe(projectDir);
  const matches = entries
    .filter((entry) => entry.isDirectory() && normalize(entry.name) === 'CONTRATO')
    .map((entry) => path.join(projectDir, entry.name));
  return matches[0] || null;
};

const collectFiles = async (dir) => {
  const result = [];
  const entries = await readDirectorySafe(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
};

const validatePdf = async (filePath) => {
  const stat = await fs.stat(filePath);
  if (stat.size <= 0) return {ok: false, reason: 'EMPTY_FILE', size: stat.size};
  if (stat.size > maxBytes) return {ok: false, reason: 'PDF_TOO_LARGE', size: stat.size};
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, 5, 0);
    if (header.toString('latin1') !== '%PDF-') return {ok: false, reason: 'INVALID_MAGIC_BYTES', size: stat.size};
  } finally {
    await handle.close();
  }
  return {ok: true, size: stat.size};
};

const loadSnapshot = async () => {
  const [clientsResult, contractsResult] = await Promise.all([
    supabase
      .from('clients')
      .select('id,name,cpf,phone,email,city,neighborhood')
      .order('name', {ascending: true}),
    supabase
      .from('client_contracts')
      .select('id,client_id,contract_number,deleted_at,quote_id'),
  ]);

  if (clientsResult.error) throw new Error(`Erro ao ler clientes: ${clientsResult.error.message}`);
  if (contractsResult.error) throw new Error(`Erro ao ler contratos: ${contractsResult.error.message}`);

  return {
    clients: clientsResult.data || [],
    contracts: contractsResult.data || [],
  };
};

const classifyMatch = ({clients, folderClientName, parsedClientName, parsedDocument}) => {
  const parsedDigits = digits(parsedDocument);
  const hasDocumentName = Boolean(normalize(parsedClientName));
  const scored = clients.map((client) => {
    const cpfMatch = parsedDigits && digits(client.cpf) && parsedDigits === digits(client.cpf);
    const documentScore = similarity(parsedClientName, client.name);
    const folderScore = similarity(folderClientName, client.name);
    const score = cpfMatch ? 2 : hasDocumentName ? (documentScore * 0.62) + (folderScore * 0.38) : folderScore;
    return {client, score, documentScore, folderScore, cpfMatch: Boolean(cpfMatch)};
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score < 0.58) {
    return {
      status: 'SEM MATCH',
      client: null,
      reason: 'Nenhum cliente atingiu similaridade minima segura.',
      candidates: scored.slice(0, 3).map(formatCandidate),
    };
  }
  if (!top.cpfMatch && second && second.score >= 0.58 && top.score - second.score < 0.16) {
    return {
      status: 'MATCH AMBIGUO',
      client: null,
      reason: 'Mais de um cliente possui nome semelhante.',
      candidates: scored.slice(0, 3).map(formatCandidate),
    };
  }
  return {
    status: 'MATCH SEGURO',
    client: top.client,
    reason: top.cpfMatch
      ? 'CPF/CNPJ do documento corresponde ao cliente CRM.'
      : 'Nome da pasta/documento aponta para um unico cliente CRM.',
    candidates: scored.slice(0, 3).map(formatCandidate),
  };
};

const formatCandidate = (item) => ({
  crmClientId: item.client.id,
  crmClientName: item.client.name,
  score: Number(item.score.toFixed(3)),
  documentScore: Number(item.documentScore.toFixed(3)),
  folderScore: Number(item.folderScore.toFixed(3)),
  cpfMatched: item.cpfMatch,
});

const duplicateStatus = ({contracts, clientId, contractNumber}) => {
  if (!clientId || !contractNumber) return 'NAO VERIFICADO';
  const matches = contracts.filter((contract) =>
    contract.client_id === clientId
    && normalize(contract.contract_number) === normalize(contractNumber)
  );
  if (matches.some((contract) => contract.deleted_at)) return 'SOFT_DELETED_EXISTENTE';
  if (matches.length > 0) return 'JA EXISTE';
  return 'NOVO';
};

const parsePdf = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  const file = new File([buffer], path.basename(filePath), {type: 'application/pdf'});
  const [client, pieces] = await Promise.all([
    parseClientContractPdf(file),
    parseLegacyQuotePdf(file).catch(() => []),
  ]);
  return {
    contractNumber: client.contractNumber,
    contractDate: client.contractDate,
    clientName: client.clientName,
    cpfCnpj: client.cpfCnpj,
    pieces,
    needsManualReview: !client.contractNumber || pieces.length === 0,
  };
};

const extractPdfText = async (filePath) => {
  const code = [
    'import sys, pdfplumber',
    'path = sys.argv[1]',
    'with pdfplumber.open(path) as pdf:',
    '    text = "\\n".join((page.extract_text() or "") for page in pdf.pages)',
    'print(text)',
  ].join('\n');
  const {stdout} = await execFileAsync(pythonExecutable, ['-c', code, filePath], {
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
};

const parsePdfTextFallback = (text, filePath) => {
  const contractNumber = extractOfficialContractNumber(text) || extractContractNumberFromFileName(filePath);
  const dateMatch = text.match(/DATA DO CONTRATO[\s\S]{0,220}?(\d{2}\/\d{2}\/\d{4})/i) || text.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
  const clientMatch = text.match(/CLIENTE\s+TIPO DE CONTRATO\s+([\s\S]{1,180}?)(?:\s+Normal|\s+Especial|\s+CPF\/CNPJ|\n)/i);
  const cpfMatch = text.match(/CPF\/CNPJ[\s\S]{0,160}?(\d{2,3}\.?\d{3}\.?\d{3}[-/.]?\d{2,4}(?:\/\d{4}-?\d{2})?)/i);
  const totalMatch = text.match(/Total do pedido:\s*([\d.]+,\d{2})/i);
  const pieces = [];
  const itemPattern = /^\s*\d+\s+[\d,.]+\s+(.+?)\s+DCORATTO SOB MEDIDA\s+GRANITOS E\s+\d{1,3}\s+([\d.]+,\d{2})\s*$/gim;
  for (const match of text.matchAll(itemPattern)) {
    pieces.push({
      name: String(match[1] || '').replace(/\s+/g, ' ').trim(),
      value: parseBrazilianCurrency(match[2]),
    });
  }

  return {
    contractNumber,
    contractDate: dateMatch?.[1] || '',
    clientName: String(clientMatch?.[1] || '').replace(/\s+/g, ' ').replace(/^\d+\s*-\s*/, '').trim(),
    cpfCnpj: cpfMatch?.[1] || '',
    pieces: pieces.filter((piece) => piece.name && piece.value > 0),
    contractTotal: totalMatch ? parseBrazilianCurrency(totalMatch[1]) : null,
    needsManualReview: !contractNumber || pieces.length === 0,
  };
};

const parsePdfForPreflight = async (filePath) => {
  try {
    const parsed = await parsePdf(filePath);
    if (parsed.contractNumber && parsed.pieces.length > 0) {
      return {...parsed, contractTotal: parsed.pieces.reduce((sum, piece) => sum + (money(piece.value) || 0), 0), parserMode: 'contractParser'};
    }
  } catch {
    // The local PDF text fallback below keeps this read-only preflight useful without Gemini.
  }
  const text = await extractPdfText(filePath);
  return {...parsePdfTextFallback(text, filePath), parserMode: 'pdfplumber'};
};

const main = async () => {
  const rootStat = await fs.stat(rootDir).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`Diretorio raiz invalido: ${rootDir}`);

  const snapshot = await loadSnapshot();
  const projectEntries = (await readDirectorySafe(rootDir)).filter((entry) => entry.isDirectory());
  const rows = [];
  const invalidFiles = [];
  const formats = new Map();
  let foldersWithContract = 0;
  let totalContractFiles = 0;
  let totalPieces = 0;
  let totalValues = 0;

  for (const entry of projectEntries) {
    const projectDir = path.join(rootDir, entry.name);
    const folderInfo = parseFolderName(entry.name);
    const contractDir = await findContractDirectory(projectDir);
    if (!contractDir) {
      rows.push({
        folderName: entry.name,
        folderClientCode: folderInfo.code,
        folderClientName: folderInfo.clientName,
        hasContractFolder: false,
        filesFound: 0,
        matchStatus: 'NAO ANALISADO',
        duplicateStatus: 'NAO VERIFICADO',
        warnings: ['Pasta CONTRATO nao encontrada.'],
      });
      continue;
    }

    foldersWithContract += 1;
    const files = await collectFiles(contractDir);
    const supportedFiles = files.filter((filePath) => supportedExtensions.has(path.extname(filePath).toLowerCase()));
    totalContractFiles += supportedFiles.length;
    files.forEach((filePath) => {
      const extension = path.extname(filePath).toLowerCase() || '(sem extensao)';
      formats.set(extension, (formats.get(extension) || 0) + 1);
    });

    if (supportedFiles.length === 0) {
      rows.push({
        folderName: entry.name,
        folderClientCode: folderInfo.code,
        folderClientName: folderInfo.clientName,
        hasContractFolder: true,
        filesFound: files.length,
        matchStatus: 'NAO ANALISADO',
        duplicateStatus: 'NAO VERIFICADO',
        warnings: ['Pasta CONTRATO sem PDF suportado.'],
      });
      continue;
    }

    for (const filePath of supportedFiles) {
      const relativeFilePath = path.relative(rootDir, filePath);
      const validation = await validatePdf(filePath).catch((error) => ({ok: false, reason: error.message, size: null}));
      if (!validation.ok) {
        invalidFiles.push(relativeFilePath);
        rows.push({
          folderName: entry.name,
          folderClientCode: folderInfo.code,
          folderClientName: folderInfo.clientName,
          hasContractFolder: true,
          fileName: path.basename(filePath),
          filePath: relativeFilePath,
          fileSize: validation.size,
          matchStatus: 'NAO ANALISADO',
          duplicateStatus: 'NAO VERIFICADO',
          warnings: [`Arquivo invalido: ${validation.reason}`],
        });
        continue;
      }

      try {
        const parsed = await parsePdfForPreflight(filePath);
        const match = classifyMatch({
          clients: snapshot.clients,
          folderClientName: folderInfo.clientName,
          parsedClientName: parsed.clientName,
          parsedDocument: parsed.cpfCnpj,
        });
        const duplicate = duplicateStatus({
          contracts: snapshot.contracts,
          clientId: match.client?.id,
          contractNumber: parsed.contractNumber,
        });
        const contractTotal = parsed.contractTotal ?? parsed.pieces.reduce((sum, piece) => sum + (money(piece.value) || 0), 0);
        totalPieces += parsed.pieces.length;
        if (contractTotal > 0) totalValues += 1;

        rows.push({
          folderName: entry.name,
          folderClientCode: folderInfo.code,
          folderClientName: folderInfo.clientName,
          crmClientId: match.client?.id || '',
          crmClientName: match.client?.name || '',
          fileName: path.basename(filePath),
          filePath: relativeFilePath,
          fileSize: validation.size,
          contractNumber: parsed.contractNumber,
          contractDate: parsed.contractDate,
          parsedClientName: parsed.clientName,
          parsedDocumentMasked: maskDocument(parsed.cpfCnpj),
          pieceCount: parsed.pieces.length,
          contractTotal: money(contractTotal),
          parserMode: parsed.parserMode,
          matchStatus: match.status,
          matchReason: match.reason,
          duplicateStatus: duplicate,
          candidates: match.candidates,
          warnings: [
            parsed.needsManualReview ? 'Parser solicitou revisao manual.' : '',
            parsed.contractNumber ? '' : 'Contrato sem numero identificado.',
            parsed.pieces.length ? '' : 'Sem pecas identificadas.',
          ].filter(Boolean),
        });
      } catch (error) {
        const fallbackContractNumber = extractContractNumberFromFileName(filePath);
        const match = classifyMatch({
          clients: snapshot.clients,
          folderClientName: folderInfo.clientName,
          parsedClientName: '',
          parsedDocument: '',
        });
        const duplicate = duplicateStatus({
          contracts: snapshot.contracts,
          clientId: match.client?.id,
          contractNumber: fallbackContractNumber,
        });
        rows.push({
          folderName: entry.name,
          folderClientCode: folderInfo.code,
          folderClientName: folderInfo.clientName,
          crmClientId: match.client?.id || '',
          crmClientName: match.client?.name || '',
          hasContractFolder: true,
          fileName: path.basename(filePath),
          filePath: relativeFilePath,
          fileSize: validation.size,
          contractNumber: fallbackContractNumber,
          contractDate: '',
          parsedClientName: '',
          parsedDocumentMasked: '',
          pieceCount: 0,
          contractTotal: null,
          matchStatus: match.status,
          matchReason: `${match.reason} Documento requer revisao manual porque o parser atual nao extraiu texto sem IA.`,
          duplicateStatus: duplicate,
          candidates: match.candidates,
          warnings: [
            `Leitura parcial: ${error instanceof Error ? error.message : String(error)}`,
            fallbackContractNumber ? 'Numero inferido do nome do arquivo para pre-validacao.' : 'Contrato sem numero identificado.',
            'Pecas e valores nao identificados nesta execucao.',
          ],
        });
      }
    }
  }

  const counts = rows.reduce((acc, row) => {
    acc.matchStatus[row.matchStatus] = (acc.matchStatus[row.matchStatus] || 0) + 1;
    acc.duplicateStatus[row.duplicateStatus] = (acc.duplicateStatus[row.duplicateStatus] || 0) + 1;
    if (!row.contractNumber && row.fileName) acc.contractsWithoutNumber += 1;
    return acc;
  }, {matchStatus: {}, duplicateStatus: {}, contractsWithoutNumber: 0});

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'PRE_IMPORT_READ_ONLY',
    rootDir,
    summary: {
      foldersAnalyzed: projectEntries.length,
      foldersWithContract,
      contractFiles: totalContractFiles,
      formats: Object.fromEntries([...formats.entries()].sort()),
      contractsIdentified: rows.filter((row) => row.contractNumber).length,
      contractsWithoutNumber: counts.contractsWithoutNumber,
      piecesIdentified: totalPieces,
      valuesIdentified: totalValues,
      matchStatus: counts.matchStatus,
      duplicateStatus: counts.duplicateStatus,
      invalidFiles: invalidFiles.length,
      readErrors: rows.filter((row) => row.matchStatus === 'ERRO LEITURA').length,
    },
    rows,
  };

  await fs.mkdir(outputDir, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `historical-contracts-preflight-${stamp}.json`);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputPath,
    summary: report.summary,
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
