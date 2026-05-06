export type UserRole = 'admin' | 'user';

export interface Profile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  blocked: boolean;
  phone?: string;
  photoUrl?: string;
  position?: string;
}

export interface Settings {
  companyName: string;
  logoUrl?: string;
  phone: string;
  email: string;
  address: string;
  defaultValidity: number;
  defaultNotes: string;
  laborRatePerLinearMeter: number;
  defaultFrontonHeight: number;
  defaultSkirtHeight: number;
  defaultTurnHeight: number;
  cutoutPrices: {
    cooktop: number;
    sinkUnder: number;
    sinkOver: number;
    faucetHole: number;
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
}

export interface Material {
  id: string;
  name: string;
  pricePerM2: number;
  baseCostPerM2?: number;
  marginPercentage?: number;
  provider: string;
  category: string;
  active: boolean;
  sourceInventoryId?: string;
  updatedAt?: any;
}

export interface UserMaterialPrice {
  id: string;
  userId: string;
  materialId: string;
  baseCostPerM2: number;
  marginPercentage: number;
  pricePerM2: number;
  updatedAt?: any;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

export type EmployeeRole = 'Vendedor' | 'Medidor' | 'Cortador' | 'Acabador' | 'Instalador' | 'Entregador' | 'Administrativo';

export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
  phone?: string;
  active: boolean;
  createdAt?: any;
}

export type ProductionStep = 'medicao' | 'corte' | 'acabamento' | 'instalacao' | 'entrega';

export interface EmployeeAssignment {
  step: ProductionStep;
  employeeId: string;
  employeeName: string;
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
  | 'Pré-orçamento'
  | 'Aguardando medição'
  | 'Medido'
  | 'Enviado'
  | 'Aprovado'
  | 'Recusado'
  | 'Em produção'
  | 'Pronto para entrega'
  | 'Entregue';

export interface PieceSide {
  type: 'frontao' | 'saia' | 'virada' | 'acabamento' | 'none';
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
  type: 'cuba' | 'cooktop' | 'torneira';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SculptedSink {
  active: boolean;
  type: 'Simples' | 'Com rampa' | 'Válvula oculta' | 'Cuba dupla';
  quantity: number;
  width: number;
  depth: number;
  height: number;
  unit: 'cm' | 'm';
  calculatedArea: number;
  calculatedValue: number;
}

export interface QuotePiece {
  id: string;
  name: string;
  materialId: string;
  unit: 'm' | 'cm';
  width: number;
  length: number;
  area: number;
  manualArea?: number;
  totalArea?: number;
  largestSide?: number;
  sides: PieceSide[];
  notes: string;
  drawingJson?: string;
  previewUrl?: string;
  proposalImageUrl?: string;
  cutouts?: DrawingCutout[];
  sculptedSink?: SculptedSink;
  purchasedFixtures?: {
    sink?: FixtureInfo;
    faucet?: FixtureInfo;
    cooktop?: FixtureInfo;
  };
}

export interface FixtureInfo {
  model?: string;
  brand?: string;
  width?: number;
  depth?: number;
  height?: number;
  diameter?: number;
  notes?: string;
}

export interface QuoteCutouts {
  cooktop: number;
  sinkUnder: number;
  sinkOver: number;
  faucetHole: number;
  sinkSculpted?: boolean;
}

export interface Quote {
  id: string;
  clientId: string;
  clientName: string;
  phone: string;
  address: string;
  environment: string;
  responsible: string;
  responsibleUserUid?: string;
  responsibleUserName?: string;
  materialId: string;
  materialName?: string;
  paymentMethod: string;
  deliveryDays: number;
  validityDate: any;
  commercialNotes: string;
  status: QuoteStatus;
  totalArea: number;
  totalPrice: number;
  pieces: QuotePiece[];
  cutouts: QuoteCutouts;
  createdAt: any;
  createdBy: string;
  employeeAssignments?: EmployeeAssignment[];
  employeeEvaluations?: EmployeeEvaluation[];
  statusHistory?: QuoteStatusHistory[];
}

export interface InventoryItem {
  id: string;
  materialId: string;
  materialName: string;
  code: string;
  provider: string;
  category?: string;
  length: number;
  width: number;
  thickness: number;
  area: number;
  cost: number;
  status: 'Disponível' | 'Reservada' | 'Usada' | 'Retalho' | 'Descarte';
  notes: string;
  photoUrl?: string;
}

export interface InventoryReservation {
  id: string;
  quoteId: string;
  materialId: string;
  materialName: string;
  area: number;
  quoteStatus: QuoteStatus;
  clientName?: string;
  updatedAt?: any;
}

export type InventoryPurchaseStatus = 'Pedido' | 'Entregue';

export interface InventoryPurchase {
  id: string;
  materialId: string;
  materialName: string;
  provider?: string;
  code: string;
  category?: string;
  length: number;
  width: number;
  thickness: number;
  area: number;
  cost: number;
  status: InventoryPurchaseStatus;
  notes?: string;
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
  | 'purchase_received';

export interface SystemEvent {
  id: string;
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
