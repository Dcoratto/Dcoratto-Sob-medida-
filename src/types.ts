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

export interface Client {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
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
  cutouts?: DrawingCutout[];
  sculptedSink?: SculptedSink;
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
  materialId: string;
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
