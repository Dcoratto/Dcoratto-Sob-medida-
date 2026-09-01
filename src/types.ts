export type AccessRole = 'vendedor' | 'coordenador' | 'liberacao' | 'administrativo';
export type UserRole = 'admin' | 'user';

export type PermissionMap = {
  dashboard: { visualizar: boolean; };
  orcamento: { visualizar: boolean; criar: boolean; editar: boolean; excluir: boolean; aprovar: boolean; };
  historico: { visualizar: boolean; };
  materiais: { visualizar: boolean; editar: boolean; };
  estoque: { visualizar: boolean; adicionar: boolean; editar: boolean; excluir: boolean; movimentar: boolean; };
  almoxarifado: { visualizar: boolean; editar: boolean; movimentar: boolean; comprar: boolean; };
  funcionarios: { visualizar: boolean; cadastrar: boolean; editar: boolean; jornada: boolean; apontar: boolean; verRelatorios: boolean; };
  veiculos: { visualizar: boolean; cadastrar: boolean; editar: boolean; usar: boolean; verRelatorios: boolean; };
  relatorios: { visualizar: boolean; exportar: boolean; verFaturamento: boolean; verProdutividade: boolean; };
  admin: { visualizarUsuarios: boolean; alterarPermissoes: boolean; excluirUsuarios: boolean; };
  cliente: { visualizar: boolean; editarDados: boolean; alterarEtapa: boolean; anexarArquivos: boolean; avaliarFuncionarios: boolean; verValores: boolean; };
  medicao: { visualizar: boolean; criar: boolean; editar: boolean; };
  projeto: { visualizar: boolean; criar: boolean; editar: boolean; aprovar: boolean; };
  producao: { visualizar: boolean; alterarEtapa: boolean; conferirMedidas: boolean; finalizarProducao: boolean; };
  liberacao: { visualizar: boolean; aprovar: boolean; reprovar: boolean; };
};

export interface AccessUser {
  uid: string;
  empresaId?: string;
  nome: string;
  name?: string;
  email: string;
  role: AccessRole;
  permissions?: Partial<{[Module in keyof PermissionMap]: Partial<PermissionMap[Module]>}>;
  blocked?: boolean;
  createdAt?: any;
  updatedAt?: any;
  updatedByUid?: string;
  updatedByEmail?: string;
  updatedByName?: string;
}

export interface AuditLog {
  id: string;
  empresaId?: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  module: string;
  targetId: string;
  oldValue?: any;
  newValue?: any;
  createdAt?: any;
}

export interface Profile {
  uid: string;
  empresaId?: string;
  name: string;
  email: string;
  role: UserRole;
  blocked: boolean;
  phone?: string;
  photoUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
  position?: string;
  calendarFeedToken?: string;
}

export interface Settings {
  empresaId?: string;
  companyName: string;
  logoUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
  phone: string;
  email: string;
  address: string;
  defaultValidity: number;
  defaultNotes: string;
  laborRatePerLinearMeter: number;
  laborMinimumByRegion: {
    altoTiete: number;
    saoPaulo: number;
  };
  laborPricing: QuoteLocationPricingConfig;
  deliveryPricing: QuoteLocationPricingConfig;
  quoteComplexityOptions: QuoteComplexityOption[];
  defaultFrontonHeight: number;
  defaultSkirtHeight: number;
  defaultTurnHeight: number;
  cutoutPrices: {
    cooktop: number;
    sinkUnder: number;
    sinkOver: number;
    faucetHole: number;
    trashBinCutout?: number;
    popUpTowerCutout?: number;
    wetAreaAmericanRecess?: number;
    wetAreaItalianRecess?: number;
    sinkSculpted?: boolean;
    sinkSculptedPrice?: number;
  };
  paymentMethods: {
    name: string;
    adjustment: number;
  }[];
  sculptedSinkRates: {
    simple: number;
    ramp: number;
    hiddenValve: number;
    extraSink: number;
    riskPercentage: number;
  };
  materialSuppliers?: SupplierContact[];
  materialCatalog: {
    materialCategories: string[];
    materialLines: string[];
    materialTypes: string[];
    naturalThicknesses: string[];
    slabThicknesses: string[];
    textures: string[];
    suppliers: SupplierContact[];
  };
  patioLayout?: Record<string, {x: number; y: number; rotation?: number}>;
  patioSize?: {width: number; height: number};
}

export interface QuoteLocationDistrictRule {
  id?: string;
  district: string;
  amount: number;
  active?: boolean;
}

export interface QuoteLocationCityRule {
  id?: string;
  city: string;
  amount: number;
  active?: boolean;
  districts: QuoteLocationDistrictRule[];
}

export interface QuoteLocationPricingConfig {
  mode?: 'linear' | 'fixed' | 'location';
  fixedAmount?: number;
  defaultAmount: number;
  cityRules: QuoteLocationCityRule[];
}

export interface QuoteComplexityOption {
  key: string;
  label: string;
  percent: number;
  active: boolean;
  sortOrder: number;
}

export interface SupplierContact {
  id?: string;
  name: string;
  whatsapp?: string;
  contactName?: string;
  city?: string;
  notes?: string;
}

export interface Material {
  id: string;
  empresaId?: string;
  name: string;
  pricePerM2: number;
  baseCostPerM2?: number;
  baseMinimumSalePerM2?: number;
  marginPercentage?: number;
  provider: string;
  category: string;
  materialLine?: string;
  materialType?: string;
  thicknessLabel?: string;
  texture?: string;
  quoteDescription?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
  active: boolean;
  sourceInventoryId?: string;
  updatedAt?: any;
}

export interface UserMaterialPrice {
  id: string;
  empresaId?: string;
  userId: string;
  materialId: string;
  materialVariantKey?: string;
  baseCostPerM2: number;
  baseMinimumSalePerM2?: number;
  marginPercentage: number;
  pricePerM2: number;
  finalPricePerM2?: number;
  updatedAt?: any;
}

export interface Client {
  id: string;
  empresaId?: string;
  name: string;
  phone: string;
  email?: string;
  googleDriveUrl?: string;
  manualStage?: 'pre' | 'approved' | 'production' | 'ready' | 'done' | 'none';
  manualQuoteStatus?: QuoteStatus | 'Sem projeto';
  legacyProjectMode?: 'sem_projeto' | 'orcamento' | 'orcamento_existente';
  legacyManualQuote?: LegacyManualQuote;
  cpf?: string;
  rg?: string;
  birthDate?: string;
  address: string;
  streetAddress?: string;
  notes: string;
  city?: string;
  zipCode?: string;
  neighborhood?: string;
  addressType?: 'casa' | 'condominio' | 'apartamento';
  condominiumId?: string;
  condominiumName?: string;
  block?: string;
  lot?: string;
  tower?: string;
  apartmentNumber?: string;
}

export type CrisisVisualStatus = 'pending' | 'in_progress' | 'completed' | 'empty';
export type CrisisTaskStatus = 'pending' | 'completed';
export type CrisisPhotoKind = 'before' | 'after' | 'evidence';

export interface CrisisClientCase {
  id: string;
  empresaId?: string;
  clientId: string;
  taskCount: number;
  completedTaskCount: number;
  completionPercent: number;
  visualStatus: CrisisVisualStatus;
  createdByUid?: string;
  createdByName?: string;
  createdAt?: any;
  updatedAt?: any;
  deletedAt?: any;
  deletedByUid?: string;
  deletedByName?: string;
}

export interface CrisisTask {
  id: string;
  empresaId?: string;
  crisisClientId: string;
  title: string;
  description?: string;
  status: CrisisTaskStatus;
  sortOrder?: number;
  scheduledFor?: any;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleNote?: string;
  scheduledCalendarEventId?: string;
  scheduleUpdatedAt?: any;
  scheduleUpdatedByUid?: string;
  scheduleUpdatedByName?: string;
  createdByUid?: string;
  createdByName?: string;
  completedAt?: any;
  completedByUid?: string;
  completedByName?: string;
  reopenedAt?: any;
  reopenedByUid?: string;
  reopenedByName?: string;
  createdAt?: any;
  updatedAt?: any;
  deletedAt?: any;
  deletedByUid?: string;
  deletedByName?: string;
}

export interface CrisisTaskPhoto {
  id: string;
  empresaId?: string;
  crisisTaskId: string;
  bucketId: string;
  filePath: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  width?: number;
  height?: number;
  captureKind?: CrisisPhotoKind;
  createdByUid?: string;
  createdByName?: string;
  createdAt?: any;
  updatedAt?: any;
  deletedAt?: any;
  deletedByUid?: string;
  deletedByName?: string;
}

export interface CrisisHistoryEvent {
  id: string;
  empresaId?: string;
  crisisClientId: string;
  crisisTaskId?: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  userUid?: string;
  userName?: string;
  createdAt?: any;
}

export type InstallationStatus = 'pending' | 'in_progress' | 'completed';

export interface Installation {
  id: string;
  empresaId?: string;
  clientId: string;
  quoteId?: string;
  installerEmployeeId?: string;
  installationDate: any;
  notes?: string;
  status: InstallationStatus;
  totalItems: number;
  completedItems: number;
  completionPercent: number;
  finalizedAt?: any;
  finalizedByUid?: string;
  finalizedByName?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt?: any;
  updatedAt?: any;
  deletedAt?: any;
  deletedByUid?: string;
  deletedByName?: string;
}

export interface InstallationChecklistItem {
  id: string;
  empresaId?: string;
  installationId: string;
  templateKey: string;
  groupKey: string;
  groupLabel: string;
  title: string;
  sortOrder: number;
  required: boolean;
  checked: boolean;
  observation?: string;
  photoCount: number;
  checkedAt?: any;
  checkedByUid?: string;
  checkedByName?: string;
  uncheckedAt?: any;
  uncheckedByUid?: string;
  uncheckedByName?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface InstallationChecklistPhoto {
  id: string;
  empresaId?: string;
  installationId: string;
  checklistItemId: string;
  bucketId: string;
  filePath: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  width?: number;
  height?: number;
  createdByUid?: string;
  createdByName?: string;
  createdAt?: any;
  updatedAt?: any;
  deletedAt?: any;
  deletedByUid?: string;
  deletedByName?: string;
}

export interface InstallationHistoryEvent {
  id: string;
  empresaId?: string;
  installationId: string;
  checklistItemId?: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  userUid?: string;
  userName?: string;
  createdAt?: any;
}

export interface LegacyClientPiece {
  id: string;
  name: string;
  status?: QuoteStatus;
  value?: number;
  items?: string[];
}

export type LegacyPaymentStatus = 'Pendente' | 'Pago' | 'Vencido';

export interface LegacyPaymentInstallment {
  id: string;
  label: string;
  amount: number;
  dueDate?: string;
  paidDate?: string;
  paymentMethod?: string;
  status: LegacyPaymentStatus;
  notes?: string;
}

export interface LegacyManualQuote {
  totalPrice?: number;
  updatedAt?: any;
  pieces: LegacyClientPiece[];
  payments?: LegacyPaymentInstallment[];
}

export interface CondominiumRule {
  id: string;
  empresaId?: string;
  name: string;
  city: string;
  addressMode?: 'street' | 'lot';
  allowedWeekdays: number[];
  workStartHour: string;
  workEndHour: string;
  blockNationalHolidays: boolean;
  blockCityHolidays: boolean;
  notes?: string;
  createdAt?: any;
}

export type EmployeeRole = string;

export type EmployeeStatus = 'ATIVO' | 'INATIVO' | 'FERIAS' | 'AFASTADO';

export interface Employee {
  id: string;
  empresaId?: string;
  accessUserId?: string;
  authUserId?: string;
  name: string;
  role: EmployeeRole;
  displayName?: string;
  status?: EmployeeStatus;
  admissionDate?: string;
  phone?: string;
  notes?: string;
  photoUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
  active: boolean;
  createdByUid?: string;
  createdByName?: string;
  updatedAt?: any;
  createdAt?: any;
}

export type EmployeeFunctionKey =
  | 'medicao'
  | 'projeto'
  | 'corte'
  | 'acabamento'
  | 'colagem'
  | 'montagem'
  | 'instalacao'
  | 'conferencia'
  | 'motorista'
  | 'ajudante'
  | 'administrativo'
  | 'comercial'
  | 'outros';

export interface EmployeeFunction {
  id: string;
  empresaId?: string;
  employeeId: string;
  functionKey: EmployeeFunctionKey | string;
  functionLabel: string;
  linkedProductionStep?: ProductionStep | null;
  isPrimary?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface EmployeeWorkSchedule {
  id: string;
  empresaId?: string;
  employeeId: string;
  weekday: number;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes: number;
  expectedMinutes: number;
  notes?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export type EmployeeAttendanceStatus = 'PRESENTE' | 'AUSENTE' | 'FOLGA' | 'FERIAS' | 'AFASTADO';

export interface EmployeeAttendanceRecord {
  id: string;
  empresaId?: string;
  employeeId: string;
  workDate: string;
  status: EmployeeAttendanceStatus;
  checkInAt?: string | null;
  breakStartAt?: string | null;
  breakEndAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes: number;
  expectedMinutes: number;
  overtimeMinutes: number;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  scheduledBreakMinutes?: number;
  notes?: string | null;
  createdByUid?: string;
  createdByName?: string;
  updatedByUid?: string;
  updatedByName?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface EmployeeOvertimeSession {
  id: string;
  employeeId: string;
  workDate: string;
  startedAt: string;
  endedAt?: string | null;
  status: 'ATIVA' | 'CONCLUIDA';
}

export type EmployeeActivityStatus = 'ATIVA' | 'PAUSADA' | 'FINALIZADA';

export interface EmployeeActivityPause {
  id: string;
  empresaId?: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string | null;
  notes?: string | null;
  startedByUid?: string;
  startedByName?: string;
  endedByUid?: string;
  endedByName?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface EmployeeActivitySession {
  id: string;
  empresaId?: string;
  employeeId: string;
  clientId?: string | null;
  quoteId?: string | null;
  functionKey: EmployeeFunctionKey | string;
  functionLabel: string;
  linkedProductionStep?: ProductionStep | null;
  pieceId?: string | null;
  pieceLabel?: string | null;
  notes?: string | null;
  completionNotes?: string | null;
  status: EmployeeActivityStatus;
  startedAt: string;
  endedAt?: string | null;
  activePauseStartedAt?: string | null;
  pausedTotalSeconds: number;
  productiveSeconds?: number;
  createdByUid?: string;
  createdByName?: string;
  updatedAt?: any;
  createdAt?: any;
  employee?: Pick<Employee, 'id' | 'name' | 'displayName' | 'role' | 'status' | 'photoUrl' | 'thumbnailUrl'> | null;
  client?: {id: string; name: string; city?: string} | null;
  quote?: {id: string; clientName?: string; environment?: string; status?: QuoteStatus} | null;
  pauses?: EmployeeActivityPause[];
}

export interface EmployeeOperationalSummary {
  workedMinutes: number;
  productiveMinutes: number;
  idleMinutes: number;
  overtimeMinutes: number;
  completedActivities: number;
}

export interface EmployeeOperationalOverview {
  employee: Employee;
  functions: EmployeeFunction[];
  attendanceToday: EmployeeAttendanceRecord | null;
  currentSession: EmployeeActivitySession | null;
  today: EmployeeOperationalSummary;
  month: EmployeeOperationalSummary;
}

export type VehicleStatus = 'DISPONIVEL' | 'EM_USO' | 'MANUTENCAO' | 'INDISPONIVEL' | 'INATIVO';
export type VehicleFuelLevel = 'RESERVA' | 'UM_QUARTO' | 'METADE' | 'TRES_QUARTOS' | 'CHEIO';
export type VehicleOccurrenceSeverity = 'LEVE' | 'ATENCAO' | 'IMPEDE_USO';
export type VehicleUsageStatus = 'ATIVA' | 'CONCLUIDA';
export type VehicleOccurrenceStage = 'SAIDA' | 'DEVOLUCAO' | 'AVULSA';

export interface Vehicle {
  id: string;
  empresaId?: string;
  internalName: string;
  brand?: string | null;
  model?: string | null;
  plate?: string | null;
  year?: number | null;
  vehicleType: string;
  status: VehicleStatus;
  currentOdometerKm: number;
  notes?: string | null;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  mediumUrl?: string | null;
  originalUrl?: string | null;
  registrationDueDate?: string | null;
  relevantDueDate?: string | null;
  documentationNotes?: string | null;
  createdByUid?: string | null;
  createdByName?: string | null;
  updatedByUid?: string | null;
  updatedByName?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface VehiclePurpose {
  id: string;
  empresaId?: string;
  purposeKey: string;
  label: string;
  requiresClientLink: boolean;
  active: boolean;
  sortOrder: number;
}

export interface VehicleOccurrence {
  id: string;
  empresaId?: string;
  vehicleId: string;
  usageSessionId?: string | null;
  stage: VehicleOccurrenceStage;
  severity: VehicleOccurrenceSeverity;
  description: string;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  mediumUrl?: string | null;
  originalUrl?: string | null;
  preventsUse: boolean;
  reportedByUid?: string | null;
  reportedByName?: string | null;
  createdAt?: any;
}

export interface VehicleUsageSession {
  id: string;
  empresaId?: string;
  vehicleId: string;
  employeeId: string;
  actorUid: string;
  actorName: string;
  purposeKey: string;
  purposeLabel: string;
  clientId?: string | null;
  quoteId?: string | null;
  clientNameSnapshot?: string | null;
  quoteLabelSnapshot?: string | null;
  startNotes?: string | null;
  endNotes?: string | null;
  startOdometerKm: number;
  endOdometerKm?: number | null;
  distanceKm?: number | null;
  startFuelLevel: VehicleFuelLevel;
  endFuelLevel?: VehicleFuelLevel | null;
  startChecklist: Record<string, boolean>;
  endChecklist?: Record<string, boolean> | null;
  status: VehicleUsageStatus;
  startedAt: string;
  endedAt?: string | null;
  returnActorUid?: string | null;
  returnActorName?: string | null;
  finalVehicleStatus?: VehicleStatus | null;
  startRequestKey?: string | null;
  finishRequestKey?: string | null;
  vehicle?: Pick<Vehicle, 'id' | 'internalName' | 'vehicleType' | 'status' | 'currentOdometerKm' | 'plate' | 'thumbnailUrl'> | null;
  employee?: Pick<Employee, 'id' | 'name' | 'displayName' | 'role' | 'status'> | null;
  client?: Pick<Client, 'id' | 'name' | 'city'> | null;
  quote?: Pick<Quote, 'id' | 'environment' | 'clientName' | 'status'> | null;
  occurrences?: VehicleOccurrence[];
}

export interface VehicleOperationalOverview {
  vehicle: Vehicle;
  currentSession: VehicleUsageSession | null;
  lastSession: VehicleUsageSession | null;
  openOccurrenceCount: number;
  monthUsageCount: number;
  monthDistanceKm: number;
}

export type ProductionStep = 'medicao' | 'corte' | 'acabamento' | 'instalacao' | 'entrega';

export interface EmployeeAssignment {
  step: ProductionStep;
  employeeId: string;
  employeeName: string;
  slotIndex?: number;
  startedAt?: any;
  finishedAt?: any;
}

export interface EmployeeEvaluation {
  step: ProductionStep;
  employeeId: string;
  employeeName: string;
  rating: number;
  notes?: string;
  createdAt?: any;
  evaluatedByUid?: string;
  evaluatedByName?: string;
}

export interface QuoteStatusHistory {
  status: QuoteStatus;
  changedAt: any;
  changedByUid?: string;
  changedByName?: string;
  responsibleEmployeeId?: string;
  responsibleEmployeeName?: string;
  step?: ProductionStep;
  note?: string;
}

export type QuoteStatus =
  | 'Orçamento'
  | 'Orçamento Aprovado'
  | 'Medição'
  | 'Projeto'
  | 'Projeto Aprovado'
  | 'Corte'
  | 'Acabamento'
  | 'Montagem'
  | 'Produção Finalizada'
  | 'Conferência Final'
  | 'Entrega'
  | 'Finalizado';

export interface PieceSide {
  type: 'frontao' | 'saia' | 'virada' | 'pe' | 'guarnicao' | 'rebaixo_americano' | 'rebaixo_italiano' | 'acabamento' | 'none';
  side: string;
  sideLabel?: string;
  length: number;
  height: number;
  quantity: number;
  area: number;
  areaTotal?: number;
  value?: number;
}

export interface DrawingCutout {
  id: string;
  type: 'cuba' | 'cooktop' | 'torneira' | 'lixeira' | 'torre_tomada';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: 0 | 90;
  fixtureId?: string;
  fixtureName?: string;
  fixtureImageUrl?: string;
}

export type PieceScopedCutoutType =
  | 'cooktop'
  | 'sinkUnder'
  | 'sinkOver'
  | 'faucetHole'
  | 'trashBinCutout'
  | 'popUpTowerCutout'
  | 'wetAreaAmericanRecess'
  | 'wetAreaItalianRecess';

export interface QuotePieceCutoutItem {
  type: PieceScopedCutoutType;
  quantity: number;
}

export interface SculptedSink {
  active: boolean;
  type?: 'Simples' | 'Com rampa' | 'Válvula oculta' | 'Cuba dupla';
  drainType?: 'Válvula oculta' | 'Ralo click' | 'Ralo oculto';
  quantity: number;
  width: number;
  depth: number;
  height: number;
  unit: 'cm' | 'm';
  calculatedArea: number;
  calculatedValue: number;
}

export interface WetAreaRecess {
  active: boolean;
  type: 'americano' | 'italiano';
  width: number;
  depth: number;
  unit: 'cm' | 'm';
}

export interface StairConfig {
  active: boolean;
  unit: 'cm' | 'm';
  stepCount: number;
  stepWidth: number;
  treadDepth: number;
  riserHeight: number;
  landingCount: number;
  landingWidth: number;
  landingDepth: number;
  leftBaseboard: boolean;
  rightBaseboard: boolean;
  baseboardHeight: number;
}

export type QuotePieceKind = 'bancada' | 'escada' | 'soleira_baguete';

export interface QuotePiece {
  id: string;
  name: string;
  kind?: QuotePieceKind;
  pieceStatus?: QuoteStatus;
  pricingMode?: 'automatic' | 'manual';
  areaMode?: 'dimensions' | 'manual';
  manualPrice?: number;
  materialId: string;
  materialVariantKey?: string;
  materialLine?: string;
  materialType?: string;
  thicknessLabel?: string;
  texture?: string;
  provider?: string;
  unit: 'm' | 'cm';
  width: number;
  length: number;
  area: number;
  manualFinalArea?: number;
  manualArea?: number;
  totalArea?: number;
  manualLongestSide?: number;
  largestSide?: number;
  smallestSide?: number;
  sides: PieceSide[];
  notes: string;
  drawingJson?: string;
  previewUrl?: string;
  proposalImageUrl?: string;
  cutouts?: DrawingCutout[];
  manualCutouts?: QuotePieceCutoutItem[];
  stair?: StairConfig;
  sculptedSink?: SculptedSink;
  wetAreaRecess?: WetAreaRecess;
  purchasedFixtures?: {
    sink?: FixtureInfo;
    faucet?: FixtureInfo;
    cooktop?: FixtureInfo;
    trashBin?: FixtureInfo;
    popUpTower?: FixtureInfo;
  };
  selectedFixtureIds?: {
    cooktop?: string;
    sink?: string;
    faucet?: string;
    popUpTower?: string;
    trashBin?: string;
  };
  presentationArea?: number;
  presentationValue?: number;
  presentationMaterialName?: string;
  presentationMaterialDescription?: string;
  presentationMaterialImageUrl?: string;
  presentationMaterialCategory?: string;
  presentationMaterialLine?: string;
  presentationMaterialType?: string;
  presentationThicknessLabel?: string;
  presentationTexture?: string;
  presentationEnvironment?: string;
  presentationHighlights?: string[];
}

export interface FixtureInfo {
  model?: string;
  brand?: string;
  name?: string;
  imageUrl?: string;
  width?: number;
  depth?: number;
  height?: number;
  diameter?: number;
  notes?: string;
  received?: boolean;
  receivedByUid?: string;
  receivedByName?: string;
  receivedAt?: any;
}

export type FixtureCategory = 'cooktop' | 'sink' | 'faucet' | 'popUpTower' | 'trashBin';

export interface FixtureCatalogItem {
  id: string;
  empresaId?: string;
  name: string;
  category: FixtureCategory;
  brand?: string;
  model?: string;
  width?: number;
  depth?: number;
  height?: number;
  diameter?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
  manualUrl?: string;
  manualFileName?: string;
  notes?: string;
  active: boolean;
  createdAt?: any;
}

export interface QuoteCutouts {
  cooktop: number;
  sinkUnder: number;
  sinkOver: number;
  faucetHole: number;
  trashBinCutout?: number;
  popUpTowerCutout?: number;
  wetAreaAmericanRecess?: number;
  wetAreaItalianRecess?: number;
  sinkSculpted?: boolean;
}

export interface QuoteMaterialPriceOverride {
  materialId: string;
  materialVariantKey?: string;
  materialName: string;
  pricePerM2: number;
  defaultPricePerM2: number;
  minimumSalePerM2: number;
  updatedAt?: any;
}

export interface QuotePricingSnapshot {
  laborRatePerLinearMeter: number;
  laborMinimumByRegion: Settings['laborMinimumByRegion'];
  laborPricing: Settings['laborPricing'];
  deliveryPricing: Settings['deliveryPricing'];
  quoteComplexityOptions: Settings['quoteComplexityOptions'];
  cutoutPrices: Settings['cutoutPrices'];
  paymentMethods: Settings['paymentMethods'];
  sculptedSinkRates: Settings['sculptedSinkRates'];
}

export interface Quote {
  id: string;
  empresaId?: string;
  clientId: string;
  clientName: string;
  phone: string;
  clientEmail?: string;
  clientCpf?: string;
  address: string;
  city?: string;
  neighborhood?: string;
  environment: string;
  responsible: string;
  responsibleUserUid?: string;
  responsibleUserName?: string;
  materialId: string;
  materialName?: string;
  paymentMethod: string;
  paymentMode?: 'total' | 'entry';
  totalPaymentMethod?: string;
  remainingPaymentMethod?: string;
  entryAmount?: number;
  installmentCount?: number;
  installmentAmount?: number;
  paymentNotes?: string;
  commissionPercent?: number;
  negotiationDiscountPercent?: number;
  rtPercent?: number;
  deliveryDays: number;
  validityDate: any;
  measurementDate?: any;
  deliveryDate?: any;
  commercialNotes: string;
  status: QuoteStatus;
  totalArea: number;
  totalPrice: number;
  laborCharge?: number;
  deliveryFee?: number;
  complexityKey?: string;
  complexityLabel?: string;
  complexityPercent?: number;
  pricingMode?: 'sale' | 'cost';
  includeMaterialLoss?: boolean;
  includeCutouts?: boolean;
  includeSculptedSink?: boolean;
  includeLabor?: boolean;
  includeDelivery?: boolean;
  includeComplexity?: boolean;
  pieces: QuotePiece[];
  cutouts: QuoteCutouts;
  materialPriceOverrides?: QuoteMaterialPriceOverride[];
  pricingSnapshot?: QuotePricingSnapshot;
  createdAt: any;
  updatedAt?: any;
  createdBy: string;
  teamCounts?: Partial<Record<ProductionStep, number>>;
  employeeAssignments?: EmployeeAssignment[];
  employeeEvaluations?: EmployeeEvaluation[];
  statusHistory?: QuoteStatusHistory[];
}

export type QuotePresentationStatus =
  | 'RASCUNHO'
  | 'GERADO'
  | 'COMPARTILHADO'
  | 'VISUALIZADO'
  | 'ACEITO'
  | 'EXPIRADO'
  | 'REVOGADO';

export interface InventoryItem {
  id: string;
  empresaId?: string;
  materialId: string;
  materialName: string;
  code: string;
  provider: string;
  rackId?: string;
  category?: string;
  materialLine?: string;
  materialType?: string;
  thicknessLabel?: string;
  texture?: string;
  length: number;
  width: number;
  thickness: number;
  area: number;
  cost: number;
  minimumSalePrice?: number;
  status: 'Disponível' | 'Reservada' | 'Usada' | 'Retalho' | 'Descarte';
  notes: string;
  photoUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
  lossReason?: string;
  lossNotes?: string;
  lossQuoteId?: string;
  lossClientId?: string;
  lossClientName?: string;
  lossPieceId?: string;
  lossPieceName?: string;
  lostByUid?: string;
  lostByName?: string;
  lostAt?: any;
}

export interface InventoryReservation {
  id: string;
  empresaId?: string;
  quoteId: string;
  materialId: string;
  materialVariantKey?: string;
  materialLine?: string;
  materialType?: string;
  thicknessLabel?: string;
  texture?: string;
  provider?: string;
  materialName: string;
  area: number;
  quoteStatus: QuoteStatus;
  clientName?: string;
  updatedAt?: any;
}

export type InventoryPurchaseStatus = 'Pedido' | 'Entregue' | 'Cancelado';

export interface InventoryPurchase {
  id: string;
  empresaId?: string;
  materialId: string;
  materialName: string;
  provider?: string;
  code: string;
  category?: string;
  materialLine?: string;
  materialType?: string;
  thicknessLabel?: string;
  texture?: string;
  length: number;
  width: number;
  thickness: number;
  area: number;
  cost: number;
  minimumSalePrice?: number;
  photoUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
  purchaseGroupId?: string;
  purchaseIndex?: number;
  purchaseQuantity?: number;
  status: InventoryPurchaseStatus;
  notes?: string;
  expectedDeliveryDate?: any;
  expectedDeliveryDateKey?: string;
  purchasedByUid: string;
  purchasedByName: string;
  purchasedAt?: any;
  receivedByUid?: string;
  receivedByName?: string;
  receivedAt?: any;
  inventoryItemId?: string;
}

export type SystemEventType =
  | 'client_created'
  | 'client_updated'
  | 'client_deleted'
  | 'quote_created'
  | 'quote_updated'
  | 'quote_deleted'
  | 'quote_duplicated'
  | 'quote_status_changed'
  | 'production_assignment_changed'
  | 'production_step_changed'
  | 'employee_evaluated'
  | 'fixture_updated'
  | 'inventory_created'
  | 'inventory_updated'
  | 'inventory_deleted'
  | 'purchase_ordered'
  | 'purchase_received'
  | 'purchase_cancelled';

export interface SystemEvent {
  id: string;
  empresaId?: string;
  type: SystemEventType;
  title: string;
  description?: string;
  entityType: 'client' | 'quote' | 'production' | 'employee' | 'inventory' | 'purchase';
  entityId?: string;
  clientId?: string;
  clientName?: string;
  quoteId?: string;
  quoteStatus?: QuoteStatus | string;
  materialId?: string;
  materialName?: string;
  employeeId?: string;
  employeeName?: string;
  userUid?: string;
  userName?: string;
  createdAt?: any;
  metadata?: Record<string, unknown>;
}
