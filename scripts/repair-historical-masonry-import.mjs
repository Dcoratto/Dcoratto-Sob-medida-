import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {parseHistoricalContractItemsFromText, sumMasonryPieces, toMasonryPieces} from '../src/lib/masonryContractItems.ts';

dotenv.config({path: '.env'});
dotenv.config({path: '.env.local', override: true});

const execFileAsync = promisify(execFile);
const empresaId = 'dcoratto-main';
const rootDir = "G:\\Meu Drive\\D'CORATTO MARMORARIA\\PROJETOS";
const outputDir = path.join(process.cwd(), 'reports');
const actorName = 'Correcao importacao historica marmoraria';
const pythonExecutable = 'C:\\Users\\brian\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';

const argv = new Set(process.argv.slice(2));
const shouldExecute = argv.has('--execute');

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

const loadImportedContracts = async () => {
  const {data, error} = await supabase
    .from('client_contracts')
    .select('id,empresa_id,client_id,contract_number,source_document,client:clients(name)')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null);
  if (error) throw new Error(`Erro ao ler contratos: ${error.message}`);

  return (data || [])
    .filter((contract) => contract.source_document?.historicalImport?.phase === 'FASE_2')
    .sort((left, right) => String(left.contract_number).localeCompare(String(right.contract_number)));
};

const loadPieces = async (contractIds) => {
  if (contractIds.length === 0) return [];
  const {data, error} = await supabase
    .from('client_contract_pieces')
    .select('id,contract_id,piece_label,sort_order,source,deleted_at')
    .in('contract_id', contractIds)
    .is('deleted_at', null)
    .order('sort_order', {ascending: true});
  if (error) throw new Error(`Erro ao ler pecas: ${error.message}`);
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
  const results = [employeeContracts, employeePieces, crisisContracts, crisisPieces, installations];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`Erro ao ler referencias: ${failed.error.message}`);

  return {
    employeeContracts: employeeContracts.count || 0,
    employeePieces: employeePieces.count || 0,
    crisisContracts: crisisContracts.count || 0,
    crisisPieces: crisisPieces.count || 0,
    installations: installations.count || 0,
  };
};

const main = async () => {
  const contracts = await loadImportedContracts();
  const contractIds = contracts.map((contract) => contract.id);
  const persistedPieces = await loadPieces(contractIds);
  const piecesByContract = new Map();
  persistedPieces.forEach((piece) => {
    piecesByContract.set(piece.contract_id, [...(piecesByContract.get(piece.contract_id) || []), piece]);
  });
  const referenceCounts = await loadReferenceCounts(contractIds, persistedPieces.map((piece) => piece.id));

  const rows = [];
  const repairPayload = [];

  for (const contract of contracts) {
    const filePath = contract.source_document?.historicalImport?.file || '';
    const absolutePath = path.join(rootDir, filePath);
    const text = await extractPdfText(absolutePath);
    const documentItems = parseHistoricalContractItemsFromText(text);
    const masonryPieces = toMasonryPieces(documentItems);
    const masonryTotal = sumMasonryPieces(masonryPieces);
    const currentPieces = piecesByContract.get(contract.id) || [];
    const previousTotal = money(contract.source_document?.financial?.contractTotal);
    const previousPieceCount = currentPieces.length;
    const status = masonryPieces.length === 0
      ? 'NO_MASONRY_ITEMS'
      : previousPieceCount !== masonryPieces.length || Math.abs(previousTotal - masonryTotal) > 0.01
        ? 'REQUIRES_CORRECTION'
        : 'ALREADY_CORRECT';

    const row = {
      contract_id: contract.id,
      client_id: contract.client_id,
      client: contract.client?.name || '',
      contract_number: contract.contract_number,
      file: filePath,
      total_items: documentItems.length,
      masonry_items: masonryPieces.length,
      persisted_items_before: previousPieceCount,
      incorrect_non_masonry_items: Math.max(0, previousPieceCount - masonryPieces.length),
      document_total_before: previousTotal,
      masonry_total: masonryTotal,
      financial_difference_removed: money(previousTotal - masonryTotal),
      status,
      warnings: [],
    };
    rows.push(row);

    if (status === 'REQUIRES_CORRECTION') {
      repairPayload.push({
        contractId: contract.id,
        contractNumber: contract.contract_number,
        masonryTotal,
        totalItems: documentItems.length,
        ignoredNonMasonryItems: Math.max(0, documentItems.length - masonryPieces.length),
        previousPieceCount,
        previousTotal,
        pieces: masonryPieces.map((piece) => ({
          label: piece.label,
          value: piece.value,
          itemNumber: piece.itemNumber,
          supplier: piece.supplier,
          line: piece.line,
        })),
      });
    }
  }

  const repairResults = [];
  if (shouldExecute && Object.values(referenceCounts).some((count) => count > 0)) {
    throw new Error(`Correcao bloqueada: existem referencias operacionais ${JSON.stringify(referenceCounts)}.`);
  }

  if (shouldExecute) {
    for (const item of repairPayload) {
      const {data, error} = await supabase.rpc('repair_historical_contract_masonry_items', {
        p_empresa_id: empresaId,
        p_contract_id: item.contractId,
        p_masonry_total: item.masonryTotal,
        p_pieces: item.pieces,
        p_audit: {
          actorName,
          contractNumber: item.contractNumber,
          previousPieceCount: item.previousPieceCount,
          previousTotal: item.previousTotal,
          totalItems: item.totalItems,
          ignoredNonMasonryItems: item.ignoredNonMasonryItems,
        },
      });
      repairResults.push({
        contract_id: item.contractId,
        contract_number: item.contractNumber,
        status: error ? 'FAILED' : data?.status || 'CORRECTED',
        reason: error?.message || 'Corrigido via RPC atomica.',
      });
    }
  }

  const finalRows = rows.map((row) => {
    const result = repairResults.find((item) => item.contract_id === row.contract_id);
    return result ? {...row, repair_status: result.status, repair_reason: result.reason} : row;
  });

  const correctedRows = shouldExecute
    ? finalRows.filter((row) => row.repair_status === 'CORRECTED')
    : finalRows.filter((row) => row.status === 'REQUIRES_CORRECTION');
  const report = {
    generatedAt: new Date().toISOString(),
    phase: shouldExecute ? 'MASONRY_REPAIR_EXECUTED' : 'MASONRY_REPAIR_AUDIT',
    rootDir,
    empresaId,
    referenceCounts,
    summary: {
      contractsAnalyzed: rows.length,
      requiresCorrection: rows.filter((row) => row.status === 'REQUIRES_CORRECTION').length,
      alreadyCorrect: rows.filter((row) => row.status === 'ALREADY_CORRECT').length,
      noMasonryItems: rows.filter((row) => row.status === 'NO_MASONRY_ITEMS').length,
      corrected: shouldExecute ? correctedRows.length : 0,
      piecesBefore: rows.reduce((sum, row) => sum + row.persisted_items_before, 0),
      masonryPiecesAfter: rows.reduce((sum, row) => sum + row.masonry_items, 0),
      nonMasonryItemsIgnored: rows.reduce((sum, row) => sum + Math.max(0, row.total_items - row.masonry_items), 0),
      previousTotal: money(rows.reduce((sum, row) => sum + row.document_total_before, 0)),
      masonryTotal: money(rows.reduce((sum, row) => sum + row.masonry_total, 0)),
      removedNonMasonryValue: money(rows.reduce((sum, row) => sum + row.financial_difference_removed, 0)),
      failed: repairResults.filter((row) => row.status === 'FAILED').length,
    },
    rows: finalRows,
  };

  await fs.mkdir(outputDir, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `historical-contracts-masonry-${shouldExecute ? 'repair' : 'audit'}-${stamp}.json`);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({outputPath, summary: report.summary, referenceCounts}, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
