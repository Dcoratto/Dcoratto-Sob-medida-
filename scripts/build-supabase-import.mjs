import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const exportsDir = path.join(rootDir, 'exports');
const outputDir = path.join(rootDir, 'supabase', 'imports');

const timestampToIso = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (value.__type === 'timestamp') return value.iso || null;
  return null;
};

const sanitizeAssetValue = (value) => {
  if (!value || typeof value !== 'string') return value || null;
  return value.startsWith('data:') ? null : value;
};

const sanitizeQuotePiece = (piece) => {
  if (!piece || typeof piece !== 'object') return piece;
  return {
    ...piece,
    previewUrl: sanitizeAssetValue(piece.previewUrl),
    proposalImageUrl: sanitizeAssetValue(piece.proposalImageUrl),
    drawingJson: typeof piece.drawingJson === 'string' && piece.drawingJson.includes('data:image')
      ? null
      : piece.drawingJson || null,
    purchasedFixtures: piece.purchasedFixtures
      ?Object.fromEntries(
        Object.entries(piece.purchasedFixtures).map(([key, fixture]) => [
          key,
          fixture && typeof fixture === 'object'
            ?{...fixture, imageUrl: sanitizeAssetValue(fixture.imageUrl)}
            : fixture,
        ]),
      )
      : piece.purchasedFixtures || {},
  };
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    sourceDir: '',
    outDir: path.join(outputDir, `firebase-import-${new Date().toISOString().replace(/[:.]/g, '-')}`),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--source-dir') {
      result.sourceDir = path.resolve(rootDir, args[index + 1] || '');
      index += 1;
      continue;
    }
    if (arg === '--out-dir') {
      result.outDir = path.resolve(rootDir, args[index + 1] || '');
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`
Uso:
  npm run build:supabase-import

Opções:
  --source-dir exports/firebase-firestore-2026-...
  --out-dir supabase/imports/minha-pasta
      `);
      process.exit(0);
    }
  }

  return result;
};

const escapeSqlString = (value) => String(value).replace(/'/g, "''");

const sqlLiteral = (value, type = 'text', options = {}) => {
  if (type === 'timestamptz') {
    const iso = typeof value === 'string' ? value : timestampToIso(value);
    return iso ? `'${escapeSqlString(iso)}'::timestamptz` : (options.fallbackNow ? "timezone('utc', now())" : 'null');
  }
  if (value === undefined || value === null) return 'null';
  if (type === 'numeric') {
    if (value === '') return 'null';
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : 'null';
  }
  if (type === 'boolean') {
    if (value === '') return 'null';
    return value ? 'true' : 'false';
  }
  if (type === 'jsonb') {
    if (value === '') return 'null';
    return `'${escapeSqlString(JSON.stringify(value))}'::jsonb`;
  }
  return `'${escapeSqlString(value)}'`;
};

const listExportDirectories = async () => {
  const entries = await fs.readdir(exportsDir, {withFileTypes: true}).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('firebase-firestore-'))
    .map((entry) => path.join(exportsDir, entry.name))
    .sort();
};

const latestCombinedSource = async () => {
  const directories = await listExportDirectories();
  if (!directories.length) {
    throw new Error('Nenhuma exportação encontrada em exports/.');
  }

  const latestByFile = new Map();
  for (const directory of directories) {
    const files = await fs.readdir(directory, {withFileTypes: true});
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json') || file.name === 'summary.json') continue;
      latestByFile.set(file.name, path.join(directory, file.name));
    }
  }
  return latestByFile;
};

const loadJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const normalizeSettings = (items) => items.map((item) => ({
  id: item.id,
  company_name: item.companyName || '',
  logo_url: item.logoUrl || null,
  phone: item.phone || '',
  email: item.email || '',
  address: item.address || '',
  default_validity: item.defaultValidity ?? 0,
  default_notes: item.defaultNotes || '',
  labor_rate_per_linear_meter: item.laborRatePerLinearMeter ?? 0,
  default_fronton_height: item.defaultFrontonHeight ?? 0,
  default_skirt_height: item.defaultSkirtHeight ?? 0,
  default_turn_height: item.defaultTurnHeight ?? 0,
  cutout_prices: item.cutoutPrices || {},
  payment_methods: item.paymentMethods || [],
  sculpted_sink_rates: item.sculptedSinkRates || {},
  material_catalog: item.materialCatalog || {},
}));

const normalizeProfiles = (items) => items.map((item) => ({
  id: item.id || item.uid,
  auth_user_id: null,
  name: item.name || '',
  email: item.email || '',
  role: item.role || 'user',
  blocked: Boolean(item.blocked),
  phone: item.phone || null,
  photo_url: item.photoUrl || null,
  position: item.position || null,
  calendar_feed_token: item.calendarFeedToken || null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeUsers = (items) => items.map((item) => ({
  id: item.id || item.uid,
  auth_user_id: null,
  nome: item.nome || item.name || '',
  name: item.name || item.nome || null,
  email: item.email || '',
  role: item.role || 'vendedor',
  permissions: item.permissions || {},
  blocked: Boolean(item.blocked),
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
  updated_by_uid: item.updatedByUid || null,
  updated_by_email: item.updatedByEmail || null,
  updated_by_name: item.updatedByName || null,
}));

const normalizeEmployees = (items) => items.map((item) => ({
  id: item.id,
  name: item.name || '',
  role: item.role || 'Administrativo',
  phone: item.phone || null,
  active: item.active !== false,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeCondominiums = (items) => items.map((item) => ({
  id: item.id,
  name: item.name || '',
  city: item.city || '',
  address_mode: item.addressMode || null,
  allowed_weekdays: item.allowedWeekdays || [],
  work_start_hour: item.workStartHour || '',
  work_end_hour: item.workEndHour || '',
  block_national_holidays: Boolean(item.blockNationalHolidays),
  block_city_holidays: Boolean(item.blockCityHolidays),
  notes: item.notes || null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeClients = (items) => items.map((item) => ({
  id: item.id,
  name: item.name || '',
  phone: item.phone || '',
  email: item.email || null,
  google_drive_url: item.googleDriveUrl || null,
  manual_stage: item.manualStage || null,
  manual_quote_status: item.manualQuoteStatus || null,
  legacy_project_mode: item.legacyProjectMode || null,
  legacy_manual_quote: item.legacyManualQuote || null,
  cpf: item.cpf || null,
  rg: item.rg || null,
  birth_date: item.birthDate || null,
  address: item.address || '',
  street_address: item.streetAddress || null,
  notes: item.notes || '',
  city: item.city || null,
  zip_code: item.zipCode || null,
  neighborhood: item.neighborhood || null,
  address_type: item.addressType || null,
  condominium_id: item.condominiumId || null,
  condominium_name: item.condominiumName || null,
  block: item.block || null,
  lot: item.lot || null,
  tower: item.tower || null,
  apartment_number: item.apartmentNumber || null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeMaterials = (items) => items.map((item) => ({
  id: item.id,
  name: item.name || '',
  price_per_m2: item.pricePerM2 ?? 0,
  base_cost_per_m2: item.baseCostPerM2 ?? null,
  base_minimum_sale_per_m2: item.baseMinimumSalePerM2 ?? null,
  margin_percentage: item.marginPercentage ?? null,
  provider: item.provider || '',
  category: item.category || '',
  material_line: item.materialLine || null,
  material_type: item.materialType || null,
  thickness_label: item.thicknessLabel || null,
  texture: item.texture || null,
  image_url: sanitizeAssetValue(item.imageUrl),
  active: item.active !== false,
  source_inventory_id: item.sourceInventoryId || null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeUserMaterialPrices = (items) => items.map((item) => ({
  id: item.id,
  user_id: item.userId || '',
  material_id: item.materialId || '',
  material_variant_key: item.materialVariantKey || null,
  base_cost_per_m2: item.baseCostPerM2 ?? 0,
  base_minimum_sale_per_m2: item.baseMinimumSalePerM2 ?? null,
  margin_percentage: item.marginPercentage ?? 0,
  price_per_m2: item.pricePerM2 ?? 0,
  final_price_per_m2: item.finalPricePerM2 ?? null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeFixtureCatalog = (items) => items.map((item) => ({
  id: item.id,
  name: item.name || '',
  category: item.category || '',
  brand: item.brand || null,
  model: item.model || null,
  width: item.width ?? null,
  depth: item.depth ?? null,
  height: item.height ?? null,
  diameter: item.diameter ?? null,
  image_url: sanitizeAssetValue(item.imageUrl),
  manual_url: sanitizeAssetValue(item.manualUrl),
  manual_file_name: item.manualFileName || null,
  notes: item.notes || null,
  active: item.active !== false,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeQuotes = (items) => items.map((item) => ({
  id: item.id,
  client_id: item.clientId || '',
  client_name: item.clientName || '',
  phone: item.phone || '',
  address: item.address || '',
  environment: item.environment || '',
  responsible: item.responsible || '',
  responsible_user_uid: item.responsibleUserUid || null,
  responsible_user_name: item.responsibleUserName || null,
  material_id: item.materialId || null,
  material_name: item.materialName || null,
  payment_method: item.paymentMethod || '',
  delivery_days: item.deliveryDays ?? 0,
  validity_date: timestampToIso(item.validityDate),
  measurement_date: timestampToIso(item.measurementDate),
  delivery_date: timestampToIso(item.deliveryDate),
  commercial_notes: item.commercialNotes || '',
  status: item.status || 'Orçamento',
  total_area: item.totalArea ?? 0,
  total_price: item.totalPrice ?? 0,
  pieces: (item.pieces || []).map(sanitizeQuotePiece),
  cutouts: item.cutouts || {},
  team_counts: item.teamCounts || null,
  employee_assignments: item.employeeAssignments || null,
  employee_evaluations: item.employeeEvaluations || null,
  status_history: item.statusHistory || null,
  created_at: timestampToIso(item.createdAt),
  created_by: item.createdBy || '',
  updated_at: timestampToIso(item.updatedAt),
}));

const rackNameToId = (value) => {
  const match = String(value || '').match(/(\d+)/);
  return match ? `rack_${match[1]}` : null;
};

const normalizeInventory = (items) => items.map((item) => ({
  id: item.id,
  material_id: item.materialId || '',
  material_name: item.materialName || '',
  code: item.code || '',
  provider: item.provider || '',
  rack_id: rackNameToId(item.rackId),
  category: item.category || null,
  material_line: item.materialLine || null,
  material_type: item.materialType || null,
  thickness_label: item.thicknessLabel || null,
  texture: item.texture || null,
  length: item.length ?? 0,
  width: item.width ?? 0,
  thickness: item.thickness ?? 0,
  area: item.area ?? 0,
  cost: item.cost ?? 0,
  minimum_sale_price: item.minimumSalePrice ?? null,
  status: item.status || 'Disponível',
  notes: item.notes || '',
  photo_url: sanitizeAssetValue(item.photoUrl),
  loss_reason: item.lossReason || null,
  loss_notes: item.lossNotes || null,
  loss_quote_id: item.lossQuoteId || null,
  loss_client_id: item.lossClientId || null,
  loss_client_name: item.lossClientName || null,
  loss_piece_id: item.lossPieceId || null,
  loss_piece_name: item.lossPieceName || null,
  lost_by_uid: item.lostByUid || null,
  lost_by_name: item.lostByName || null,
  lost_at: timestampToIso(item.lostAt),
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeInventoryReservations = (items) => items.map((item) => ({
  id: item.id,
  quote_id: item.quoteId || '',
  material_id: item.materialId || '',
  material_variant_key: item.materialVariantKey || null,
  material_line: item.materialLine || null,
  material_type: item.materialType || null,
  thickness_label: item.thicknessLabel || null,
  texture: item.texture || null,
  provider: item.provider || null,
  material_name: item.materialName || '',
  area: item.area ?? 0,
  quote_status: item.quoteStatus || '',
  client_name: item.clientName || null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeInventoryPurchases = (items) => items.map((item) => ({
  id: item.id,
  material_id: item.materialId || null,
  material_name: item.materialName || '',
  provider: item.provider || null,
  code: item.code || '',
  category: item.category || null,
  material_line: item.materialLine || null,
  material_type: item.materialType || null,
  thickness_label: item.thicknessLabel || null,
  texture: item.texture || null,
  length: item.length ?? 0,
  width: item.width ?? 0,
  thickness: item.thickness ?? 0,
  area: item.area ?? 0,
  cost: item.cost ?? 0,
  minimum_sale_price: item.minimumSalePrice ?? null,
  photo_url: sanitizeAssetValue(item.photoUrl),
  purchase_group_id: item.purchaseGroupId || null,
  purchase_index: item.purchaseIndex ?? null,
  purchase_quantity: item.purchaseQuantity ?? null,
  status: item.status || 'Pedido',
  notes: item.notes || null,
  expected_delivery_date: timestampToIso(item.expectedDeliveryDate),
  expected_delivery_date_key: item.expectedDeliveryDateKey || null,
  purchased_by_uid: item.purchasedByUid || '',
  purchased_by_name: item.purchasedByName || '',
  purchased_at: timestampToIso(item.purchasedAt),
  received_by_uid: item.receivedByUid || null,
  received_by_name: item.receivedByName || null,
  received_at: timestampToIso(item.receivedAt),
  inventory_item_id: item.inventoryItemId || null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeCalendarEvents = (items) => items.map((item) => ({
  id: item.id,
  title: item.title || '',
  description: item.description || null,
  date: timestampToIso(item.date),
  date_key: item.dateKey || null,
  client_id: item.clientId || null,
  client_name: item.clientName || null,
  city: item.city || null,
  event_time: item.eventTime || null,
  created_by_uid: item.createdByUid || null,
  created_by_name: item.createdByName || null,
  source_type: item.sourceType || null,
  status: item.status || null,
  supplier: item.supplier || null,
  material_name: item.materialName || null,
  purchase_group_id: item.purchaseGroupId || null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeDashboardNotes = (items) => items.map((item) => ({
  id: item.id,
  text: item.text || '',
  user_uid: item.userUid || null,
  user_name: item.userName || null,
  target_uid: item.targetUid || null,
  target_name: item.targetName || null,
  created_at: timestampToIso(item.createdAt),
  updated_at: timestampToIso(item.updatedAt),
}));

const normalizeSystemEvents = (items) => items.map((item) => ({
  id: item.id,
  type: item.type || '',
  title: item.title || '',
  description: item.description || null,
  entity_type: item.entityType || '',
  entity_id: item.entityId || null,
  client_id: item.clientId || null,
  client_name: item.clientName || null,
  quote_id: item.quoteId || null,
  quote_status: item.quoteStatus || null,
  material_id: item.materialId || null,
  material_name: item.materialName || null,
  employee_id: item.employeeId || null,
  employee_name: item.employeeName || null,
  user_uid: item.userUid || null,
  user_name: item.userName || null,
  metadata: item.metadata || null,
  created_at: timestampToIso(item.createdAt),
}));

const normalizeAuditLogs = (items) => items.map((item) => ({
  id: item.id,
  user_id: item.userId || null,
  user_email: item.userEmail || '',
  user_name: item.userName || '',
  action: item.action || '',
  module: item.module || '',
  target_id: item.targetId || '',
  old_value: item.oldValue ?? null,
  new_value: item.newValue ?? null,
  created_at: timestampToIso(item.createdAt),
}));

const tableDefinitions = [
  {file: 'settings.json', table: 'settings', normalize: normalizeSettings, numeric: ['default_validity', 'labor_rate_per_linear_meter', 'default_fronton_height', 'default_skirt_height', 'default_turn_height'], boolean: [], jsonb: ['cutout_prices', 'payment_methods', 'sculpted_sink_rates', 'material_catalog'], timestamptz: [], timestamptzDefaultsNow: []},
  {file: 'profiles.json', table: 'profiles', normalize: normalizeProfiles, numeric: [], boolean: ['blocked'], jsonb: [], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'users.json', table: 'users', normalize: normalizeUsers, numeric: [], boolean: ['blocked'], jsonb: ['permissions'], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'employees.json', table: 'employees', normalize: normalizeEmployees, numeric: [], boolean: ['active'], jsonb: [], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'condominiums.json', table: 'condominiums', normalize: normalizeCondominiums, numeric: [], boolean: ['block_national_holidays', 'block_city_holidays'], jsonb: ['allowed_weekdays'], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'clients.json', table: 'clients', normalize: normalizeClients, numeric: [], boolean: [], jsonb: ['legacy_manual_quote'], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'materials.json', table: 'materials', normalize: normalizeMaterials, numeric: ['price_per_m2', 'base_cost_per_m2', 'base_minimum_sale_per_m2', 'margin_percentage'], boolean: ['active'], jsonb: [], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'userMaterialPrices.json', table: 'user_material_prices', normalize: normalizeUserMaterialPrices, numeric: ['base_cost_per_m2', 'base_minimum_sale_per_m2', 'margin_percentage', 'price_per_m2', 'final_price_per_m2'], boolean: [], jsonb: [], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'fixtureCatalog.json', table: 'fixture_catalog', normalize: normalizeFixtureCatalog, numeric: ['width', 'depth', 'height', 'diameter'], boolean: ['active'], jsonb: [], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'quotes.json', table: 'quotes', normalize: normalizeQuotes, numeric: ['delivery_days', 'total_area', 'total_price'], boolean: [], jsonb: ['pieces', 'cutouts', 'team_counts', 'employee_assignments', 'employee_evaluations', 'status_history'], timestamptz: ['validity_date', 'measurement_date', 'delivery_date', 'created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'inventory.json', table: 'inventory', normalize: normalizeInventory, numeric: ['length', 'width', 'thickness', 'area', 'cost', 'minimum_sale_price'], boolean: [], jsonb: [], timestamptz: ['lost_at', 'created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'inventoryReservations.json', table: 'inventory_reservations', normalize: normalizeInventoryReservations, numeric: ['area'], boolean: [], jsonb: [], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'inventoryPurchases.json', table: 'inventory_purchases', normalize: normalizeInventoryPurchases, numeric: ['length', 'width', 'thickness', 'area', 'cost', 'minimum_sale_price', 'purchase_index', 'purchase_quantity'], boolean: [], jsonb: [], timestamptz: ['expected_delivery_date', 'purchased_at', 'received_at', 'created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'calendarEvents.json', table: 'calendar_events', normalize: normalizeCalendarEvents, numeric: [], boolean: [], jsonb: [], timestamptz: ['date', 'created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'dashboardNotes.json', table: 'dashboard_notes', normalize: normalizeDashboardNotes, numeric: [], boolean: [], jsonb: [], timestamptz: ['created_at', 'updated_at'], timestamptzDefaultsNow: ['created_at', 'updated_at']},
  {file: 'systemEvents.json', table: 'system_events', normalize: normalizeSystemEvents, numeric: [], boolean: [], jsonb: ['metadata'], timestamptz: ['created_at'], timestamptzDefaultsNow: ['created_at'], maxChunkBytes: 30000},
  {file: 'auditLogs.json', table: 'audit_logs', normalize: normalizeAuditLogs, numeric: [], boolean: [], jsonb: ['old_value', 'new_value'], timestamptz: ['created_at'], timestamptzDefaultsNow: ['created_at'], maxChunkBytes: 30000},
];

const buildInsertSql = (tableDefinition, rows) => {
  if (!rows.length) {
    return `-- ${tableDefinition.table}: sem registros para importar.\n`;
  }

  const columns = Object.keys(rows[0]);
  const updateColumns = columns.filter((column) => column !== 'id');
  const lines = rows.map((row) => {
    const values = columns.map((column) => {
      if (tableDefinition.jsonb.includes(column)) return sqlLiteral(row[column], 'jsonb');
      if (tableDefinition.numeric.includes(column)) return sqlLiteral(row[column], 'numeric');
      if (tableDefinition.boolean.includes(column)) return sqlLiteral(row[column], 'boolean');
      if (tableDefinition.timestamptz.includes(column)) {
        return sqlLiteral(row[column], 'timestamptz', {
          fallbackNow: tableDefinition.timestamptzDefaultsNow.includes(column),
        });
      }
      return sqlLiteral(row[column], 'text');
    });
    return `  (${values.join(', ')})`;
  });

  return [
    `insert into public.${tableDefinition.table} (${columns.join(', ')})`,
    'values',
    `${lines.join(',\n')}`,
    'on conflict (id) do update set',
    `  ${updateColumns.map((column) => `${column} = excluded.${column}`).join(',\n  ')};`,
    '',
  ].join('\n');
};

const chunkRowsByApproxSize = (tableDefinition, rows, maxBytes = 450000) => {
  if (!rows.length) return [[]];
  const chunks = [];
  let currentChunk = [];

  for (const row of rows) {
    const nextChunk = [...currentChunk, row];
    const estimatedSize = Buffer.byteLength(buildInsertSql(tableDefinition, nextChunk), 'utf8');
    if (currentChunk.length > 0 && estimatedSize > maxBytes) {
      chunks.push(currentChunk);
      currentChunk = [row];
      continue;
    }
    currentChunk = nextChunk;
  }

  if (currentChunk.length) chunks.push(currentChunk);
  return chunks;
};

const main = async () => {
  const {sourceDir, outDir} = parseArgs();
  const sourceFiles = sourceDir
    ?new Map((await fs.readdir(sourceDir, {withFileTypes: true}))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'summary.json')
      .map((entry) => [entry.name, path.join(sourceDir, entry.name)]))
    : await latestCombinedSource();

  await fs.mkdir(outDir, {recursive: true});

  const manifest = [];

  for (const definition of tableDefinitions) {
    const sourceFile = sourceFiles.get(definition.file);
    if (!sourceFile) continue;
    const raw = await loadJson(sourceFile);
    const rows = definition.normalize(raw);
    const chunks = chunkRowsByApproxSize(definition, rows, definition.maxChunkBytes || 450000);

    for (const [index, chunk] of chunks.entries()) {
      const sql = buildInsertSql(definition, chunk);
      const suffix = chunks.length > 1 ? `_part_${String(index + 1).padStart(3, '0')}` : '';
      const outFile = path.join(outDir, `${definition.table}${suffix}.sql`);
      await fs.writeFile(outFile, sql, 'utf8');
      manifest.push({
        table: definition.table,
        sourceFile,
        outFile,
        rowCount: chunk.length,
        part: index + 1,
        totalParts: chunks.length,
      });
    }
  }

  await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Arquivos SQL gerados em: ${outDir}`);
  console.log(`Manifesto: ${path.join(outDir, 'manifest.json')}`);
};

main().catch((error) => {
  console.error('Erro ao montar importação do Supabase:', error);
  process.exit(1);
});
