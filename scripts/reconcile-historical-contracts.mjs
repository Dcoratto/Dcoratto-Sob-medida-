import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {extractOfficialContractNumber} from '../src/lib/contractParser.ts';
import {parseHistoricalContractItemsFromText, sumMasonryPieces, toMasonryPieces, normalizeMasonryToken} from '../src/lib/masonryContractItems.ts';

dotenv.config({path: '.env'});
dotenv.config({path: '.env.local', override: true});

const execFileAsync = promisify(execFile);
const empresaId = 'dcoratto-main';
const defaultRootDir = "G:\\Meu Drive\\D'CORATTO MARMORARIA\\PROJETOS";
const defaultPython = 'C:\\Users\\brian\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const maxBytes = 12 * 1024 * 1024;

const argv = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith('--')) continue;
  const [key, inlineValue] = value.slice(2).split('=');
  const nextArgument = process.argv[index + 1];
  const hasSeparateValue = inlineValue === undefined && nextArgument && !nextArgument.startsWith('--');
  argv.set(key, inlineValue ?? (hasSeparateValue ? nextArgument : true));
  if (hasSeparateValue) index += 1;
}

const rootDir = argv.get('root') || defaultRootDir;
const outputDir = argv.get('out') || path.join(process.cwd(), 'reports');
const pythonExecutable = argv.get('python') || defaultPython;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para leitura administrativa.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {persistSession: false, autoRefreshToken: false},
});

const manualClients = new Map([
  ['100001670', 'LION ADMINISTRADORA DE BENS LTDA'],
  ['100001671', 'LION ADMINISTRADORA DE BENS LTDA'],
  ['100001744', 'CAMILA SBI'],
  ['100001690', 'BIANCA JURTICK'],
]);

const highlightedNeedles = [
  {key: 'eric ferreira', label: 'eric ferreira'},
  {key: 'guerrino', label: 'GUERRINO'},
  {key: 'ser finance', label: 'SER FINANCE'},
  {key: 'thiago miranda', label: 'thiago miranda'},
];

const money = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const digits = (value) => String(value || '').replace(/\D/g, '');

const normalize = (value) => normalizeMasonryToken(String(value || ''));

const parseBrazilianCurrency = (value) => {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const parseFolderName = (folderName) => {
  const match = String(folderName || '').match(/^(.+?)\s*-\s*(.+)$/);
  return {
    code: match ? match[1].trim() : '',
    clientName: match ? match[2].trim() : folderName,
  };
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
  return entries
    .filter((entry) => entry.isDirectory() && normalize(entry.name) === 'CONTRATO')
    .map((entry) => path.join(projectDir, entry.name))[0] || null;
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
  return {ok: true, reason: '', size: stat.size};
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

const extractContractNumberFromFileName = (filePath) => {
  const base = path.basename(filePath, path.extname(filePath));
  const match = base.match(/100\d{5,}(?:-[A-Za-z0-9]+)?/i);
  return match ? match[0] : '';
};

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const extractClientData = (text) => {
  const clientMatch = text.match(/CLIENTE\s+TIPO DE CONTRATO\s+([\s\S]{1,180}?)(?:\s+Normal|\s+Especial|\s+CPF\/CNPJ|\n)/i);
  const cpfMatch = text.match(/CPF\/CNPJ[\s\S]{0,160}?(\d{2,3}\.?\d{3}\.?\d{3}[-/.]?\d{2,4}(?:\/\d{4}-?\d{2})?)/i);
  return {
    name: cleanText(clientMatch?.[1] || '').replace(/^\d+\s*-\s*/, '').trim(),
    document: cpfMatch?.[1] || '',
  };
};

const extractDocumentTotal = (text) => {
  const totalMatch = text.match(/Total do pedido:\s*([\d.]+,\d{2})/i) || text.match(/TOTAL A PRAZO\s+[\s\S]{0,80}?([\d.]+,\d{2})/i);
  return totalMatch ? parseBrazilianCurrency(totalMatch[1]) : null;
};

const tokens = (value) => normalize(value).split(' ').filter((token) => token.length > 1);

const similarity = (left, right) => {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  const dice = (2 * intersection) / (leftTokens.size + rightTokens.size);
  return Math.max(dice, containment >= 1 && Math.min(leftTokens.size, rightTokens.size) >= 2 ? 0.9 : containment * 0.75);
};

const loadSnapshot = async () => {
  const [clientsResult, contractsResult] = await Promise.all([
    supabase
      .from('clients')
      .select('id,name,cpf,phone,email,empresa_id')
      .eq('empresa_id', empresaId),
    supabase
      .from('client_contracts')
      .select('id,empresa_id,client_id,contract_number,deleted_at,source_document,client:clients(id,name)')
      .eq('empresa_id', empresaId),
  ]);

  if (clientsResult.error) throw new Error(`Erro ao ler clientes: ${clientsResult.error.message}`);
  if (contractsResult.error) throw new Error(`Erro ao ler contratos: ${contractsResult.error.message}`);

  const contracts = contractsResult.data || [];
  const contractIds = contracts.map((contract) => contract.id).filter(Boolean);
  const piecesResult = contractIds.length
    ? await supabase
      .from('client_contract_pieces')
      .select('id,contract_id,piece_label,sort_order,deleted_at')
      .in('contract_id', contractIds)
      .is('deleted_at', null)
    : {data: [], error: null};

  if (piecesResult.error) throw new Error(`Erro ao ler pecas: ${piecesResult.error.message}`);

  return {
    clients: clientsResult.data || [],
    contracts,
    pieces: piecesResult.data || [],
  };
};

const findClient = ({clients, contractNumber, folderClientName, documentClientName, document}) => {
  const manualName = manualClients.get(contractNumber);
  if (manualName) {
    const matches = clients.filter((client) => normalize(client.name) === normalize(manualName));
    return {
      status: matches.length === 1 ? 'MATCH_MANUAL' : matches.length > 1 ? 'CLIENTE_AMBIGUO' : 'CLIENTE_NAO_ENCONTRADO',
      client: matches[0] || null,
      candidates: matches.map((client) => ({id: client.id, name: client.name})),
      reason: `Decisao manual: ${manualName}`,
    };
  }

  const documentDigits = digits(document);
  if (documentDigits) {
    const matches = clients.filter((client) => digits(client.cpf) && digits(client.cpf) === documentDigits);
    if (matches.length === 1) {
      return {status: 'MATCH_DOCUMENTO', client: matches[0], candidates: [], reason: 'CPF/CNPJ corresponde ao CRM.'};
    }
    if (matches.length > 1) {
      return {status: 'CLIENTE_AMBIGUO', client: null, candidates: matches.map((client) => ({id: client.id, name: client.name})), reason: 'CPF/CNPJ aparece em mais de um cliente.'};
    }
  }

  const scored = clients.map((client) => {
    const documentScore = similarity(documentClientName, client.name);
    const folderScore = similarity(folderClientName, client.name);
    const score = documentClientName ? (documentScore * 0.7) + (folderScore * 0.3) : folderScore;
    return {client, score, documentScore, folderScore};
  }).sort((left, right) => right.score - left.score);
  const top = scored[0];
  const second = scored[1];
  if (!top || top.score < 0.58) {
    return {
      status: 'CLIENTE_NAO_ENCONTRADO',
      client: null,
      candidates: scored.slice(0, 3).map((item) => ({id: item.client.id, name: item.client.name, score: Number(item.score.toFixed(3))})),
      reason: 'Nenhum cliente atingiu similaridade minima.',
    };
  }
  if (second && second.score >= 0.58 && top.score - second.score < 0.16) {
    return {
      status: 'CLIENTE_AMBIGUO',
      client: null,
      candidates: scored.slice(0, 3).map((item) => ({id: item.client.id, name: item.client.name, score: Number(item.score.toFixed(3))})),
      reason: 'Mais de um cliente possui nome semelhante.',
    };
  }
  return {
    status: 'MATCH_NOME',
    client: top.client,
    candidates: scored.slice(0, 3).map((item) => ({id: item.client.id, name: item.client.name, score: Number(item.score.toFixed(3))})),
    reason: 'Nome do documento/pasta aponta para um unico cliente.',
  };
};

const normalizePieceKey = (piece) => `${normalize(piece.label || piece.piece_label || '')}:${money(piece.value ?? piece.pieceTotal ?? 0).toFixed(2)}`;

const reconcileContract = ({contracts, pieces, contractNumber, masonryPieces, masonryTotal, crmClientId}) => {
  const sameNumber = contracts.filter((contract) => normalize(contract.contract_number) === normalize(contractNumber));
  const active = sameNumber.filter((contract) => !contract.deleted_at);
  const deleted = sameNumber.filter((contract) => contract.deleted_at);

  if (active.length > 0) {
    const contract = active[0];
    const activePieces = pieces.filter((piece) => piece.contract_id === contract.id);
    const financialPieces = Array.isArray(contract.source_document?.financial?.pieces)
      ? contract.source_document.financial.pieces
      : [];
    const crmTotal = money(contract.source_document?.financial?.contractTotal);
    const expectedKeys = masonryPieces.map(normalizePieceKey).sort();
    const crmKeys = financialPieces.length
      ? financialPieces.map((piece) => normalizePieceKey({label: piece.label, value: piece.value})).sort()
      : activePieces.map((piece) => normalizePieceKey({label: piece.piece_label, value: 0})).sort();
    const differences = [];

    if (crmClientId && contract.client_id !== crmClientId) {
      differences.push(`Cliente divergente: CRM=${contract.client?.name || contract.client_id}`);
    }
    if (activePieces.length !== masonryPieces.length) {
      differences.push(`Quantidade de pecas divergente: CRM=${activePieces.length}, Drive=${masonryPieces.length}`);
    }
    if (Math.abs(crmTotal - masonryTotal) > 0.01) {
      differences.push(`Total divergente: CRM=${crmTotal}, Drive=${masonryTotal}`);
    }
    if (JSON.stringify(crmKeys) !== JSON.stringify(expectedKeys)) {
      differences.push('Lista de pecas/valores diverge.');
    }

    return {
      status: differences.length ? 'ATIVO_DIVERGENTE' : 'ATIVO_CORRETO',
      crmContract: contract,
      differences,
      crmPieceCount: activePieces.length,
      crmTotal,
    };
  }

  if (deleted.length > 0) {
    return {
      status: 'SOFT_DELETED_REVIEW',
      crmContract: deleted[0],
      differences: ['Registro existe apenas como soft-deleted; nao restaurar automaticamente.'],
      crmPieceCount: 0,
      crmTotal: money(deleted[0].source_document?.financial?.contractTotal),
    };
  }

  return {
    status: 'NAO_EXISTE',
    crmContract: null,
    differences: ['Contrato nao existe ativo nem soft-deleted no CRM atual.'],
    crmPieceCount: 0,
    crmTotal: 0,
  };
};

const main = async () => {
  const rootStat = await fs.stat(rootDir).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`Diretorio raiz invalido: ${rootDir}`);

  const [snapshot, entries] = await Promise.all([
    loadSnapshot(),
    readDirectorySafe(rootDir),
  ]);
  const projectFolders = entries.filter((entry) => entry.isDirectory());
  const rows = [];
  const folderRows = [];
  const invalidFiles = [];
  const unsupportedFiles = [];
  const errors = [];
  const formats = new Map();
  const scannedFiles = new Set();
  const highlighted = new Map(highlightedNeedles.map((item) => [item.key, {
    label: item.label,
    found: false,
    rows: [],
  }]));

  let foldersWithContract = 0;
  let totalFiles = 0;
  let validPdfs = 0;

  for (const entry of projectFolders) {
    const projectDir = path.join(rootDir, entry.name);
    const folderInfo = parseFolderName(entry.name);
    const contractDir = await findContractDirectory(projectDir);
    if (!contractDir) {
      folderRows.push({folderName: entry.name, hasContractFolder: false, filesFound: 0});
      continue;
    }

    foldersWithContract += 1;
    const files = await collectFiles(contractDir);
    totalFiles += files.length;
    folderRows.push({folderName: entry.name, hasContractFolder: true, filesFound: files.length});

    for (const filePath of files) {
      scannedFiles.add(path.normalize(filePath).toLowerCase());
      const relativeFilePath = path.relative(rootDir, filePath);
      const fileName = path.basename(filePath);
      const extension = path.extname(filePath).toLowerCase() || '(sem extensao)';
      formats.set(extension, (formats.get(extension) || 0) + 1);
      const highlightedMatch = highlightedNeedles.find((item) =>
        normalize(`${entry.name} ${relativeFilePath}`).includes(normalize(item.key)),
      );
      const validation = await validatePdf(filePath).catch((error) => ({ok: false, reason: error.message, size: null}));

      if (!validation.ok) {
        const unsupported = extension !== '.pdf' && validation.reason === 'INVALID_MAGIC_BYTES';
        const fileIssue = {folderName: entry.name, fileName, filePath: relativeFilePath, extension, reason: validation.reason};
        if (unsupported) {
          unsupportedFiles.push(fileIssue);
        } else {
          invalidFiles.push(fileIssue);
        }
        if (highlightedMatch) {
          const bucket = highlighted.get(highlightedMatch.key);
          bucket.found = true;
          bucket.rows.push({
            fileName,
            filePath: relativeFilePath,
            status: unsupported ? 'FORMATO_NAO_SUPORTADO' : 'DOCUMENTO_INVALIDO',
            reason: validation.reason,
          });
        }
        continue;
      }

      validPdfs += 1;

      try {
        const text = await extractPdfText(filePath);
        const contractNumber = extractOfficialContractNumber(text) || extractContractNumberFromFileName(filePath);
        const clientData = extractClientData(text);
        const documentItems = parseHistoricalContractItemsFromText(text);
        const masonryPieces = toMasonryPieces(documentItems);
        const masonryTotal = sumMasonryPieces(masonryPieces);
        const documentTotal = extractDocumentTotal(text);
        const clientMatch = findClient({
          clients: snapshot.clients,
          contractNumber,
          folderClientName: folderInfo.clientName,
          documentClientName: clientData.name,
          document: clientData.document,
        });
        const crm = contractNumber
          ? reconcileContract({
            contracts: snapshot.contracts,
            pieces: snapshot.pieces,
            contractNumber,
            masonryPieces,
            masonryTotal,
            crmClientId: clientMatch.client?.id || '',
          })
          : {status: 'ERRO_EXTRACAO', crmContract: null, differences: ['Numero do contrato nao identificado.'], crmPieceCount: 0, crmTotal: 0};
        const status = !contractNumber
          ? 'ERRO_EXTRACAO'
          : clientMatch.status === 'CLIENTE_AMBIGUO'
            ? 'CLIENTE_AMBIGUO'
            : masonryPieces.length === 0
              ? 'SEM_ITEM_MARMORARIA'
              : crm.status;
        const row = {
          folder_name: entry.name,
          file_name: fileName,
          file_path: relativeFilePath,
          extension,
          file_size: validation.size,
          folder_client: folderInfo.clientName,
          document_client: clientData.name,
          document_masked: clientData.document ? `${digits(clientData.document).slice(0, 3)}***${digits(clientData.document).slice(-2)}` : '',
          contract_number: contractNumber,
          crm_client: clientMatch.client?.name || '',
          crm_client_id: clientMatch.client?.id || '',
          crm_contract_id: crm.crmContract?.id || '',
          crm_contract_status: crm.status,
          crm_piece_count: crm.crmPieceCount,
          crm_total: crm.crmTotal,
          total_document_items: documentItems.length,
          masonry_items: masonryPieces.length,
          ignored_non_masonry_items: Math.max(0, documentItems.length - masonryPieces.length),
          masonry_total: masonryTotal,
          document_total: documentTotal,
          pieces: masonryPieces.map((piece) => ({
            item_number: piece.itemNumber,
            description: piece.label,
            supplier: piece.supplier,
            line: piece.line,
            value: piece.value,
          })),
          status,
          differences: crm.differences,
          warnings: [
            clientMatch.status === 'CLIENTE_NAO_ENCONTRADO' ? clientMatch.reason : '',
            clientMatch.status === 'CLIENTE_AMBIGUO' ? clientMatch.reason : '',
          ].filter(Boolean),
          candidates: clientMatch.candidates,
        };
        rows.push(row);

        if (highlightedMatch) {
          const bucket = highlighted.get(highlightedMatch.key);
          bucket.found = true;
          bucket.rows.push({
            fileName,
            filePath: relativeFilePath,
            contractNumber,
            documentClient: clientData.name,
            masonryItems: masonryPieces.length,
            masonryTotal,
            crmExists: Boolean(crm.crmContract),
            status,
          });
        }
      } catch (error) {
        const errorRow = {
          folderName: entry.name,
          fileName,
          filePath: relativeFilePath,
          reason: error instanceof Error ? error.message : String(error),
        };
        errors.push(errorRow);
        rows.push({
          folder_name: entry.name,
          file_name: fileName,
          file_path: relativeFilePath,
          folder_client: folderInfo.clientName,
          contract_number: '',
          status: 'ERRO_EXTRACAO',
          differences: [errorRow.reason],
          warnings: [errorRow.reason],
        });
      }
    }
  }

  const allFiles = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = await readDirectorySafe(current);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        allFiles.push(fullPath);
      }
    }
  }

  const highlightedExtraFiles = allFiles.filter((filePath) => {
    const normalizedPath = path.normalize(filePath).toLowerCase();
    if (scannedFiles.has(normalizedPath)) return false;
    return highlightedNeedles.some((item) => normalize(path.relative(rootDir, filePath)).includes(normalize(item.key)));
  });

  for (const filePath of highlightedExtraFiles) {
    const relativeFilePath = path.relative(rootDir, filePath);
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase() || '(sem extensao)';
    const highlightedMatch = highlightedNeedles.find((item) =>
      normalize(relativeFilePath).includes(normalize(item.key)),
    );
    formats.set(extension, (formats.get(extension) || 0) + 1);
    totalFiles += 1;

    const validation = await validatePdf(filePath).catch((error) => ({ok: false, reason: error.message, size: null}));
    if (!validation.ok) {
      const unsupported = extension !== '.pdf' && validation.reason === 'INVALID_MAGIC_BYTES';
      const fileIssue = {folderName: '(fora de CONTRATO)', fileName, filePath: relativeFilePath, extension, reason: validation.reason};
      if (unsupported) {
        unsupportedFiles.push(fileIssue);
      } else {
        invalidFiles.push(fileIssue);
      }
      if (highlightedMatch) {
        const bucket = highlighted.get(highlightedMatch.key);
        bucket.found = true;
        bucket.rows.push({
          fileName,
          filePath: relativeFilePath,
          status: unsupported ? 'FORMATO_NAO_SUPORTADO' : 'DOCUMENTO_INVALIDO',
          reason: validation.reason,
        });
      }
      continue;
    }

    validPdfs += 1;

    try {
      const text = await extractPdfText(filePath);
      const contractNumber = extractOfficialContractNumber(text) || extractContractNumberFromFileName(filePath);
      const clientData = extractClientData(text);
      const documentItems = parseHistoricalContractItemsFromText(text);
      const masonryPieces = toMasonryPieces(documentItems);
      const masonryTotal = sumMasonryPieces(masonryPieces);
      const documentTotal = extractDocumentTotal(text);
      const folderClientName = path.basename(filePath, path.extname(filePath));
      const clientMatch = findClient({
        clients: snapshot.clients,
        contractNumber,
        folderClientName,
        documentClientName: clientData.name,
        document: clientData.document,
      });
      const crm = contractNumber
        ? reconcileContract({
          contracts: snapshot.contracts,
          pieces: snapshot.pieces,
          contractNumber,
          masonryPieces,
          masonryTotal,
          crmClientId: clientMatch.client?.id || '',
        })
        : {status: 'ERRO_EXTRACAO', crmContract: null, differences: ['Numero do contrato nao identificado.'], crmPieceCount: 0, crmTotal: 0};
      const status = !contractNumber
        ? 'ERRO_EXTRACAO'
        : clientMatch.status === 'CLIENTE_AMBIGUO'
          ? 'CLIENTE_AMBIGUO'
          : masonryPieces.length === 0
            ? 'SEM_ITEM_MARMORARIA'
            : crm.status;
      const row = {
        folder_name: '(fora de CONTRATO)',
        file_name: fileName,
        file_path: relativeFilePath,
        extension,
        file_size: validation.size,
        folder_client: folderClientName,
        document_client: clientData.name,
        document_masked: clientData.document ? `${digits(clientData.document).slice(0, 3)}***${digits(clientData.document).slice(-2)}` : '',
        contract_number: contractNumber,
        crm_client: clientMatch.client?.name || '',
        crm_client_id: clientMatch.client?.id || '',
        crm_contract_id: crm.crmContract?.id || '',
        crm_contract_status: crm.status,
        crm_piece_count: crm.crmPieceCount,
        crm_total: crm.crmTotal,
        total_document_items: documentItems.length,
        masonry_items: masonryPieces.length,
        ignored_non_masonry_items: Math.max(0, documentItems.length - masonryPieces.length),
        masonry_total: masonryTotal,
        document_total: documentTotal,
        pieces: masonryPieces.map((piece) => ({
          item_number: piece.itemNumber,
          description: piece.label,
          supplier: piece.supplier,
          line: piece.line,
          value: piece.value,
        })),
        status,
        differences: crm.differences,
        warnings: ['Documento destacado encontrado fora de uma pasta CONTRATO.'],
        candidates: clientMatch.candidates,
      };
      rows.push(row);

      if (highlightedMatch) {
        const bucket = highlighted.get(highlightedMatch.key);
        bucket.found = true;
        bucket.rows.push({
          fileName,
          filePath: relativeFilePath,
          contractNumber,
          documentClient: clientData.name,
          masonryItems: masonryPieces.length,
          masonryTotal,
          crmExists: Boolean(crm.crmContract),
          status,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push({folderName: '(fora de CONTRATO)', fileName, filePath: relativeFilePath, reason});
      if (highlightedMatch) {
        const bucket = highlighted.get(highlightedMatch.key);
        bucket.found = true;
        bucket.rows.push({
          fileName,
          filePath: relativeFilePath,
          status: 'ERRO_EXTRACAO',
          reason,
        });
      }
    }
  }

  const summary = {
    foldersAnalyzed: projectFolders.length,
    foldersWithContract,
    foldersWithoutContract: projectFolders.length - foldersWithContract,
    filesFound: totalFiles,
    validPdfs,
    otherFormats: Object.fromEntries([...formats.entries()].filter(([extension]) => extension !== '.pdf').sort()),
    unsupportedFiles: unsupportedFiles.length,
    invalidFiles: invalidFiles.length,
    extractionErrors: errors.length,
    contractsFound: rows.filter((row) => row.contract_number).length,
    activeCorrect: rows.filter((row) => row.status === 'ATIVO_CORRETO').length,
    activeDivergent: rows.filter((row) => row.status === 'ATIVO_DIVERGENTE').length,
    missingInCrm: rows.filter((row) => row.status === 'NAO_EXISTE').length,
    softDeletedReview: rows.filter((row) => row.status === 'SOFT_DELETED_REVIEW').length,
    noMasonryItems: rows.filter((row) => row.status === 'SEM_ITEM_MARMORARIA').length,
    ambiguousClients: rows.filter((row) => row.status === 'CLIENTE_AMBIGUO').length,
    documentInvalid: invalidFiles.length,
    rawDocumentItems: rows.reduce((sum, row) => sum + (Number(row.total_document_items) || 0), 0),
    validMasonryItems: rows.reduce((sum, row) => sum + (Number(row.masonry_items) || 0), 0),
    ignoredNonMasonryItems: rows.reduce((sum, row) => sum + (Number(row.ignored_non_masonry_items) || 0), 0),
    masonryTotal: money(rows.reduce((sum, row) => sum + (Number(row.masonry_total) || 0), 0)),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'DRIVE_CRM_MASONRY_RECONCILIATION_READ_ONLY',
    rootDir,
    empresaId,
    summary,
    highlighted: Object.fromEntries(highlighted.entries()),
    folders: folderRows,
    invalidFiles,
    unsupportedFiles,
    errors,
    rows,
  };

  await fs.mkdir(outputDir, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `historical-contracts-reconciliation-${stamp}.json`);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({outputPath, summary, highlighted: report.highlighted}, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
