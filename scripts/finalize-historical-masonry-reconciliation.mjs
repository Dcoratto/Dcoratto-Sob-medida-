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
const actorName = 'Reconciliacao final historica marmoraria';
const defaultRootDir = "G:\\Meu Drive\\D'CORATTO MARMORARIA\\PROJETOS";
const defaultPython = 'C:\\Users\\brian\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const defaultReportPath = path.join(process.cwd(), 'reports', 'historical-contracts-reconciliation-2026-09-17T15-13-54-735Z.json');
const maxBytes = 12 * 1024 * 1024;

const authorizedImports = new Set(['100001286', '100001676', '100001145']);
const authorizedRepairs = new Set(['100001610-1', '100001611']);
const protectedContracts = new Set(['100001647', '100001754']);
const expected = new Map([
  ['100001286', {client: 'ERIC FERREIRA DA SILVA', pieces: 8, total: 19492.61}],
  ['100001676', {client: 'SER FINANCE SOCIEDADE DE CREDITO DIRETO S.A.', pieces: 2, total: 4200}],
  ['100001145', {client: 'THIAGO MIRANDA DE CASTRO', pieces: 2, total: 3211.1}],
  ['100001610-1', {client: 'BRUNO NEVES DOS SANTOS', pieces: 2, total: 6429.74}],
  ['100001611', {client: 'CAMILA GUERINO DE OLIVEIRA MARTINS', pieces: 4, total: 15618.66}],
]);

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

const shouldExecute = argv.has('execute');
const rootDir = argv.get('root') || defaultRootDir;
const reportPath = argv.get('report') || defaultReportPath;
const outputDir = argv.get('out') || path.join(process.cwd(), 'reports');
const pythonExecutable = argv.get('python') || defaultPython;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para a leitura administrativa.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {persistSession: false, autoRefreshToken: false},
});

const money = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const digits = (value) => String(value || '').replace(/\D/g, '');
const normalize = (value) => normalizeMasonryToken(String(value || ''));

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const parseBrazilianCurrency = (value) => {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const parseBrazilianDate = (value) => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const normalizePieceKey = (piece) => `${normalize(piece.label || piece.description || '')}:${money(piece.value).toFixed(2)}`;

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

const extractClientData = (text) => {
  const clientMatch = text.match(/CLIENTE\s+TIPO DE CONTRATO\s+([\s\S]{1,180}?)(?:\s+Normal|\s+Especial|\s+CPF\/CNPJ|\n)/i);
  const cpfMatch = text.match(/CPF\/CNPJ[\s\S]{0,160}?(\d{2,3}\.?\d{3}\.?\d{3}[-/.]?\d{2,4}(?:\/\d{4}-?\d{2})?)/i);
  const phoneMatch = text.match(/TELEFONE\s+PROFISS[\s\S]{0,160}?((?:\(?\d{2}\)?[-\s]?)?\d{4,5}[-\s]?\d{4})/i);
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return {
    name: cleanText(clientMatch?.[1] || '').replace(/^\d+\s*-\s*/, '').trim(),
    cpf: cpfMatch?.[1] || '',
    phone: phoneMatch?.[1] || '',
    email: emailMatch?.[0] || '',
  };
};

const parsePdf = async (row) => {
  const absolutePath = path.join(rootDir, row.file_path);
  const validation = await validatePdf(absolutePath);
  if (!validation.ok) {
    throw new Error(`PDF invalido em ${row.file_path}: ${validation.reason}`);
  }

  const text = await extractPdfText(absolutePath);
  const contractNumber = extractOfficialContractNumber(text) || row.contract_number;
  const dateMatch = text.match(/DATA DO CONTRATO[\s\S]{0,220}?(\d{2}\/\d{2}\/\d{4})/i) || text.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
  const totalMatch = text.match(/Total do pedido:\s*([\d.]+,\d{2})/i) || text.match(/TOTAL A PRAZO\s+[\s\S]{0,80}?([\d.]+,\d{2})/i);
  const documentItems = parseHistoricalContractItemsFromText(text);
  const masonryPieces = toMasonryPieces(documentItems);
  return {
    absolutePath,
    validation,
    contractNumber,
    contractDate: parseBrazilianDate(dateMatch?.[1] || ''),
    documentTotal: totalMatch ? parseBrazilianCurrency(totalMatch[1]) : null,
    client: extractClientData(text),
    documentItems,
    pieces: masonryPieces.map((piece, index) => ({
      label: piece.label,
      value: piece.value,
      itemNumber: piece.itemNumber,
      supplier: piece.supplier,
      line: piece.line,
      sortOrder: index + 1,
    })),
    masonryTotal: sumMasonryPieces(masonryPieces),
  };
};

const loadContracts = async (contractNumbers) => {
  const {data, error} = await supabase
    .from('client_contracts')
    .select('id,empresa_id,client_id,quote_id,contract_number,deleted_at,status,source,source_document,client:clients(id,name,cpf)')
    .eq('empresa_id', empresaId)
    .in('contract_number', contractNumbers);
  if (error) throw new Error(`Erro ao ler contratos: ${error.message}`);
  return data || [];
};

const loadPieces = async (contractIds) => {
  if (contractIds.length === 0) return [];
  const {data, error} = await supabase
    .from('client_contract_pieces')
    .select('id,empresa_id,contract_id,piece_label,sort_order,source,deleted_at')
    .in('contract_id', contractIds)
    .order('sort_order', {ascending: true});
  if (error) throw new Error(`Erro ao ler pecas: ${error.message}`);
  return data || [];
};

const loadClients = async (rows) => {
  const ids = [...new Set(rows.map((row) => row.crm_client_id).filter(Boolean))];
  const names = [...new Set(rows.flatMap((row) => [row.document_client, row.crm_client]).filter(Boolean))];
  let query = supabase
    .from('clients')
    .select('id,empresa_id,name,cpf,phone,email,address,city,neighborhood')
    .eq('empresa_id', empresaId);

  if (ids.length || names.length) {
    const filters = [];
    if (ids.length) filters.push(`id.in.(${ids.map((id) => `"${id}"`).join(',')})`);
    if (names.length) filters.push(`name.in.(${names.map((name) => `"${name.replace(/"/g, '\\"')}"`).join(',')})`);
    query = query.or(filters.join(','));
  }

  const {data, error} = await query;
  if (error) throw new Error(`Erro ao ler clientes: ${error.message}`);
  return data || [];
};

const loadReferenceCounts = async (contractIds, pieceIds) => {
  const [employeeContracts, employeePieces, crisisContracts, crisisPieces, installations] = await Promise.all([
    contractIds.length ? supabase.from('employee_activity_sessions').select('id', {count: 'exact', head: true}).in('contract_id', contractIds) : {count: 0, error: null},
    pieceIds.length ? supabase.from('employee_activity_sessions').select('id', {count: 'exact', head: true}).in('piece_id', pieceIds) : {count: 0, error: null},
    contractIds.length ? supabase.from('crisis_clients').select('id', {count: 'exact', head: true}).in('contract_id', contractIds) : {count: 0, error: null},
    pieceIds.length ? supabase.from('crisis_clients').select('id', {count: 'exact', head: true}).in('piece_id', pieceIds) : {count: 0, error: null},
    contractIds.length ? supabase.from('installations').select('id', {count: 'exact', head: true}).in('contract_id', contractIds) : {count: 0, error: null},
  ]);
  const failed = [employeeContracts, employeePieces, crisisContracts, crisisPieces, installations].find((result) => result.error);
  if (failed?.error) throw new Error(`Erro ao ler referencias: ${failed.error.message}`);
  return {
    employeeContracts: employeeContracts.count || 0,
    employeePieces: employeePieces.count || 0,
    crisisContracts: crisisContracts.count || 0,
    crisisPieces: crisisPieces.count || 0,
    installations: installations.count || 0,
  };
};

const findClient = (clients, row, parsed) => {
  const documentDigits = digits(parsed.client.cpf || row.document_masked);
  const exactDocumentMatches = documentDigits.length > 5
    ? clients.filter((client) => digits(client.cpf) === documentDigits)
    : [];
  if (exactDocumentMatches.length === 1) return {status: 'REUSED_BY_DOCUMENT', client: exactDocumentMatches[0]};
  if (exactDocumentMatches.length > 1) return {status: 'AMBIGUOUS_DOCUMENT', client: null, candidates: exactDocumentMatches};

  const targetName = normalize(parsed.client.name || row.document_client);
  const exactNameMatches = clients.filter((client) => normalize(client.name) === targetName);
  if (exactNameMatches.length === 1) return {status: 'REUSED_BY_NAME', client: exactNameMatches[0]};
  if (exactNameMatches.length > 1) return {status: 'AMBIGUOUS_NAME', client: null, candidates: exactNameMatches};

  if (row.crm_client_id) {
    const byId = clients.find((client) => client.id === row.crm_client_id);
    if (byId && normalize(byId.name) === targetName) return {status: 'REUSED_BY_AUDIT_ID', client: byId};
  }

  return {status: 'CREATE_REQUIRED', client: null};
};

const assertExpected = (row, parsed) => {
  const target = expected.get(row.contract_number);
  if (!target) throw new Error(`Contrato nao autorizado: ${row.contract_number}`);
  if (parsed.contractNumber !== row.contract_number) {
    throw new Error(`Numero reextraido diverge para ${row.contract_number}: ${parsed.contractNumber}`);
  }
  if (normalize(parsed.client.name) !== normalize(target.client)) {
    throw new Error(`Cliente reextraido diverge para ${row.contract_number}: ${parsed.client.name}`);
  }
  if (parsed.pieces.length !== target.pieces) {
    throw new Error(`Quantidade diverge para ${row.contract_number}: ${parsed.pieces.length}`);
  }
  if (Math.abs(parsed.masonryTotal - target.total) > 0.01) {
    throw new Error(`Total diverge para ${row.contract_number}: ${parsed.masonryTotal}`);
  }
};

const main = async () => {
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const allowedNumbers = [...authorizedImports, ...authorizedRepairs];
  const rows = (report.rows || []).filter((row) => allowedNumbers.includes(row.contract_number));
  if (rows.length !== allowedNumbers.length) {
    throw new Error(`Relatorio nao contem exatamente os ${allowedNumbers.length} contratos autorizados.`);
  }
  const protectedRows = (report.rows || []).filter((row) => protectedContracts.has(row.contract_number));

  const parsedByNumber = new Map();
  for (const row of rows) {
    const parsed = await parsePdf(row);
    assertExpected(row, parsed);
    parsedByNumber.set(row.contract_number, parsed);
  }

  const clients = await loadClients(rows);
  const contractsBefore = await loadContracts([...allowedNumbers, ...protectedContracts]);
  const contractIds = contractsBefore.map((contract) => contract.id);
  const piecesBefore = await loadPieces(contractIds);
  const piecesByContract = new Map();
  piecesBefore.filter((piece) => !piece.deleted_at).forEach((piece) => {
    piecesByContract.set(piece.contract_id, [...(piecesByContract.get(piece.contract_id) || []), piece]);
  });

  const repairContracts = contractsBefore.filter((contract) =>
    authorizedRepairs.has(contract.contract_number) && !contract.deleted_at,
  );
  const repairPieceIds = repairContracts.flatMap((contract) => piecesByContract.get(contract.id) || []).map((piece) => piece.id);
  const referenceCounts = await loadReferenceCounts(repairContracts.map((contract) => contract.id), repairPieceIds);
  const hasOperationalReferences = Object.values(referenceCounts).some((count) => count > 0);

  const operations = [];
  for (const row of rows) {
    const parsed = parsedByNumber.get(row.contract_number);
    const existing = contractsBefore.filter((contract) => normalize(contract.contract_number) === normalize(row.contract_number));
    const active = existing.find((contract) => !contract.deleted_at);
    const deleted = existing.find((contract) => contract.deleted_at);

    if (authorizedImports.has(row.contract_number)) {
      const clientDecision = findClient(clients, row, parsed);
      if (deleted) {
        operations.push({contractNumber: row.contract_number, action: 'SKIPPED_SOFT_DELETED', status: 'BLOCKED', reason: 'Contrato soft-deleted existente.'});
        continue;
      }
      if (active) {
        operations.push({contractNumber: row.contract_number, action: 'SKIPPED_ALREADY_EXISTS', status: 'ALREADY_EXISTS', contractId: active.id});
        continue;
      }
      if (clientDecision.status.startsWith('AMBIGUOUS')) {
        operations.push({contractNumber: row.contract_number, action: 'IMPORT', status: 'BLOCKED', reason: clientDecision.status});
        continue;
      }

      operations.push({
        contractNumber: row.contract_number,
        action: 'IMPORT',
        status: 'READY',
        clientDecision,
        parsed,
      });
      continue;
    }

    if (!active) {
      operations.push({contractNumber: row.contract_number, action: 'REPAIR', status: 'BLOCKED', reason: 'Contrato ativo nao encontrado.'});
      continue;
    }
    const currentPieces = piecesByContract.get(active.id) || [];
    const currentFinancialPieces = Array.isArray(active.source_document?.financial?.pieces)
      ? active.source_document.financial.pieces
      : [];
    const currentKeys = currentFinancialPieces.map((piece) => normalizePieceKey(piece)).sort();
    const targetKeys = parsed.pieces.map(normalizePieceKey).sort();
    const isAlreadyCorrect = currentPieces.length === parsed.pieces.length
      && Math.abs(money(active.source_document?.financial?.contractTotal) - parsed.masonryTotal) <= 0.01
      && JSON.stringify(currentKeys) === JSON.stringify(targetKeys);

    operations.push({
      contractNumber: row.contract_number,
      action: 'REPAIR',
      status: isAlreadyCorrect ? 'ALREADY_CORRECT' : hasOperationalReferences ? 'PENDING_OPERATIONAL_REVIEW' : 'READY',
      contract: active,
      parsed,
      currentPieces: currentFinancialPieces,
      activePieceLabels: currentPieces.map((piece) => piece.piece_label),
    });
  }

  const execution = [];
  if (shouldExecute) {
    for (const operation of operations) {
      if (operation.status !== 'READY') {
        execution.push({contractNumber: operation.contractNumber, action: operation.action, status: operation.status, reason: operation.reason || ''});
        continue;
      }

      if (operation.action === 'IMPORT') {
        const client = operation.clientDecision.client;
        const parsed = operation.parsed;
        const {data, error} = await supabase.rpc('import_historical_client_contract', {
          p_empresa_id: empresaId,
          p_client_id: client?.id || null,
          p_create_client: !client,
          p_client: {
            name: parsed.client.name,
            cpf: parsed.client.cpf,
            phone: parsed.client.phone,
            email: parsed.client.email,
          },
          p_contract_number: operation.contractNumber,
          p_contract_date: parsed.contractDate,
          p_contract_total: parsed.masonryTotal,
          p_pieces: parsed.pieces,
          p_source_document: {
            historicalImport: {
              phase: 'FASE_FINAL_RECONCILIACAO',
              sourceReport: path.basename(reportPath),
              file: rows.find((row) => row.contract_number === operation.contractNumber)?.file_path,
              totalDocumentItems: parsed.documentItems.length,
              ignoredNonMasonryItems: Math.max(0, parsed.documentItems.length - parsed.pieces.length),
            },
          },
          p_actor_name: actorName,
        });
        execution.push({
          contractNumber: operation.contractNumber,
          action: operation.action,
          status: error ? 'FAILED' : data?.status || 'IMPORTED',
          reason: error?.message || '',
          result: data || null,
          clientReuse: client ? operation.clientDecision.status : 'CREATED',
        });
        continue;
      }

      const parsed = operation.parsed;
      const {data, error} = await supabase.rpc('repair_historical_contract_masonry_items', {
        p_empresa_id: empresaId,
        p_contract_id: operation.contract.id,
        p_masonry_total: parsed.masonryTotal,
        p_pieces: parsed.pieces,
        p_audit: {
          actorName,
          phase: 'FASE_FINAL_RECONCILIACAO',
          contractNumber: operation.contractNumber,
          sourceReport: path.basename(reportPath),
          previousPieceCount: operation.activePieceLabels.length,
          previousTotal: money(operation.contract.source_document?.financial?.contractTotal),
          totalItems: parsed.documentItems.length,
          ignoredNonMasonryItems: Math.max(0, parsed.documentItems.length - parsed.pieces.length),
        },
      });
      execution.push({
        contractNumber: operation.contractNumber,
        action: operation.action,
        status: error ? 'FAILED' : data?.status || 'CORRECTED',
        reason: error?.message || '',
        result: data || null,
      });
    }
  }

  const contractsAfter = await loadContracts([...allowedNumbers, ...protectedContracts]);
  const piecesAfter = await loadPieces(contractsAfter.map((contract) => contract.id));
  const reportOut = {
    generatedAt: new Date().toISOString(),
    phase: shouldExecute ? 'FASE_FINAL_EXECUTED' : 'FASE_FINAL_DRY_RUN',
    empresaId,
    rootDir,
    sourceReport: reportPath,
    referenceCounts,
    protectedContracts: protectedRows.map((row) => ({
      contractNumber: row.contract_number,
      status: row.status,
      crmContractId: row.crm_contract_id,
    })),
    summary: {
      authorizedImports: operations.filter((operation) => operation.action === 'IMPORT').length,
      authorizedRepairs: operations.filter((operation) => operation.action === 'REPAIR').length,
      ready: operations.filter((operation) => operation.status === 'READY').length,
      executed: execution.filter((operation) => ['IMPORTED', 'CORRECTED'].includes(operation.status)).length,
      failed: execution.filter((operation) => operation.status === 'FAILED').length,
      reusedClients: execution.filter((operation) => operation.action === 'IMPORT' && String(operation.clientReuse || '').startsWith('REUSED')).length,
      createdClients: execution.filter((operation) => operation.action === 'IMPORT' && operation.clientReuse === 'CREATED').length,
      addedMasonryValue: money([...authorizedImports].reduce((sum, contractNumber) => sum + expected.get(contractNumber).total, 0)),
    },
    operations: operations.map((operation) => ({
      contractNumber: operation.contractNumber,
      action: operation.action,
      status: operation.status,
      clientDecision: operation.clientDecision?.status || '',
      clientId: operation.clientDecision?.client?.id || operation.contract?.client_id || '',
      previousPieces: operation.currentPieces || operation.activePieceLabels || [],
      targetPieces: operation.parsed?.pieces || [],
    })),
    execution,
    finalState: contractsAfter.map((contract) => ({
      contractNumber: contract.contract_number,
      contractId: contract.id,
      clientId: contract.client_id,
      clientName: contract.client?.name || '',
      deletedAt: contract.deleted_at,
      total: money(contract.source_document?.financial?.contractTotal),
      activePieceCount: piecesAfter.filter((piece) => piece.contract_id === contract.id && !piece.deleted_at).length,
      financialPieces: contract.source_document?.financial?.pieces || [],
    })),
  };

  await fs.mkdir(outputDir, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `historical-contracts-final-reconciliation-${stamp}.json`);
  await fs.writeFile(outputPath, JSON.stringify(reportOut, null, 2), 'utf8');
  console.log(JSON.stringify({outputPath, summary: reportOut.summary, referenceCounts, execution}, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
