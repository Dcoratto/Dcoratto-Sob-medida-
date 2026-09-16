import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {extractOfficialContractNumber} from '../src/lib/contractParser.ts';

dotenv.config({path: '.env'});
dotenv.config({path: '.env.local', override: true});

const execFileAsync = promisify(execFile);
const maxBytes = 12 * 1024 * 1024;
const defaultReportPath = path.join(process.cwd(), 'reports', 'historical-contracts-preflight-2026-09-16T15-18-15-044Z.json');
const empresaId = 'dcoratto-main';
const actorName = 'Importacao historica Fase 2';

const argv = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith('--')) continue;
  const [key, inlineValue] = value.slice(2).split('=');
  const nextArgument = process.argv[index + 1];
  const hasSeparateValue = inlineValue === undefined && nextArgument && !nextArgument.startsWith('--');
  const nextValue = inlineValue ?? (hasSeparateValue ? nextArgument : true);
  argv.set(key, nextValue);
  if (hasSeparateValue) index += 1;
}

const rootDir = argv.get('root') || "G:\\Meu Drive\\D'CORATTO MARMORARIA\\PROJETOS";
const preflightPath = argv.get('preflight') || defaultReportPath;
const outputDir = argv.get('out') || path.join(process.cwd(), 'reports');
const pythonExecutable = argv.get('python') || 'python';
const shouldExecute = argv.has('execute');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para a leitura administrativa.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {persistSession: false, autoRefreshToken: false},
});

const manualDecisions = new Map([
  ['100001670', {targetClientName: 'LION ADMINISTRADORA DE BENS LTDA', canCreateClient: true}],
  ['100001671', {targetClientName: 'LION ADMINISTRADORA DE BENS LTDA', canCreateClient: true}],
  ['100001744', {targetClientName: 'CAMILA SBI', canCreateClient: false}],
  ['100001690', {targetClientName: 'BIANCA JURTICK', canCreateClient: true}],
]);

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const digits = (value) => String(value || '').replace(/\D/g, '');

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

const money = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const maskDocument = (value) => {
  const raw = digits(value);
  if (!raw) return '';
  if (raw.length <= 4) return '***';
  return `${raw.slice(0, 3)}***${raw.slice(-2)}`;
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

const extractContractNumberFromFileName = (filePath) => {
  const base = path.basename(filePath, path.extname(filePath));
  const match = base.match(/100\d{5,}(?:-[A-Za-z0-9]+)?/i);
  return match ? match[0] : '';
};

const splitPieceLabel = (body) => {
  const knownSupplier = /(DCORATTO SOB MEDIDA|BOA VISTA PLANEJADOS|VITTA PLANEJADOS|GRANITOS E|PLANEJADOS)/i;
  const match = body.match(knownSupplier);
  return cleanText(match ? body.slice(0, match.index) : body);
};

const extractPieces = (text) => {
  const itemBlockMatch = text.match(/ITEM\s+QTD\s+DESCRI[\s\S]{0,80}?VALOR\s+([\s\S]*?)Total do pedido:/i);
  const sourceText = itemBlockMatch?.[1] || '';
  const pieces = [];
  const seen = new Set();
  const linePattern = /^\s*(\d{1,3})\s+[\d,.]+\s+(.+?)\s+\d{1,3}\s+([\d.]+,\d{2})\s*$/gim;
  for (const match of sourceText.matchAll(linePattern)) {
    const sortOrder = Number(match[1]);
    const label = splitPieceLabel(match[2]);
    const value = parseBrazilianCurrency(match[3]);
    const key = `${sortOrder}:${label}:${value}`;
    if (!label || !value || seen.has(key)) continue;
    seen.add(key);
    pieces.push({label: label.slice(0, 180), value, sortOrder});
  }
  return pieces.sort((a, b) => a.sortOrder - b.sortOrder);
};

const extractClientData = (text, fallbackName) => {
  const clientMatch = text.match(/CLIENTE\s+TIPO DE CONTRATO\s+([\s\S]{1,180}?)(?:\s+Normal|\s+Especial|\s+CPF\/CNPJ|\n)/i);
  const cpfMatch = text.match(/CPF\/CNPJ[\s\S]{0,160}?(\d{2,3}\.?\d{3}\.?\d{3}[-/.]?\d{2,4}(?:\/\d{4}-?\d{2})?)/i);
  const phoneMatch = text.match(/TELEFONE\s+PROFISS[\s\S]{0,160}?((?:\(?\d{2}\)?[-\s]?)?\d{4,5}[-\s]?\d{4})/i);
  const addressMatch = text.match(/ENDERE[CÇ][O0] ATUAL\s+([\s\S]{1,180}?)(?:\nBAIRRO|\s+BAIRRO)/i);
  const cityBlockMatch = text.match(/BAIRRO\s+CIDADE\s+UF\s+CEP\s+([\s\S]{1,180}?)(?:\nTELEFONE|\s+TELEFONE)/i);
  const cityParts = cleanText(cityBlockMatch?.[1] || '').split(/\s+/);
  return {
    parsedClientName: cleanText(clientMatch?.[1] || '').replace(/^\d+\s*-\s*/, '').trim(),
    cpf: cpfMatch?.[1] || '',
    phone: phoneMatch?.[1] || '',
    address: cleanText(addressMatch?.[1] || ''),
    city: cityParts.length >= 3 ? cityParts.slice(1, -2).join(' ') : '',
    neighborhood: cityParts[0] || '',
    fallbackName,
  };
};

const parsePdf = async (absolutePath, fallbackName) => {
  const text = await extractPdfText(absolutePath);
  const contractNumber = extractOfficialContractNumber(text) || extractContractNumberFromFileName(absolutePath);
  const dateMatch = text.match(/DATA DO CONTRATO[\s\S]{0,220}?(\d{2}\/\d{2}\/\d{4})/i) || text.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
  const totalMatch = text.match(/Total do pedido:\s*([\d.]+,\d{2})/i) || text.match(/TOTAL A PRAZO\s+[\s\S]{0,80}?([\d.]+,\d{2})/i);
  const pieces = extractPieces(text);
  return {
    contractNumber,
    contractDate: parseBrazilianDate(dateMatch?.[1] || ''),
    contractTotal: totalMatch ? parseBrazilianCurrency(totalMatch[1]) : null,
    pieces: pieces.map((piece, index) => ({...piece, sortOrder: index + 1})),
    clientData: extractClientData(text, fallbackName),
  };
};

const loadSnapshot = async () => {
  const [clientsResult, contractsResult] = await Promise.all([
    supabase
      .from('clients')
      .select('id,empresa_id,name,cpf,phone,email,address,city,neighborhood')
      .eq('empresa_id', empresaId),
    supabase
      .from('client_contracts')
      .select('id,empresa_id,client_id,contract_number,deleted_at')
      .eq('empresa_id', empresaId),
  ]);

  if (clientsResult.error) throw new Error(`Erro ao ler clientes: ${clientsResult.error.message}`);
  if (contractsResult.error) throw new Error(`Erro ao ler contratos: ${contractsResult.error.message}`);

  return {
    clients: clientsResult.data || [],
    contracts: contractsResult.data || [],
  };
};

const findClientByName = (clients, name) => {
  const target = normalize(name);
  return clients.filter((client) => normalize(client.name) === target);
};

const duplicateStatus = (contracts, contractNumber) => {
  const matches = contracts.filter((contract) => normalize(contract.contract_number) === normalize(contractNumber));
  if (matches.some((contract) => contract.deleted_at)) return {status: 'SOFT_DELETED_SKIPPED', matches};
  if (matches.length > 0) return {status: 'ALREADY_EXISTS', matches};
  return {status: 'IMPORTABLE', matches: []};
};

const main = async () => {
  const [preflightRaw, snapshot] = await Promise.all([
    fs.readFile(preflightPath, 'utf8'),
    loadSnapshot(),
  ]);
  const preflight = JSON.parse(preflightRaw);
  const rows = [];
  const payload = [];

  for (const row of preflight.rows) {
    const warnings = [];
    if (!row.contractNumber || !row.filePath) {
      rows.push({
        folder: row.folderName,
        file: row.filePath || '',
        crm_client: row.crmClientName || '',
        contract_number: row.contractNumber || '',
        piece_count: 0,
        contract_total: null,
        status: 'PENDING_REVIEW',
        reason: 'Sem PDF/numero de contrato importavel.',
        warnings: row.warnings || [],
      });
      continue;
    }

    const absolutePath = path.join(rootDir, row.filePath);
    const validation = await validatePdf(absolutePath).catch((error) => ({ok: false, reason: error.message, size: null}));
    if (!validation.ok) {
      rows.push({
        folder: row.folderName,
        file: row.filePath,
        crm_client: row.crmClientName || '',
        contract_number: row.contractNumber,
        piece_count: 0,
        contract_total: null,
        status: 'FAILED',
        reason: `PDF invalido: ${validation.reason}`,
        warnings,
      });
      continue;
    }

    const parsed = await parsePdf(absolutePath, row.folderClientName);
    const contractNumber = parsed.contractNumber || row.contractNumber;
    if (contractNumber !== row.contractNumber) {
      warnings.push(`Numero reextraido diverge do preflight: ${parsed.contractNumber} vs ${row.contractNumber}.`);
    }

    const duplicate = duplicateStatus(snapshot.contracts, contractNumber);
    if (duplicate.status !== 'IMPORTABLE') {
      rows.push({
        folder: row.folderName,
        file: row.filePath,
        crm_client: row.crmClientName || '',
        contract_number: contractNumber,
        piece_count: parsed.pieces.length,
        contract_total: money(parsed.contractTotal),
        status: duplicate.status,
        reason: duplicate.status === 'SOFT_DELETED_SKIPPED' ? 'Contrato existe como soft-deleted e nao sera restaurado.' : 'Contrato ja existe no CRM.',
        warnings,
      });
      continue;
    }

    if (parsed.pieces.length === 0) {
      rows.push({
        folder: row.folderName,
        file: row.filePath,
        crm_client: row.crmClientName || '',
        contract_number: contractNumber,
        piece_count: 0,
        contract_total: money(parsed.contractTotal),
        status: 'PENDING_REVIEW',
        reason: 'Sem pecas identificadas com seguranca.',
        warnings,
      });
      continue;
    }

    const decision = manualDecisions.get(contractNumber);
    const targetClientName = decision?.targetClientName || row.crmClientName;
    if (!targetClientName) {
      rows.push({
        folder: row.folderName,
        file: row.filePath,
        crm_client: '',
        contract_number: contractNumber,
        piece_count: parsed.pieces.length,
        contract_total: money(parsed.contractTotal),
        status: 'PENDING_REVIEW',
        reason: 'Sem cliente CRM definido.',
        warnings,
      });
      continue;
    }

    const exactClients = findClientByName(snapshot.clients, targetClientName);
    if (exactClients.length > 1) {
      rows.push({
        folder: row.folderName,
        file: row.filePath,
        crm_client: targetClientName,
        contract_number: contractNumber,
        piece_count: parsed.pieces.length,
        contract_total: money(parsed.contractTotal),
        status: 'PENDING_REVIEW',
        reason: 'Cliente alvo ambiguo no CRM.',
        warnings,
      });
      continue;
    }

    const existingClient = exactClients[0] || null;
    if (!existingClient && !decision?.canCreateClient) {
      rows.push({
        folder: row.folderName,
        file: row.filePath,
        crm_client: targetClientName,
        contract_number: contractNumber,
        piece_count: parsed.pieces.length,
        contract_total: money(parsed.contractTotal),
        status: 'PENDING_REVIEW',
        reason: 'Cliente alvo nao encontrado e criacao nao autorizada.',
        warnings,
      });
      continue;
    }

    const clientPayload = existingClient
      ? {id: existingClient.id, name: existingClient.name, action: 'REUSE'}
      : {
        id: null,
        name: targetClientName,
        action: 'CREATE',
        cpf: parsed.clientData.cpf || null,
        phone: parsed.clientData.phone || '',
        address: parsed.clientData.address || '',
        city: parsed.clientData.city || null,
        neighborhood: parsed.clientData.neighborhood || null,
      };

    const importItem = {
      folder: row.folderName,
      file: row.filePath,
      contractNumber,
      contractDate: parsed.contractDate,
      contractTotal: money(parsed.contractTotal),
      parsedClientName: parsed.clientData.parsedClientName,
      parsedDocumentMasked: maskDocument(parsed.clientData.cpf),
      targetClient: clientPayload,
      pieces: parsed.pieces.map((piece) => ({
        label: piece.label,
        value: money(piece.value),
      })),
      warnings,
    };
    payload.push(importItem);
    rows.push({
      folder: row.folderName,
      file: row.filePath,
      crm_client: clientPayload.name,
      contract_number: contractNumber,
      piece_count: importItem.pieces.length,
      contract_total: importItem.contractTotal,
      status: 'READY_TO_IMPORT',
      reason: clientPayload.action === 'CREATE' ? 'Cliente novo autorizado sera criado.' : 'Cliente existente sera reutilizado.',
      warnings,
    });
  }

  const importResults = [];
  if (shouldExecute) {
    for (const item of payload) {
      const {data, error} = await supabase.rpc('import_historical_client_contract', {
        p_empresa_id: empresaId,
        p_client_id: item.targetClient.id,
        p_create_client: item.targetClient.action === 'CREATE',
        p_client: item.targetClient,
        p_contract_number: item.contractNumber,
        p_contract_date: item.contractDate,
        p_contract_total: item.contractTotal,
        p_pieces: item.pieces,
        p_source_document: {
          historicalImport: {
            phase: 'FASE_2',
            folder: item.folder,
            file: item.file,
            parsedClientName: item.parsedClientName,
            parsedDocumentMasked: item.parsedDocumentMasked,
          },
        },
        p_actor_name: actorName,
      });

      if (error) {
        importResults.push({
          folder: item.folder,
          file: item.file,
          crm_client: item.targetClient.name,
          contract_number: item.contractNumber,
          piece_count: item.pieces.length,
          contract_total: item.contractTotal,
          status: 'FAILED',
          reason: error.message,
          warnings: item.warnings,
        });
        continue;
      }

      importResults.push({
        folder: item.folder,
        file: item.file,
        crm_client: item.targetClient.name,
        contract_number: item.contractNumber,
        piece_count: item.pieces.length,
        contract_total: item.contractTotal,
        status: data?.status || 'IMPORTED',
        reason: data?.status === 'IMPORTED' ? 'Importado via RPC atomica.' : 'RPC retornou status idempotente.',
        client_created: Boolean(data?.clientCreated),
        contract_id: data?.contractId || '',
        client_id: data?.clientId || item.targetClient.id || '',
        warnings: item.warnings,
      });
    }
  }

  const finalRows = shouldExecute
    ? rows.map((row) => row.status === 'READY_TO_IMPORT'
      ? importResults.find((result) => result.contract_number === row.contract_number) || row
      : row)
    : rows;

  const report = {
    generatedAt: new Date().toISOString(),
    phase: shouldExecute ? 'IMPORT_PHASE_2_EXECUTED' : 'IMPORT_PHASE_2_PLAN',
    rootDir,
    empresaId,
    summary: {
      readyToImport: finalRows.filter((row) => row.status === 'READY_TO_IMPORT').length,
      imported: finalRows.filter((row) => row.status === 'IMPORTED').length,
      alreadyExists: finalRows.filter((row) => row.status === 'ALREADY_EXISTS').length,
      softDeletedSkipped: finalRows.filter((row) => row.status === 'SOFT_DELETED_SKIPPED').length,
      pendingReview: finalRows.filter((row) => row.status === 'PENDING_REVIEW').length,
      failed: finalRows.filter((row) => row.status === 'FAILED').length,
      piecesImported: finalRows.filter((row) => row.status === 'IMPORTED').reduce((sum, item) => sum + item.piece_count, 0),
      totalImported: money(finalRows.filter((row) => row.status === 'IMPORTED').reduce((sum, item) => sum + (Number(item.contract_total) || 0), 0)),
      clientsCreated: Array.from(new Set(finalRows.filter((item) => item.status === 'IMPORTED' && item.client_created).map((item) => item.crm_client))),
      clientsReused: Array.from(new Set(finalRows.filter((item) => item.status === 'IMPORTED' && !item.client_created).map((item) => item.crm_client))),
      clientsToCreate: Array.from(new Set(payload.filter((item) => item.targetClient.action === 'CREATE').map((item) => item.targetClient.name))),
      clientsToReuse: Array.from(new Set(payload.filter((item) => item.targetClient.action === 'REUSE').map((item) => item.targetClient.name))),
    },
    rows: finalRows,
    payload: shouldExecute ? undefined : payload,
  };

  await fs.mkdir(outputDir, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `historical-contracts-import-${shouldExecute ? 'executed' : 'plan'}-${stamp}.json`);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({outputPath, summary: report.summary, actorName}, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
