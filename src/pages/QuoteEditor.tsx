import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, Timestamp, onSnapshot, query, selectFields } from '../lib/firestore';
import { db } from '../lib/firestore';
import { useSettings } from '../hooks/useSettings';
import { Client, CondominiumRule, EmployeeAssignment, FixtureCatalogItem, FixtureCategory, InventoryItem, InventoryReservation, Material, PieceSide, Quote, QuoteMaterialPriceOverride, QuotePiece, QuotePieceKind, QuotePricingSnapshot, QuoteStatus, QuoteStatusHistory, Settings } from '../types';
import {MATERIAL_LOSS_PERCENTAGE, useQuoteCalculator} from '../hooks/useQuoteCalculator';
import {
  ArrowLeft, Save, Plus, Trash2, Pencil,
  ChevronDown, ChevronUp, Calculator,
  MapPin, Phone, User,
  Layers, PenTool, Building2, Mail, Package2, BadgeDollarSign, CreditCard, Truck, ReceiptText, Wrench, Boxes, NotebookText,
  Ban, CheckCircle2, Copy, ExternalLink, History, MessageCircle, Sparkles
} from 'lucide-react';
import {DEFAULT_QUOTE_COMPLEXITY_OPTIONS, resolveLaborAmount, resolveLocationAmount} from '../lib/locationPricing';
import { cn, formatArea, formatCentimeters, formatCurrency, formatMeasure, formatMeasureInput, formatPercentage, parseCurrencyInput, parseMeasureInput, roundNumber } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { DrawingCanvas } from '../components/DrawingCanvas';
import {applyQuoteInventoryByStatusTransition} from '../lib/inventoryReservations';
import {logSystemEvent} from '../lib/systemEvents';
import {normalizeQuoteStatus, QUOTE_STATUSES, quoteStatusColor} from '../lib/quoteStatus';
import {formatMaterialSpecs} from '../lib/materialSpecs';
import {buildMaterialVariantKey} from '../lib/materialVariants';
import {clearDraft, loadDraftMeta, saveDraft} from '../lib/draftStorage';
import {DraftNotice} from '../components/DraftNotice';
import {DraftAutosaveStatus} from '../components/DraftAutosaveStatus';
import {validateQuoteBeforeSave} from '../lib/businessRules';
import {getEffectivePieceLongestSide, getPieceMajorMinorSides} from '../lib/pieceDimensions';
import {getInventoryItemArea} from '../lib/inventoryMetrics';
import {buildPiecePricingBreakdowns} from '../lib/quotePiecePricing';
import {LABELS} from '../constants/labels';
import {imageVariantUrl} from '../lib/storage';
import {getEffectivePieceBaseArea, getPieceAreaMode, getStoredDrawingArea, getStoredManualFinalArea} from '../lib/quotePieceArea';
import {
  buildCutoutCatalog,
  EMPTY_QUOTE_CUTOUTS,
  getCutoutLabel,
  hasAnyScopedCutouts,
  resolveQuoteCutoutSource,
  updatePieceManualCutouts,
  type PieceScopedCutoutType,
  type QuoteCutoutState,
} from '../lib/quotePieceCutouts';
import {CurrencyInput, NumericInput, PercentageInput} from '../components/inputs/NumericInput';
import {
  calculateQuoteInstallmentAmount,
  calculateDesiredTotalAdjustment,
  calculateQuotePaymentTotals,
  findPaymentMethodAdjustment,
  parseInstallmentCountFromMethod,
} from '../lib/quotePaymentSimulation';
import {
  generateQuotePresentationVersion,
  listQuotePresentationAcceptances,
  listQuotePresentationVersions,
  markQuotePresentationShared,
  QuotePresentationAcceptanceSummary,
  QuotePresentationVersionSummary,
  revokeQuotePresentationVersion,
} from '../lib/quoteDigital';

type QuoteSidebarSectionKey = 'digital' | 'client' | 'materials' | 'pricing' | 'payment';
type PieceEditorMode = 'draw' | 'manual' | 'stair' | null;
type PieceKindChoice = QuotePieceKind;

const MATERIAL_PRICE_MINIMUM_ERROR = 'O valor personalizado não pode ser menor que o valor mínimo definido para este material.';

const quoteMaterialPriceKey = (materialId?: string, materialVariantKey?: string) =>
  `${materialId || ''}::${materialVariantKey || ''}`;

const formatPriceInputValue = (value: number) =>
  formatCurrency(Number.isFinite(value) ? value : 0);

const formatEditableMeasureValue = (value: number) => {
  if (!Number.isFinite(value)) return '';
  const normalized = String(roundNumber(value, 3)).replace('.', ',');
  return normalized.replace(/,?0+$/g, '');
};

const parseQuoteMaterialPriceInput = (value: string): {status: 'empty' | 'valid' | 'invalid' | 'negative'; value?: number} => {
  const raw = String(value || '').trim();
  if (!raw) return {status: 'empty'};

  const normalized = raw.replace(/\s+/g, '').replace(/^R\$/i, '');
  if (!normalized) return {status: 'empty'};
  if (normalized.includes('-')) return {status: 'negative'};

  const acceptsBrazilianCurrency =
    /^\d+(?:\.\d{3})*(?:,\d{0,2})?$/.test(normalized) ||
    /^\d+(?:,\d{1,2})?$/.test(normalized) ||
    /^\d+\.\d{1,2}$/.test(normalized);
  if (!acceptsBrazilianCurrency) return {status: 'invalid'};

  const parsed = parseCurrencyInput(normalized);
  return Number.isFinite(parsed) ? {status: 'valid', value: parsed} : {status: 'invalid'};
};

const inputValuesFromMaterialOverrides = (overrides?: QuoteMaterialPriceOverride[]) =>
  (overrides || []).reduce((acc, override) => {
    if (!override.materialId || !Number.isFinite(Number(override.pricePerM2))) return acc;
    acc[quoteMaterialPriceKey(override.materialId, override.materialVariantKey)] = formatPriceInputValue(Number(override.pricePerM2));
    return acc;
  }, {} as Record<string, string>);

const inputValuesFromPieceManualPrices = (pieces?: QuotePiece[]) =>
  (pieces || []).reduce((acc, piece) => {
    if (!piece.id || !Number.isFinite(Number(piece.manualPrice))) return acc;
    acc[piece.id] = formatPriceInputValue(Number(piece.manualPrice));
    return acc;
  }, {} as Record<string, string>);

const pieceMeasureInputKey = (pieceId: string, field: 'length' | 'width') => `${pieceId}:${field}`;
const pieceManualAreaInputKey = (pieceId: string) => `${pieceId}:manual-final-area`;
const pieceManualLongestSideInputKey = (pieceId: string) => `${pieceId}:manual-longest-side`;

const formatPresentationDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
};

const normalizeWhatsApp = (value?: string) => String(value || '').replace(/\D/g, '');

const cloneQuotePricingSnapshot = (source: QuotePricingSnapshot): QuotePricingSnapshot => ({
  laborRatePerLinearMeter: Number(source.laborRatePerLinearMeter || 0),
  laborMinimumByRegion: {
    altoTiete: Number(source.laborMinimumByRegion?.altoTiete || 0),
    saoPaulo: Number(source.laborMinimumByRegion?.saoPaulo || 0),
  },
  laborPricing: {
    mode: source.laborPricing?.mode || 'linear',
    fixedAmount: Number(source.laborPricing?.fixedAmount || 0),
    defaultAmount: Number(source.laborPricing?.defaultAmount || 0),
    cityRules: (source.laborPricing?.cityRules || []).map((cityRule) => ({
      ...cityRule,
      amount: Number(cityRule.amount || 0),
      districts: (cityRule.districts || []).map((districtRule) => ({
        ...districtRule,
        amount: Number(districtRule.amount || 0),
      })),
    })),
  },
  deliveryPricing: {
    mode: source.deliveryPricing?.mode || 'location',
    fixedAmount: Number(source.deliveryPricing?.fixedAmount || 0),
    defaultAmount: Number(source.deliveryPricing?.defaultAmount || 0),
    cityRules: (source.deliveryPricing?.cityRules || []).map((cityRule) => ({
      ...cityRule,
      amount: Number(cityRule.amount || 0),
      districts: (cityRule.districts || []).map((districtRule) => ({
        ...districtRule,
        amount: Number(districtRule.amount || 0),
      })),
    })),
  },
  quoteComplexityOptions: (source.quoteComplexityOptions || []).map((option) => ({
    ...option,
    percent: Number(option.percent || 0),
    sortOrder: Number(option.sortOrder || 0),
  })),
  cutoutPrices: {
    cooktop: Number(source.cutoutPrices?.cooktop || 0),
    sinkUnder: Number(source.cutoutPrices?.sinkUnder || 0),
    sinkOver: Number(source.cutoutPrices?.sinkOver || 0),
    faucetHole: Number(source.cutoutPrices?.faucetHole || 0),
    trashBinCutout: Number(source.cutoutPrices?.trashBinCutout || 0),
    popUpTowerCutout: Number(source.cutoutPrices?.popUpTowerCutout || 0),
    wetAreaAmericanRecess: Number(source.cutoutPrices?.wetAreaAmericanRecess || 0),
    wetAreaItalianRecess: Number(source.cutoutPrices?.wetAreaItalianRecess || 0),
    sinkSculpted: Boolean(source.cutoutPrices?.sinkSculpted),
    sinkSculptedPrice: Number(source.cutoutPrices?.sinkSculptedPrice || 0),
  },
  paymentMethods: (source.paymentMethods || []).map((method) => ({
    name: String(method.name || ''),
    adjustment: Number(method.adjustment || 0),
  })),
  sculptedSinkRates: {
    simple: Number(source.sculptedSinkRates?.simple || 0),
    ramp: Number(source.sculptedSinkRates?.ramp || 0),
    hiddenValve: Number(source.sculptedSinkRates?.hiddenValve || 0),
    extraSink: Number(source.sculptedSinkRates?.extraSink || 0),
    riskPercentage: Number(source.sculptedSinkRates?.riskPercentage || 0),
  },
});

const cloneStoredQuotePricingSnapshot = <T extends Partial<QuotePricingSnapshot>>(source: T): T =>
  JSON.parse(JSON.stringify(source)) as T;

const buildQuotePricingSnapshot = (settings: Settings): QuotePricingSnapshot => cloneQuotePricingSnapshot({
  laborRatePerLinearMeter: settings.laborRatePerLinearMeter,
  laborMinimumByRegion: settings.laborMinimumByRegion,
  laborPricing: settings.laborPricing,
  deliveryPricing: settings.deliveryPricing,
  quoteComplexityOptions: settings.quoteComplexityOptions,
  cutoutPrices: settings.cutoutPrices,
  paymentMethods: settings.paymentMethods,
  sculptedSinkRates: settings.sculptedSinkRates,
});

const applyQuotePricingSnapshot = (settings: Settings, snapshot?: Partial<QuotePricingSnapshot> | null): Settings => {
  if (!snapshot) return settings;

  const mergedSnapshot = cloneQuotePricingSnapshot({
    laborRatePerLinearMeter:
      snapshot.laborRatePerLinearMeter == null ? settings.laborRatePerLinearMeter : snapshot.laborRatePerLinearMeter,
    laborMinimumByRegion: {
      altoTiete: snapshot.laborMinimumByRegion?.altoTiete == null
        ? settings.laborMinimumByRegion.altoTiete
        : snapshot.laborMinimumByRegion.altoTiete,
      saoPaulo: snapshot.laborMinimumByRegion?.saoPaulo == null
        ? settings.laborMinimumByRegion.saoPaulo
        : snapshot.laborMinimumByRegion.saoPaulo,
    },
    laborPricing: snapshot.laborPricing || settings.laborPricing,
    deliveryPricing: snapshot.deliveryPricing || settings.deliveryPricing,
    quoteComplexityOptions: snapshot.quoteComplexityOptions?.length
      ? snapshot.quoteComplexityOptions
      : settings.quoteComplexityOptions,
    cutoutPrices: {
      ...settings.cutoutPrices,
      ...(snapshot.cutoutPrices || {}),
    },
    paymentMethods: snapshot.paymentMethods?.length
      ? snapshot.paymentMethods
      : settings.paymentMethods,
    sculptedSinkRates: {
      ...settings.sculptedSinkRates,
      ...(snapshot.sculptedSinkRates || {}),
    },
  });

  return {
    ...settings,
    laborRatePerLinearMeter: mergedSnapshot.laborRatePerLinearMeter,
    laborMinimumByRegion: mergedSnapshot.laborMinimumByRegion,
    laborPricing: mergedSnapshot.laborPricing,
    deliveryPricing: mergedSnapshot.deliveryPricing,
    quoteComplexityOptions: mergedSnapshot.quoteComplexityOptions,
    cutoutPrices: mergedSnapshot.cutoutPrices,
    paymentMethods: mergedSnapshot.paymentMethods,
    sculptedSinkRates: mergedSnapshot.sculptedSinkRates,
  };
};

const SidebarAccordionSection = ({
  sectionKey,
  openSection,
  onToggle,
  icon: Icon,
  title,
  description,
  children,
}: {
  sectionKey: QuoteSidebarSectionKey;
  openSection: QuoteSidebarSectionKey | null;
  onToggle: (section: QuoteSidebarSectionKey | null) => void;
  icon: React.ComponentType<{className?: string}>;
  title: string;
  description: string;
  children: React.ReactNode;
}) => {
  const isOpen = openSection === sectionKey;
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => onToggle(isOpen ? null : sectionKey)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors', isOpen ? 'bg-brand-primary text-[#3F3A34]' : 'bg-slate-100 text-slate-500')}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-bold text-slate-900">{title}</div>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          </div>
        </div>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
      </button>
      <div className={cn('grid transition-all duration-300 ease-out', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 px-5 py-5">{children}</div>
        </div>
      </div>
    </section>
  );
};

const clonePieceForEditor = (piece: QuotePiece) => JSON.parse(JSON.stringify(piece)) as QuotePiece;

const getPieceKindLabel = (kind?: QuotePieceKind) => {
  if (kind === 'escada') return 'Escada';
  if (kind === 'soleira_baguete') return 'Soleira / Baguete';
  return 'Bancada';
};

const getPieceDefaultName = (kind: QuotePieceKind | undefined, pieces: QuotePiece[]) => {
  if (kind === 'escada') return `Escada ${pieces.filter((piece) => piece.stair?.active).length + 1}`;
  if (kind === 'soleira_baguete') {
    return `Soleira / Baguete ${pieces.filter((piece) => piece.kind === 'soleira_baguete').length + 1}`;
  }
  return `${LABELS.pieces.singular} ${pieces.length + 1}`;
};

const inferPieceKind = (piece: QuotePiece): QuotePieceKind => {
  if (piece.stair?.active) return 'escada';
  if (piece.kind === 'soleira_baguete') return 'soleira_baguete';
  return 'bancada';
};

const inferPieceEditorMode = (piece: QuotePiece): Exclude<PieceEditorMode, null> => {
  if (piece.stair?.active) return 'stair';
  if (piece.drawingJson || piece.previewUrl || getStoredDrawingArea(piece) > 0) return 'draw';
  if (getPieceAreaMode(piece) === 'manual' || getStoredManualFinalArea(piece) > 0 || Number(piece.manualLongestSide || 0) > 0) {
    return 'manual';
  }
  return 'draw';
};

const PricingSwitch = ({checked, onChange, label}: {checked: boolean; onChange: (checked: boolean) => void; label: string}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border outline-none transition-[background-color,border-color] duration-[180ms] ease-out focus-visible:ring-2 focus-visible:ring-emerald-300/40 focus-visible:ring-offset-2',
      checked ? 'border-emerald-500/10 bg-[#34C759]' : 'border-black/[0.04] bg-[#E9ECF1]',
    )}
  >
    <span
      className={cn(
        'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.14)] transition-transform duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
        checked ? 'translate-x-4' : 'translate-x-0',
      )}
    />
  </button>
);

const normalizeStockStatus = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const ensurePieceWorkflowStatus = (piece: QuotePiece, fallbackStatus?: QuoteStatus): QuotePiece => ({
  ...piece,
  pieceStatus: normalizeQuoteStatus(piece.pieceStatus || fallbackStatus || LABELS.quotes.singular),
});

const normalizeFixtureCategory = (category?: string): FixtureCategory => {
  const value = String(category || '').trim();
  if (value === 'cuba') return 'sink';
  if (value === 'torneira') return 'faucet';
  if (value === 'lixeira') return 'trashBin';
  if (value === 'torre_tomada') return 'popUpTower';
  if (value === 'cooktop' || value === 'sink' || value === 'faucet' || value === 'trashBin' || value === 'popUpTower') return value;
  return 'cooktop';
};

const normalizeFixtureCatalogItem = (item: FixtureCatalogItem): FixtureCatalogItem => ({
  ...item,
  category: normalizeFixtureCategory(item.category),
  active: item.active !== false,
});

export const QuoteEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, appUid, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [auxiliaryDataReady, setAuxiliaryDataReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quoteDraftRecovered, setQuoteDraftRecovered] = useState(false);
  const [quoteDraftSavedAt, setQuoteDraftSavedAt] = useState<string | null>(null);
  const [digitalVersions, setDigitalVersions] = useState<QuotePresentationVersionSummary[]>([]);
  const [digitalAcceptances, setDigitalAcceptances] = useState<QuotePresentationAcceptanceSummary[]>([]);
  const [digitalLoading, setDigitalLoading] = useState(false);
  const [digitalBusy, setDigitalBusy] = useState('');
  const [digitalError, setDigitalError] = useState('');
  const [digitalHistoryOpen, setDigitalHistoryOpen] = useState(false);

  // Form State
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [pieceMaterialSearch, setPieceMaterialSearch] = useState<Record<string, string>>({});
  const [pieceMaterialPickerOpen, setPieceMaterialPickerOpen] = useState<Record<string, boolean>>({});
  const [environment, setEnvironment] = useState('');
  const [responsible, setResponsible] = useState(user?.user_metadata?.name || '');
  const [materialId, setMaterialId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentMode, setPaymentMode] = useState<'total' | 'entry'>('total');
  const [totalPaymentMethod, setTotalPaymentMethod] = useState('');
  const [remainingPaymentMethod, setRemainingPaymentMethod] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [installmentCount, setInstallmentCount] = useState(1);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [sidebarSection, setSidebarSection] = useState<QuoteSidebarSectionKey | null>(null);
  const [complexityKey, setComplexityKey] = useState(DEFAULT_QUOTE_COMPLEXITY_OPTIONS[0].key);
  const [commissionPercent, setCommissionPercent] = useState('');
  const [negotiationDiscountPercent, setNegotiationDiscountPercent] = useState('');
  const [rtPercent, setRtPercent] = useState('');
  const [desiredTotalInput, setDesiredTotalInput] = useState('');
  const [desiredTotalFeedback, setDesiredTotalFeedback] = useState('');
  const [deliveryDays, setDeliveryDays] = useState(15);
  const [measurementDate, setMeasurementDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [validityDays, setValidityDays] = useState(15);
  const [commercialNotes, setCommercialNotes] = useState('');
  const [status, setStatus] = useState<QuoteStatus>(QUOTE_STATUSES[0]);
  const [originalStatus, setOriginalStatus] = useState<QuoteStatus>(QUOTE_STATUSES[0]);
  const [pieces, setPieces] = useState<QuotePiece[]>([]);
  const [materialCustomPriceInputs, setMaterialCustomPriceInputs] = useState<Record<string, string>>({});
  const [pieceManualPriceInputs, setPieceManualPriceInputs] = useState<Record<string, string>>({});
  const [pieceMeasureInputs, setPieceMeasureInputs] = useState<Record<string, string>>({});
  const [activePieceMeasureInput, setActivePieceMeasureInput] = useState<string | null>(null);
  const [cutouts, setCutouts] = useState<QuoteCutoutState>(EMPTY_QUOTE_CUTOUTS);
  const [showDrawing, setShowDrawing] = useState<string | null>(null);
  const [pieceEditorOpen, setPieceEditorOpen] = useState(false);
  const [pieceEditorPieceId, setPieceEditorPieceId] = useState<string | null>(null);
  const [pieceEditorMode, setPieceEditorMode] = useState<PieceEditorMode>(null);
  const [pieceEditorIsNew, setPieceEditorIsNew] = useState(false);
  const [pieceEditorRestoreSnapshot, setPieceEditorRestoreSnapshot] = useState<{
    piece: QuotePiece;
    manualPriceInput?: string;
    materialSearch?: string;
  } | null>(null);
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignment[]>([]);
  const [statusHistory, setStatusHistory] = useState<QuoteStatusHistory[]>([]);
  const [fixtureCatalog, setFixtureCatalog] = useState<FixtureCatalogItem[]>([]);
  const [quotePricingMode, setQuotePricingMode] = useState<'sale' | 'cost'>('sale');
  const [includeMaterialLoss, setIncludeMaterialLoss] = useState(true);
  const [includeCutouts, setIncludeCutouts] = useState(true);
  const [includeSculptedSink, setIncludeSculptedSink] = useState(true);
  const [includeLabor, setIncludeLabor] = useState(true);
  const [includeDelivery, setIncludeDelivery] = useState(true);
  const [includeComplexity, setIncludeComplexity] = useState(true);
  const [pricingSnapshot, setPricingSnapshot] = useState<Partial<QuotePricingSnapshot> | null>(null);
  const quoteDraftHydratedRef = useRef(false);
  const quoteDraftKey = `quote-editor-draft:${appUid || 'anonymous'}:${id || 'new'}`;
  const effectiveQuoteSettings = useMemo(
    () => applyQuotePricingSnapshot(settings, pricingSnapshot),
    [pricingSnapshot, settings],
  );

  const materialVariantOptions = useMemo(() => {
    const grouped = new Map<string, Material & {variantKey: string; availableArea: number; stockArea: number;}>();

    inventory
      .filter((item) => !['usada', 'descarte'].includes(normalizeStockStatus(item.status)))
      .forEach((item) => {
        const baseMaterial = materials.find((material) => material.id === item.materialId);
        const variantKey = buildMaterialVariantKey(item);
        const current = grouped.get(variantKey);
        const availableArea = normalizeStockStatus(item.status) === 'reservada' ? 0 : (item.area || 0);

        if (current) {
          current.stockArea += item.area || 0;
          current.availableArea += availableArea;
          return;
        }

        grouped.set(variantKey, {
          ...(baseMaterial || {
            id: item.materialId,
            name: item.materialName,
            pricePerM2: 0,
            provider: item.provider || '',
            category: item.category || '',
            active: true,
          }),
          provider: item.provider || baseMaterial?.provider || '',
          category: item.category || baseMaterial?.category || '',
          materialLine: item.materialLine || baseMaterial?.materialLine || item.category || baseMaterial?.category || '',
          materialType: item.materialType || baseMaterial?.materialType || '',
          thicknessLabel: item.thicknessLabel || baseMaterial?.thicknessLabel || '',
          texture: item.texture || baseMaterial?.texture || '',
          imageUrl: item.photoUrl || baseMaterial?.imageUrl || '',
          thumbnailUrl: item.thumbnailUrl || baseMaterial?.thumbnailUrl || '',
          mediumUrl: item.mediumUrl || baseMaterial?.mediumUrl || '',
          originalUrl: item.originalUrl || item.photoUrl || baseMaterial?.originalUrl || baseMaterial?.imageUrl || '',
          variantKey,
          availableArea,
          stockArea: item.area || 0,
        });
      });

    materials.forEach((material) => {
      const variantKey = buildMaterialVariantKey(material);
      if (grouped.has(variantKey)) return;
      grouped.set(variantKey, {
        ...material,
        variantKey,
        availableArea: 0,
        stockArea: 0,
      });
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return formatMaterialSpecs(a).localeCompare(formatMaterialSpecs(b));
    });
  }, [inventory, materials]);

  const minimumSaleFromInventory = (materialIdToFind?: string, materialVariantKey?: string) => {
    if (!materialIdToFind) return 0;
    const stockItems = inventory.filter((item) =>
      item.materialId === materialIdToFind &&
      !['usada', 'descarte'].includes(normalizeStockStatus(item.status)) &&
      (!materialVariantKey || buildMaterialVariantKey(item) === materialVariantKey),
    );
    return stockItems.reduce((lowest, item) => {
      const value = Number(item.minimumSalePrice ?? item.cost ?? 0);
      if (!(value > 0)) return lowest;
      return lowest > 0 ? Math.min(lowest, value) : value;
    }, 0);
  };

  const materialWithUserPrice = (idToFind?: string, materialVariantKey?: string) => {
    const baseMaterial = materials.find((material) => material.id === idToFind);
    const matchedVariant = materialVariantKey
      ? materialVariantOptions.find((material) => material.id === idToFind && material.variantKey === materialVariantKey)
      : undefined;
    const minimumSale = minimumSaleFromInventory(idToFind, materialVariantKey);
    const fallbackMinimum = minimumSale || baseMaterial?.baseMinimumSalePerM2 || baseMaterial?.baseCostPerM2 || 0;
    const fallbackPrice = matchedVariant?.pricePerM2 || baseMaterial?.pricePerM2 || fallbackMinimum;
    return baseMaterial
      ?{
        ...baseMaterial,
        provider: matchedVariant?.provider || baseMaterial.provider || '',
        category: matchedVariant?.category || baseMaterial.category || '',
        materialLine: matchedVariant?.materialLine || baseMaterial.materialLine || '',
        materialType: matchedVariant?.materialType || baseMaterial.materialType || '',
        thicknessLabel: matchedVariant?.thicknessLabel || baseMaterial.thicknessLabel || '',
        texture: matchedVariant?.texture || baseMaterial.texture || '',
        imageUrl: matchedVariant?.imageUrl || baseMaterial.imageUrl || '',
        baseMinimumSalePerM2: fallbackMinimum,
        pricePerM2: fallbackPrice,
      }
      : undefined;
  };

  const quoteMaterialPriceRows = useMemo(() => {
    type QuoteMaterialPriceRow = {
      key: string;
      materialId: string;
      materialVariantKey?: string;
      name: string;
      specs: string;
      defaultPricePerM2: number;
      minimumSalePerM2: number;
      customInput: string;
      customPricePerM2?: number;
      usedPricePerM2: number;
      pieceNames: string[];
      error?: string;
    };

    const rows = new Map<string, QuoteMaterialPriceRow>();

    pieces.forEach((piece) => {
      const material = materialWithUserPrice(piece.materialId || materialId, piece.materialVariantKey);
      if (!piece.materialId || !material) return;

      const key = quoteMaterialPriceKey(piece.materialId, piece.materialVariantKey);
      const defaultPricePerM2 = Math.max(0, Number(material.pricePerM2 || 0));
      const minimumSalePerM2 = Math.max(0, Number(material.baseMinimumSalePerM2 || 0));
      const customInput = materialCustomPriceInputs[key] || '';
      const parsed = parseQuoteMaterialPriceInput(customInput);
      const customPricePerM2 = parsed.status === 'valid' ? Math.max(0, Number(parsed.value || 0)) : undefined;
      const error =
        parsed.status === 'negative'
          ? 'O valor personalizado não pode ser negativo.'
          : parsed.status === 'invalid'
            ? 'Informe um valor monetário válido, como 850,00.'
            : typeof customPricePerM2 === 'number' && customPricePerM2 < minimumSalePerM2
              ? MATERIAL_PRICE_MINIMUM_ERROR
              : undefined;
      const usedPricePerM2 = !error && typeof customPricePerM2 === 'number'
        ? customPricePerM2
        : Math.max(defaultPricePerM2, minimumSalePerM2);

      const existing = rows.get(key);
      if (existing) {
        if (piece.name && !existing.pieceNames.includes(piece.name)) existing.pieceNames.push(piece.name);
        return;
      }

      rows.set(key, {
        key,
        materialId: piece.materialId,
        materialVariantKey: piece.materialVariantKey,
        name: material.name,
        specs: formatMaterialSpecs(material),
        defaultPricePerM2,
        minimumSalePerM2,
        customInput,
        customPricePerM2,
        usedPricePerM2,
        pieceNames: piece.name ? [piece.name] : [],
        error,
      });
    });

    return Array.from(rows.values());
  }, [inventory, materialCustomPriceInputs, materialId, materialVariantOptions, materials, pieces]);

  const quoteMaterialPriceError = quoteMaterialPriceRows.find((row) => row.error)?.error;

  const materialWithQuotePrice = (idToFind?: string, materialVariantKey?: string) => {
    const material = materialWithUserPrice(idToFind, materialVariantKey);
    if (!material || !idToFind) return material;

    const key = quoteMaterialPriceKey(idToFind, materialVariantKey);
    const minimumSalePerM2 = Math.max(0, Number(material.baseMinimumSalePerM2 || 0));
    const defaultPricePerM2 = Math.max(0, Number(material.pricePerM2 || 0));
    const parsed = parseQuoteMaterialPriceInput(materialCustomPriceInputs[key] || '');
    const validCustomPrice = parsed.status === 'valid' && Number(parsed.value) >= minimumSalePerM2
      ? Number(parsed.value)
      : undefined;

    return {
      ...material,
      pricePerM2: typeof validCustomPrice === 'number' ? validCustomPrice : Math.max(defaultPricePerM2, minimumSalePerM2),
    };
  };

  const selectedClient = clients.find(c => c.id === clientId);
  const { calculatePieceArea, calculateSculptedSink, calculateStairArea } = useQuoteCalculator(effectiveQuoteSettings, (piece) => materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey));
  const currentUserName = profile?.name || user?.user_metadata?.name || user?.email || 'Usuário';
  const refreshDigitalPresentation = async () => {
    if (!id) {
      setDigitalVersions([]);
      setDigitalAcceptances([]);
      return;
    }

    setDigitalLoading(true);
    setDigitalError('');
    try {
      const [versions, acceptances] = await Promise.all([
        listQuotePresentationVersions(id),
        listQuotePresentationAcceptances(id),
      ]);
      setDigitalVersions(versions);
      setDigitalAcceptances(acceptances);
    } catch (err: any) {
      setDigitalError(err?.message || 'Não foi possível carregar a proposta digital deste orçamento.');
    } finally {
      setDigitalLoading(false);
    }
  };

  const latestDigitalVersion = digitalVersions[0];
  const isDigitalOpen = sidebarSection === 'digital' || Boolean(digitalError);
  const buildPublicProposalUrl = (publicToken?: string) =>
    publicToken ? `${window.location.origin}/proposta/${publicToken}` : '';

  const handleGenerateDigitalVersion = async () => {
    if (!id) return;
    setDigitalBusy('generate');
    setDigitalError('');
    try {
      await persistQuote({
        navigateAfterPersist: false,
        appendStatusHistory: false,
        logEvent: false,
        showAlertOnError: false,
      });
      await generateQuotePresentationVersion(id, currentUserName);
      await refreshDigitalPresentation();
    } catch (err: any) {
      setDigitalError(err?.message || 'Nao foi possivel gerar a proposta digital agora.');
    } finally {
      setDigitalBusy('');
    }
  };

  const handleOpenDigitalVersion = async (version: QuotePresentationVersionSummary) => {
    setDigitalBusy(`open:${version.id}`);
    setDigitalError('');
    try {
      await markQuotePresentationShared(version.id, currentUserName);
      window.open(buildPublicProposalUrl(version.publicToken), '_blank', 'noopener,noreferrer');
      await refreshDigitalPresentation();
    } catch (err: any) {
      setDigitalError(err?.message || 'Não foi possível abrir a proposta digital.');
    } finally {
      setDigitalBusy('');
    }
  };

  const handleCopyDigitalLink = async (version: QuotePresentationVersionSummary) => {
    setDigitalBusy(`copy:${version.id}`);
    setDigitalError('');
    try {
      await markQuotePresentationShared(version.id, currentUserName);
      await navigator.clipboard.writeText(buildPublicProposalUrl(version.publicToken));
      await refreshDigitalPresentation();
    } catch (err: any) {
      setDigitalError(err?.message || 'Não foi possível copiar o link da proposta.');
    } finally {
      setDigitalBusy('');
    }
  };

  const handleSendDigitalWhatsApp = async (version: QuotePresentationVersionSummary) => {
    const whatsapp = normalizeWhatsApp(selectedClient?.phone || '');
    if (!whatsapp) {
      window.alert('O cliente selecionado não possui WhatsApp cadastrado.');
      return;
    }

    setDigitalBusy(`wa:${version.id}`);
    setDigitalError('');
    try {
      await markQuotePresentationShared(version.id, currentUserName);
      const link = buildPublicProposalUrl(version.publicToken);
      const lines = [
        `Olá, ${selectedClient?.name || 'cliente'}!`,
        '',
        `Segue a proposta digital ${version.versionLabel} da D'Coratto para o seu projeto.`,
        link,
      ];
      window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
      await refreshDigitalPresentation();
    } catch (err: any) {
      setDigitalError(err?.message || 'Não foi possível abrir o compartilhamento por WhatsApp.');
    } finally {
      setDigitalBusy('');
    }
  };

  const handleRevokeDigitalVersion = async (version: QuotePresentationVersionSummary) => {
    const confirmed = window.confirm(`Revogar o link da ${version.versionLabel}?`);
    if (!confirmed) return;

    setDigitalBusy(`revoke:${version.id}`);
    setDigitalError('');
    try {
      await revokeQuotePresentationVersion(version.id, currentUserName);
      await refreshDigitalPresentation();
    } catch (err: any) {
      setDigitalError(err?.message || 'Não foi possível revogar o link desta proposta.');
    } finally {
      setDigitalBusy('');
    }
  };

  useEffect(() => {
    void refreshDigitalPresentation();
  }, [id]);

  const activeComplexityOptions = useMemo(
    () => (effectiveQuoteSettings.quoteComplexityOptions || DEFAULT_QUOTE_COMPLEXITY_OPTIONS)
      .filter((option) => option.active !== false)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [effectiveQuoteSettings.quoteComplexityOptions],
  );
  
  const pieceManualPriceErrors = useMemo(() =>
    pieces.reduce((acc, piece) => {
      if ((piece.pricingMode || 'automatic') !== 'manual') return acc;
      const input = pieceManualPriceInputs[piece.id] || '';
      const parsed = parseQuoteMaterialPriceInput(input);
      acc[piece.id] =
        parsed.status === 'empty'
          ? 'Informe o valor manual desta peça.'
          : parsed.status === 'negative'
            ? 'O valor manual da peça não pode ser negativo.'
            : parsed.status === 'invalid'
              ? 'Informe um valor monetário válido, como 850,00.'
              : undefined;
      return acc;
    }, {} as Record<string, string | undefined>),
  [pieceManualPriceInputs, pieces]);
  const pieceManualPriceError = Object.values(pieceManualPriceErrors).find(Boolean);

  const totalMethodAdjustment = findPaymentMethodAdjustment(effectiveQuoteSettings.paymentMethods, totalPaymentMethod);
  const remainingMethodAdjustment = findPaymentMethodAdjustment(effectiveQuoteSettings.paymentMethods, remainingPaymentMethod);
  const totalArea = pieces.reduce((acc, p) => acc + calculatePieceArea(p).totalArea, 0);
  const pieceAreaDetails = pieces.map((piece) => ({piece, totals: calculatePieceArea(piece), material: materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey)}));
  const locationContext = {
    city: selectedClient?.city,
    district: selectedClient?.neighborhood,
    address: selectedClient?.address,
  };
  const resolvedComplexity = activeComplexityOptions.find((option) => option.key === complexityKey) || activeComplexityOptions[0] || DEFAULT_QUOTE_COMPLEXITY_OPTIONS[0];
  const usesLinearLaborPricing = (effectiveQuoteSettings.laborPricing?.mode || 'linear') === 'linear';
  const effectiveQuoteCutouts = useMemo(
    () => resolveQuoteCutoutSource(pieces, cutouts),
    [pieces, cutouts],
  );
  const basePiecePricingBreakdowns = useMemo(
    () => buildPiecePricingBreakdowns({
      pieces,
      quoteCutouts: effectiveQuoteCutouts,
      settings: effectiveQuoteSettings,
      clientLocation: {
        city: selectedClient?.city,
        address: selectedClient?.address,
      },
      calculatePieceArea,
      resolveMaterialPricePerM2: (piece) => materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey)?.pricePerM2 || 0,
      includeLabor: quotePricingMode !== 'cost' && usesLinearLaborPricing,
      includeMaterialLoss: true,
      includeCutouts: true,
      includeSculptedSink: true,
      includeComplexity,
      complexityOptions: activeComplexityOptions,
      resolveManualPiecePrice: (piece) => {
        if ((piece.pricingMode || 'automatic') !== 'manual') return undefined;
        const parsed = parseQuoteMaterialPriceInput(pieceManualPriceInputs[piece.id] || '');
        return parsed.status === 'valid' ? Number(parsed.value) : undefined;
      },
    }),
    [activeComplexityOptions, calculatePieceArea, effectiveQuoteCutouts, effectiveQuoteSettings, includeComplexity, materialId, pieceManualPriceInputs, pieces, quotePricingMode, selectedClient?.address, selectedClient?.city, usesLinearLaborPricing],
  );
  const stonesCost = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.stoneBaseValue, 0);
  const originalMaterialLossCost = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.materialLossValue, 0);
  const originalPiecePricingBreakdowns = useMemo(
    () => buildPiecePricingBreakdowns({
      pieces,
      quoteCutouts: effectiveQuoteCutouts,
      settings: effectiveQuoteSettings,
      clientLocation: {
        city: selectedClient?.city,
        address: selectedClient?.address,
      },
      calculatePieceArea,
      resolveMaterialPricePerM2: (piece) => materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey)?.pricePerM2 || 0,
      includeLabor: quotePricingMode !== 'cost' && usesLinearLaborPricing,
      includeMaterialLoss: quotePricingMode !== 'cost',
      includeCutouts: true,
      includeSculptedSink: true,
      includeComplexity,
      complexityOptions: activeComplexityOptions,
      resolveManualPiecePrice: (piece) => {
        if ((piece.pricingMode || 'automatic') !== 'manual') return undefined;
        const parsed = parseQuoteMaterialPriceInput(pieceManualPriceInputs[piece.id] || '');
        return parsed.status === 'valid' ? Number(parsed.value) : undefined;
      },
    }),
    [activeComplexityOptions, calculatePieceArea, effectiveQuoteCutouts, effectiveQuoteSettings, includeComplexity, materialId, pieceManualPriceInputs, pieces, quotePricingMode, selectedClient?.address, selectedClient?.city, usesLinearLaborPricing],
  );
  const originalLinearLaborCost = originalPiecePricingBreakdowns.reduce((acc, item) => acc + item.laborValue, 0);
  const originalCutoutsCost = originalPiecePricingBreakdowns.reduce((acc, item) => acc + item.cutoutValue, 0);
  const originalSculptedLaborCost = originalPiecePricingBreakdowns.reduce((acc, item) => acc + item.sinkAdditionalValue, 0);
  const pieceComplexityValue = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.complexityValue, 0);
  const piecesWithPresentationSnapshot = useMemo(
    () => pieces.map((piece, index) => {
      const pieceMaterial = materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey);
      const pieceTotals = calculatePieceArea(piece);
      const pieceBreakdown = basePiecePricingBreakdowns[index];
      const pieceCutoutBreakdown = originalPiecePricingBreakdowns[index];
      const highlights = [
        pieceCutoutBreakdown?.cutoutCount ? `${pieceCutoutBreakdown.cutoutCount} recorte(s)` : null,
        piece.sculptedSink?.active ? 'Pia esculpida' : null,
        piece.wetAreaRecess?.active
          ? `Rebaixo ${piece.wetAreaRecess.type === 'italiano' ? 'italiano' : 'americano'}`
          : null,
      ].filter(Boolean) as string[];

      return {
        ...piece,
        presentationArea: roundNumber(pieceTotals.totalArea, 4),
        presentationValue: Number((pieceBreakdown?.pieceSubtotalValue || 0).toFixed(2)),
        presentationMaterialName: pieceMaterial?.name || '',
        presentationMaterialDescription: pieceMaterial?.quoteDescription || '',
        presentationMaterialImageUrl: imageVariantUrl(pieceMaterial, 'original')
          || imageVariantUrl(pieceMaterial, 'medium')
          || imageVariantUrl(pieceMaterial, 'thumbnail')
          || pieceMaterial?.imageUrl
          || '',
        presentationMaterialCategory: pieceMaterial?.category || '',
        presentationMaterialLine: piece.materialLine || pieceMaterial?.materialLine || '',
        presentationMaterialType: piece.materialType || pieceMaterial?.materialType || '',
        presentationThicknessLabel: piece.thicknessLabel || pieceMaterial?.thicknessLabel || '',
        presentationTexture: piece.texture || pieceMaterial?.texture || '',
        presentationEnvironment: environment || '',
        presentationHighlights: highlights,
      };
    }),
    [
      basePiecePricingBreakdowns,
      calculatePieceArea,
      environment,
      materialId,
      originalPiecePricingBreakdowns,
      pieces,
    ],
  );
  const resolvedLaborPricing = quotePricingMode === 'cost'
    ? {amount: 0, source: 'disabled' as const, city: '', district: ''}
    : resolveLaborAmount(effectiveQuoteSettings.laborPricing, locationContext);
  const originalLaborCost = quotePricingMode === 'cost'
    ? 0
    : resolvedLaborPricing.source === 'linear'
      ? originalLinearLaborCost
      : resolvedLaborPricing.amount;
  const materialLossCost = includeMaterialLoss ? originalMaterialLossCost : 0;
  const laborCost = includeLabor ? originalLaborCost : 0;
  const cutoutsCost = includeCutouts ? originalCutoutsCost : 0;
  const sculptedLaborCost = includeSculptedSink ? originalSculptedLaborCost : 0;
  const deliveryResolution = resolveLocationAmount(effectiveQuoteSettings.deliveryPricing, locationContext);
  const originalDeliveryFee = Math.max(0, Number(deliveryResolution.amount) || 0);
  const deliveryFee = includeDelivery ? originalDeliveryFee : 0;
  const piecesSubtotal = basePiecePricingBreakdowns.reduce((acc, item, index) => {
    if ((pieces[index]?.pricingMode || 'automatic') === 'manual') {
      return acc + item.pieceSubtotalValue;
    }
    const chargedPieceSubtotal = (item.pieceSubtotalValue || 0)
      - (includeMaterialLoss ? 0 : (item.materialLossValue || 0))
      - (includeCutouts ? 0 : (item.calculatedCutoutValue || 0))
      - (includeSculptedSink ? 0 : (item.sinkAdditionalValue || 0))
      - (includeLabor && usesLinearLaborPricing ? 0 : (item.calculatedLaborValue || 0));
    return acc + chargedPieceSubtotal;
  }, 0);
  const externalLaborCost = usesLinearLaborPricing ? 0 : laborCost;
  const productionSubtotal = piecesSubtotal + externalLaborCost;
  const hasPieceScopedComplexity = pieces.some((piece) => typeof piece.complexityKey === 'string');
  const subtotalBeforeLegacyComplexity = productionSubtotal + deliveryFee;
  const complexityPercent = Number(resolvedComplexity?.percent || 0);
  const originalComplexityValue = hasPieceScopedComplexity ? pieceComplexityValue : subtotalBeforeLegacyComplexity * (complexityPercent / 100);
  const legacyComplexityValue = includeComplexity && !hasPieceScopedComplexity ? originalComplexityValue : 0;
  const complexityValue = includeComplexity ? roundNumber(pieceComplexityValue + legacyComplexityValue, 2) : 0;
  const subtotalBeforeAdjustment = subtotalBeforeLegacyComplexity + legacyComplexityValue;
  const normalizedEntryAmount = Math.min(Math.max(Number(entryAmount) || 0, 0), subtotalBeforeAdjustment);
  const selectedPaymentAdjustment = paymentMode === 'entry' ? remainingMethodAdjustment : totalMethodAdjustment;
  const normalizedCommissionPercent = Math.max(0, Number(commissionPercent) || 0);
  const normalizedNegotiationDiscountPercent = Math.max(0, Number(negotiationDiscountPercent) || 0);
  const normalizedRtPercent = Math.max(0, Number(rtPercent) || 0);
  const {
    adjustmentBase,
    adjustmentValue,
    paymentAdjustedTotal,
    commissionValue,
    negotiationDiscountValue,
    rtValue,
    totalPrice,
  } = calculateQuotePaymentTotals({
    subtotalBeforeAdjustment,
    paymentMode,
    entryAmount: normalizedEntryAmount,
    selectedAdjustment: selectedPaymentAdjustment,
    commissionPercent: normalizedCommissionPercent,
    negotiationDiscountPercent: normalizedNegotiationDiscountPercent,
    rtPercent: normalizedRtPercent,
  });
  const normalizedInstallmentCount = Math.max(1, Number(installmentCount) || 1);
  const installmentAmount = calculateQuoteInstallmentAmount({
    totalPrice,
    paymentMode,
    entryAmount: normalizedEntryAmount,
    installmentCount: normalizedInstallmentCount,
  });
  const finalPiecePricingBreakdowns = useMemo(
    () => buildPiecePricingBreakdowns({
      pieces,
      quoteCutouts: effectiveQuoteCutouts,
      totalQuotePrice: totalPrice,
      settings: effectiveQuoteSettings,
      clientLocation: {
        city: selectedClient?.city,
        address: selectedClient?.address,
      },
      calculatePieceArea,
      resolveMaterialPricePerM2: (piece) => materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey)?.pricePerM2 || 0,
      includeLabor: quotePricingMode !== 'cost' && usesLinearLaborPricing,
      includeMaterialLoss: quotePricingMode !== 'cost',
      includeCutouts,
      includeSculptedSink,
      includeComplexity,
      complexityOptions: activeComplexityOptions,
      resolveManualPiecePrice: (piece) => {
        if ((piece.pricingMode || 'automatic') !== 'manual') return undefined;
        const parsed = parseQuoteMaterialPriceInput(pieceManualPriceInputs[piece.id] || '');
        return parsed.status === 'valid' ? Number(parsed.value) : undefined;
      },
    }),
    [activeComplexityOptions, calculatePieceArea, effectiveQuoteCutouts, effectiveQuoteSettings, includeComplexity, includeCutouts, includeSculptedSink, materialId, pieceManualPriceInputs, pieces, quotePricingMode, selectedClient?.address, selectedClient?.city, totalPrice, usesLinearLaborPricing],
  );
  const applyDesiredTotalAdjustment = () => {
    const desiredTotalPrice = parseCurrencyInput(desiredTotalInput);
    if (!desiredTotalInput.trim()) {
      setDesiredTotalFeedback('');
      return;
    }

    const adjustment = calculateDesiredTotalAdjustment({
      desiredTotalPrice,
      paymentAdjustedTotal,
      commissionPercent: normalizedCommissionPercent,
    });

    if (!adjustment) {
      setDesiredTotalFeedback('Informe um total final válido para calcular o ajuste.');
      return;
    }

    setNegotiationDiscountPercent(adjustment.negotiationDiscountPercent ? String(adjustment.negotiationDiscountPercent) : '');
    setRtPercent(adjustment.rtPercent ? String(adjustment.rtPercent) : '');
    setDesiredTotalFeedback(
      adjustment.direction === 'none'
        ? 'Ajuste necessário: 0%.'
        : `Ajuste necessário: ${adjustment.calculatedPercent > 0 ? '+' : ''}${formatPercentage(Math.abs(adjustment.calculatedPercent))}.`,
    );
  };
  const materialBaseCost = pieceAreaDetails.reduce((acc, {totals, material}) => {
    const costPerM2 = Number(material?.baseCostPerM2 || 0);
    const lossArea = includeMaterialLoss ? Number(totals.lossArea || 0) : 0;
    return acc + ((totals.totalArea || 0) + lossArea) * costPerM2;
  }, 0);
  const estimatedOperationalCost = materialBaseCost + laborCost + deliveryFee + cutoutsCost + sculptedLaborCost;
  const estimatedProfitPercent = estimatedOperationalCost > 0
    ? ((totalPrice - estimatedOperationalCost) / estimatedOperationalCost) * 100
    : 0;
  const resolvedPaymentMethod = paymentMode === 'entry'
    ? [
      normalizedEntryAmount > 0 ? `Entrada de ${formatCurrency(normalizedEntryAmount)}` : 'Entrada',
      remainingPaymentMethod ? `restante em ${remainingPaymentMethod}` : 'restante a definir',
    ].join(' + ')
    : totalPaymentMethod;
  const materialStock = (materialIdToCheck: string, variantKey?: string) => {
    const stockItems = inventory.filter((item) => item.materialId === materialIdToCheck && (!variantKey || buildMaterialVariantKey(item) === variantKey));
    const physicalTotal = stockItems
      .filter((item) => !['usada', 'descarte'].includes(normalizeStockStatus(item.status)))
      .reduce((sum, item) => sum + getInventoryItemArea(item), 0);
    const manualReserved = stockItems
      .filter((item) => normalizeStockStatus(item.status) === 'reservada')
      .reduce((sum, item) => sum + getInventoryItemArea(item), 0);
    const quoteReserved = reservations
      .filter((reservation) =>
        reservation.materialId === materialIdToCheck &&
        reservation.quoteId !== id &&
        (!variantKey || (reservation.materialVariantKey || buildMaterialVariantKey(reservation)) === variantKey),
      )
      .reduce((sum, reservation) => sum + (reservation.area || 0), 0);
    const reserved = manualReserved + quoteReserved;
    return {total: physicalTotal, reserved, available: Math.max(0, physicalTotal - reserved)};
  };
  const materialLotInfo = (materialIdToCheck: string, requiredArea: number, variantKey?: string) => {
    const lots = inventory
      .filter((item) =>
        item.materialId === materialIdToCheck &&
        !['usada', 'descarte', 'reservada'].includes(normalizeStockStatus(item.status)) &&
        (!variantKey || buildMaterialVariantKey(item) === variantKey),
      )
      .map((item) => ({...item, availableArea: getInventoryItemArea(item)}))
      .sort((a, b) => b.availableArea - a.availableArea);
    const singleLot = lots.find((item) => item.availableArea >= requiredArea);
    return {
      lots,
      singleLot,
      canUseSingleLot: Boolean(singleLot),
      lotCountNeeded: singleLot ?1 : lots.reduce((acc, item) => {
        if (acc.area >= requiredArea) return acc;
        return {area: acc.area + item.availableArea, count: acc.count + 1};
      }, {area: 0, count: 0}).count,
    };
  };
  const activePieceIndex = pieceEditorPieceId ? pieces.findIndex((piece) => piece.id === pieceEditorPieceId) : -1;
  const activePiece = activePieceIndex >= 0 ? pieces[activePieceIndex] : null;
  const activePieceTotals = activePiece ? calculatePieceArea(activePiece) : null;
  const activePieceArea = activePieceTotals?.totalArea || 0;
  const activePieceStairDetails = activePiece ? calculateStairArea(activePiece) : null;
  const activePieceMaterial = activePiece ? materialWithQuotePrice(activePiece.materialId, activePiece.materialVariantKey) : null;
  const activePieceStock = activePiece?.materialId ? materialStock(activePiece.materialId, activePiece.materialVariantKey) : {available: 0};
  const activePieceDimensions = activePiece ? getPieceMajorMinorSides(activePiece) : {major: 0, minor: 0};
  const activePieceLongestSide = activePiece ? getEffectivePieceLongestSide(activePiece) : 0;
  const activePieceAreaMode = activePiece ? getPieceAreaMode(activePiece) : 'dimensions';
  const activePieceIsManualArea = activePieceAreaMode === 'manual';
  const activePieceDrawingArea = activePiece ? getStoredDrawingArea(activePiece) : 0;
  const activePieceManualFinalArea = activePiece ? getStoredManualFinalArea(activePiece) : 0;
  const activePieceUsesManualLongestSide = Number(activePiece?.manualLongestSide || 0) > 0;
  const activePiecePricingBreakdown = activePieceIndex >= 0 ? originalPiecePricingBreakdowns[activePieceIndex] : undefined;
  const activePieceScopedCutouts = activePiecePricingBreakdown?.cutoutRows || [];
  const activePieceScopedCutoutTotal = activePiecePricingBreakdown?.calculatedCutoutValue || 0;
  const activePieceHasMaterial = Boolean(activePiece?.materialId);
  const activePieceHasEnoughStock = activePieceHasMaterial && activePieceStock.available >= activePieceArea;
  const activePieceLotInfo = activePieceHasMaterial && activePiece
    ? materialLotInfo(activePiece.materialId, activePieceArea, activePiece.materialVariantKey)
    : null;
  const activePieceWorkflowStatus = normalizeQuoteStatus(activePiece?.pieceStatus || status);
  const filteredClients = clients.filter((client) => {
    const searchText = `${client.name} ${client.phone} ${client.email || ''} ${client.cpf || ''} ${client.rg || ''} ${client.address}`.toLowerCase();
    return searchText.includes(clientSearch.toLowerCase());
  });
  const filteredMaterialsForPiece = (pieceId: string) => materialVariantOptions.filter((material) => {
    const searchText = `${material.name} ${material.provider || ''} ${material.category || ''} ${material.materialLine || ''} ${material.materialType || ''} ${material.thicknessLabel || ''} ${material.texture || ''}`.toLowerCase();
    return searchText.includes((pieceMaterialSearch[pieceId] || '').toLowerCase());
  });

  const formatDateInput = (value: any) => {
    if (!value) return '';
    const date = typeof value.toDate === 'function' ?value.toDate() : value;
    if (!(date instanceof Date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getComparableTime = (value: unknown) => {
    if (!value) return null;
    const date =
      typeof (value as {toDate?: () => Date})?.toDate === 'function'
        ? (value as {toDate: () => Date}).toDate()
        : value instanceof Date
          ? value
          : new Date(String(value));

    const timestamp = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isNaN(timestamp) ? null : timestamp;
  };


  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    let subscribeTimer: number | undefined;
    let unsubClients = () => {};
    let unsubCondominiums = () => {};
    let unsubMaterials = () => {};
    let unsubInventory = () => {};
    let unsubReservations = () => {};
    let unsubFixtureCatalog = () => {};
    const auxiliaryLoadState = {
      clients: false,
      condominiums: false,
      materials: false,
      inventory: false,
      reservations: false,
      fixtureCatalog: false,
    };

    setLoading(true);
    setAuxiliaryDataReady(false);

    const markAuxiliaryLoaded = (key: keyof typeof auxiliaryLoadState) => {
      auxiliaryLoadState[key] = true;
      if (!cancelled && Object.values(auxiliaryLoadState).every(Boolean)) {
        setAuxiliaryDataReady(true);
      }
    };

    const subscribeAuxiliaryData = () => {
      if (cancelled) return;
      unsubClients = onSnapshot(query(
        collection(db, 'clients'),
        selectFields('name', 'phone', 'email', 'cpf', 'rg', 'address', 'streetAddress', 'city', 'condominiumId', 'condominiumName', 'neighborhood', 'zipCode', 'addressType', 'block', 'lot', 'tower', 'apartmentNumber'),
      ), (snap) => {
        setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
        markAuxiliaryLoaded('clients');
      }, (error) => {
        console.error('Erro ao carregar clientes do orcamento:', error);
      });

      unsubCondominiums = onSnapshot(query(
        collection(db, 'condominiums'),
        selectFields('name', 'city', 'allowedWeekdays', 'blockNationalHolidays', 'blockCityHolidays'),
      ), (snap) => {
        setCondominiums(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CondominiumRule)));
        markAuxiliaryLoaded('condominiums');
      }, (error) => {
        console.error('Erro ao carregar condominios do orcamento:', error);
      });

      unsubMaterials = onSnapshot(query(
        collection(db, 'materials'),
        selectFields('name', 'provider', 'category', 'materialLine', 'materialType', 'thicknessLabel', 'texture', 'imageUrl', 'thumbnailUrl', 'mediumUrl', 'originalUrl', 'pricePerM2', 'baseCostPerM2', 'baseMinimumSalePerM2', 'active'),
      ), (snap) => {
        setMaterials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
        markAuxiliaryLoaded('materials');
      }, (error) => {
        console.error('Erro ao carregar materiais do orcamento:', error);
      });

      unsubInventory = onSnapshot(query(
        collection(db, 'inventory'),
        selectFields('materialId', 'materialName', 'provider', 'category', 'materialLine', 'materialType', 'thicknessLabel', 'texture', 'area', 'cost', 'minimumSalePrice', 'status', 'photoUrl', 'thumbnailUrl', 'mediumUrl', 'originalUrl'),
      ), (snap) => {
        setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
        markAuxiliaryLoaded('inventory');
      }, (error) => {
        console.error('Erro ao carregar estoque do orcamento:', error);
      });

      unsubReservations = onSnapshot(query(
        collection(db, 'inventoryReservations'),
        selectFields('quoteId', 'materialId', 'materialVariantKey', 'materialLine', 'materialType', 'thicknessLabel', 'texture', 'provider', 'materialName', 'area', 'quoteStatus', 'clientName'),
      ), (snap) => {
        setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryReservation)));
        markAuxiliaryLoaded('reservations');
      }, (error) => {
        console.error('Erro ao carregar reservas do orcamento:', error);
      });
      unsubFixtureCatalog = onSnapshot(query(
        collection(db, 'fixtureCatalog'),
        selectFields('name', 'category', 'brand', 'model', 'width', 'depth', 'height', 'diameter', 'imageUrl', 'thumbnailUrl', 'mediumUrl', 'originalUrl', 'notes', 'active'),
      ), (snap) => {
        setFixtureCatalog(
          snap.docs.map((doc) => normalizeFixtureCatalogItem({ id: doc.id, ...doc.data() } as FixtureCatalogItem)),
        );
        markAuxiliaryLoaded('fixtureCatalog');
      }, (error) => {
        console.error('Erro ao carregar catalogo de acabamentos do orcamento:', error);
      });
    };

    const applyDraft = (draft: Record<string, unknown> | null) => {
      if (!draft) return;
      setClientId(String(draft.clientId || ''));
      setClientSearch(String(draft.clientSearch || ''));
      setEnvironment(String(draft.environment || ''));
      setResponsible(String(draft.responsible || ''));
      setMaterialId(String(draft.materialId || ''));
      setPaymentMethod(String(draft.paymentMethod || ''));
      setPaymentMode((draft.paymentMode as 'total' | 'entry') || 'total');
      setTotalPaymentMethod(String(draft.totalPaymentMethod || draft.paymentMethod || ''));
      setRemainingPaymentMethod(String(draft.remainingPaymentMethod || ''));
      setEntryAmount(draft.entryAmount == null ? '' : String(draft.entryAmount));
      setInstallmentCount(Math.max(1, Number(draft.installmentCount) || 1));
      setPaymentNotes(String(draft.paymentNotes || ''));
      setComplexityKey(String(draft.complexityKey || DEFAULT_QUOTE_COMPLEXITY_OPTIONS[0].key));
      setCommissionPercent(draft.commissionPercent == null ? '' : String(draft.commissionPercent));
      setNegotiationDiscountPercent(draft.negotiationDiscountPercent == null ? '' : String(draft.negotiationDiscountPercent));
      setRtPercent(draft.rtPercent == null ? '' : String(draft.rtPercent));
      setDeliveryDays(Number(draft.deliveryDays) || 15);
      setMeasurementDate(String(draft.measurementDate || ''));
      setDeliveryDate(String(draft.deliveryDate || ''));
      setValidityDays(Number(draft.validityDays) || 15);
      setCommercialNotes(String(draft.commercialNotes || ''));
      setStatus((draft.status as QuoteStatus) || QUOTE_STATUSES[0]);
      setOriginalStatus((draft.originalStatus as QuoteStatus) || (draft.status as QuoteStatus) || QUOTE_STATUSES[0]);
      const draftPieces = Array.isArray(draft.pieces) ? draft.pieces as QuotePiece[] : [];
      setPieces(draftPieces);
      setQuotePricingMode((draft.pricingMode as 'sale' | 'cost') || 'sale');
      setIncludeMaterialLoss(typeof draft.includeMaterialLoss === 'boolean' ? draft.includeMaterialLoss : ((draft.pricingMode as 'sale' | 'cost') || 'sale') !== 'cost');
      setIncludeCutouts(typeof draft.includeCutouts === 'boolean' ? draft.includeCutouts : true);
      setIncludeSculptedSink(typeof draft.includeSculptedSink === 'boolean' ? draft.includeSculptedSink : true);
      setIncludeLabor(typeof draft.includeLabor === 'boolean' ? draft.includeLabor : true);
      setIncludeDelivery(typeof draft.includeDelivery === 'boolean' ? draft.includeDelivery : true);
      setIncludeComplexity(typeof draft.includeComplexity === 'boolean' ? draft.includeComplexity : true);
      setMaterialCustomPriceInputs((draft.materialCustomPriceInputs as Record<string, string>) || inputValuesFromMaterialOverrides(draft.materialPriceOverrides as QuoteMaterialPriceOverride[]));
      setPieceManualPriceInputs((draft.pieceManualPriceInputs as Record<string, string>) || inputValuesFromPieceManualPrices(draftPieces));
      setCutouts((draft.cutouts as QuoteCutoutState) || EMPTY_QUOTE_CUTOUTS);
      setEmployeeAssignments(Array.isArray(draft.employeeAssignments) ? draft.employeeAssignments as EmployeeAssignment[] : []);
      setStatusHistory(Array.isArray(draft.statusHistory) ? draft.statusHistory as QuoteStatusHistory[] : []);
      setPieceMaterialSearch((draft.pieceMaterialSearch as Record<string, string>) || {});
      setPricingSnapshot(draft.pricingSnapshot ? cloneStoredQuotePricingSnapshot(draft.pricingSnapshot as Partial<QuotePricingSnapshot>) : null);
    };

    // If editing, fetch initial quote
    const fetchQuote = async () => {
      let persistedQuoteTime: number | null = null;
      if (id) {
        const docRef = doc(db, 'quotes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as unknown as Quote;
          persistedQuoteTime = getComparableTime(data.updatedAt || data.createdAt);
          setClientId(data.clientId);
          setClientSearch(data.clientName || '');
          setEnvironment(data.environment);
          setResponsible(data.responsible);
          setMaterialId(data.materialId);
          setPaymentMethod(data.paymentMethod);
          setPaymentMode(data.paymentMode || (data.remainingPaymentMethod || data.entryAmount ? 'entry' : 'total'));
          setTotalPaymentMethod(data.totalPaymentMethod || data.paymentMethod || '');
          setRemainingPaymentMethod(data.remainingPaymentMethod || '');
          setEntryAmount(data.entryAmount == null ? '' : String(data.entryAmount));
          setInstallmentCount(Math.max(1, Number(data.installmentCount) || 1));
          setPaymentNotes(data.paymentNotes || '');
          setComplexityKey(data.complexityKey || DEFAULT_QUOTE_COMPLEXITY_OPTIONS[0].key);
          setCommissionPercent(data.commissionPercent == null ? '' : String(data.commissionPercent));
          setNegotiationDiscountPercent(data.negotiationDiscountPercent == null ? '' : String(data.negotiationDiscountPercent));
          setRtPercent(data.rtPercent == null ? '' : String(data.rtPercent));
          setDeliveryDays(data.deliveryDays);
          setMeasurementDate(formatDateInput(data.measurementDate));
          setDeliveryDate(formatDateInput(data.deliveryDate));
          setValidityDays(15); // Adjust if needed
          setCommercialNotes(data.commercialNotes || '');
          setStatus(normalizeQuoteStatus(data.status));
          setOriginalStatus(normalizeQuoteStatus(data.status));
          setQuotePricingMode(data.pricingMode || 'sale');
          setIncludeMaterialLoss(typeof data.includeMaterialLoss === 'boolean' ? data.includeMaterialLoss : (data.pricingMode || 'sale') !== 'cost');
          setIncludeCutouts(typeof data.includeCutouts === 'boolean' ? data.includeCutouts : true);
          setIncludeSculptedSink(typeof data.includeSculptedSink === 'boolean' ? data.includeSculptedSink : true);
          setIncludeLabor(typeof data.includeLabor === 'boolean' ? data.includeLabor : true);
          setIncludeDelivery(typeof data.includeDelivery === 'boolean' ? data.includeDelivery : true);
          setIncludeComplexity(typeof data.includeComplexity === 'boolean' ? data.includeComplexity : true);
          setPricingSnapshot(data.pricingSnapshot ? cloneStoredQuotePricingSnapshot(data.pricingSnapshot as Partial<QuotePricingSnapshot>) : null);
          const loadedPieces = (data.pieces || []).map((piece) => ensurePieceWorkflowStatus({
            ...piece,
            materialId: piece.materialId || data.materialId || '',
          }, data.status));
          setPieces(loadedPieces);
          setMaterialCustomPriceInputs(inputValuesFromMaterialOverrides(data.materialPriceOverrides));
          setPieceManualPriceInputs(inputValuesFromPieceManualPrices(loadedPieces));
          setPieceMaterialSearch(loadedPieces.reduce((acc, piece) => {
            const material = materials.find((item) => item.id === piece.materialId);
            if (material) acc[piece.id] = material.name;
            return acc;
          }, {} as Record<string, string>));
          setEmployeeAssignments(data.employeeAssignments || []);
          setStatusHistory(data.statusHistory || []);
          setCutouts({
            ...EMPTY_QUOTE_CUTOUTS,
            ...(data.cutouts || {}),
          });
        }
      }
      const {data: draft, savedAt} = loadDraftMeta<Record<string, unknown>>(quoteDraftKey);
      const draftTime = getComparableTime(savedAt);
      const shouldApplyDraft = Boolean(
        draft && (
          !id ||
          persistedQuoteTime == null ||
          (draftTime != null && draftTime > persistedQuoteTime)
        ),
      );
      setQuoteDraftRecovered(shouldApplyDraft);
      setQuoteDraftSavedAt(shouldApplyDraft ?savedAt : null);
      if (shouldApplyDraft) {
        applyDraft(draft);
      }
      quoteDraftHydratedRef.current = true;
      setLoading(false);
    };

    void fetchQuote()
      .catch((error) => {
        console.error('Erro ao carregar orçamento:', error);
        setLoading(false);
      })
      .finally(() => {
        subscribeTimer = window.setTimeout(subscribeAuxiliaryData, 80);
      });

    return () => {
      cancelled = true;
      if (subscribeTimer) window.clearTimeout(subscribeTimer);
      unsubClients();
      unsubCondominiums();
      unsubMaterials();
      unsubInventory();
      unsubReservations();
      unsubFixtureCatalog();
    };
  }, [authLoading, id, quoteDraftKey]);

  useEffect(() => {
    if (!id && !responsible && currentUserName !== 'Usuário') {
      setResponsible(currentUserName);
    }
  }, [currentUserName, id, responsible]);

  useEffect(() => {
    if (!activeComplexityOptions.length) return;
    if (activeComplexityOptions.some((option) => option.key === complexityKey)) return;
    setComplexityKey(activeComplexityOptions[0].key);
  }, [activeComplexityOptions, complexityKey]);

  useEffect(() => {
    syncPieceMeasureInputs(pieces);
  }, [activePieceMeasureInput, pieces]);

  useEffect(() => {
    if (paymentMode === 'total') {
      setPaymentMethod(totalPaymentMethod);
      return;
    }

    setPaymentMethod([
      normalizedEntryAmount > 0 ? `Entrada de ${formatCurrency(normalizedEntryAmount)}` : 'Entrada',
      remainingPaymentMethod ? `restante em ${remainingPaymentMethod}` : 'restante a definir',
    ].join(' + '));
  }, [normalizedEntryAmount, paymentMode, remainingPaymentMethod, totalPaymentMethod]);

  useEffect(() => {
    const referenceMethod = paymentMode === 'entry' ? remainingPaymentMethod : totalPaymentMethod;
    const inferredInstallments = parseInstallmentCountFromMethod(referenceMethod);
    if (!referenceMethod || inferredInstallments <= 1) return;
    setInstallmentCount((current) => current > 1 ? current : inferredInstallments);
  }, [paymentMode, remainingPaymentMethod, totalPaymentMethod]);

  useEffect(() => {
    if (loading || !quoteDraftHydratedRef.current) return;

    const savedAt = saveDraft(quoteDraftKey, {
      clientId,
      clientSearch,
      environment,
      responsible,
      materialId,
      paymentMethod,
      paymentMode,
      totalPaymentMethod,
      remainingPaymentMethod,
      entryAmount,
      installmentCount,
      paymentNotes,
      complexityKey,
      commissionPercent,
      negotiationDiscountPercent,
      rtPercent,
      deliveryDays,
      measurementDate,
      deliveryDate,
      validityDays,
      pricingMode: quotePricingMode,
      includeMaterialLoss,
      includeCutouts,
      includeSculptedSink,
      includeLabor,
      includeDelivery,
      includeComplexity,
      pricingSnapshot,
      commercialNotes,
      status,
      originalStatus,
      pieces,
      cutouts: effectiveQuoteCutouts,
      materialCustomPriceInputs,
      pieceManualPriceInputs,
      employeeAssignments,
      statusHistory,
      pieceMaterialSearch,
    });
    if (savedAt) setQuoteDraftSavedAt(savedAt);
  }, [clientId, clientSearch, commercialNotes, commissionPercent, complexityKey, cutouts, deliveryDate, deliveryDays, employeeAssignments, entryAmount, environment, includeComplexity, includeCutouts, includeDelivery, includeLabor, includeMaterialLoss, includeSculptedSink, installmentCount, loading, materialCustomPriceInputs, materialId, measurementDate, negotiationDiscountPercent, originalStatus, paymentMethod, paymentMode, paymentNotes, pieceManualPriceInputs, pieceMaterialSearch, pieces, pricingSnapshot, quoteDraftKey, quotePricingMode, remainingPaymentMethod, responsible, rtPercent, status, statusHistory, totalPaymentMethod, validityDays]);

  const clearQuoteDraftState = () => {
    clearDraft(quoteDraftKey);
    setQuoteDraftRecovered(false);
    setQuoteDraftSavedAt(null);
  };

  const updateMaterialCustomPriceInput = (key: string, value: string) => {
    setMaterialCustomPriceInputs((current) => ({...current, [key]: value}));
  };

  const formatMaterialCustomPriceInput = (key: string) => {
    setMaterialCustomPriceInputs((current) => {
      const parsed = parseQuoteMaterialPriceInput(current[key] || '');
      if (parsed.status !== 'valid' || typeof parsed.value !== 'number') return current;
      return {...current, [key]: formatPriceInputValue(parsed.value)};
    });
  };

  const updatePieceManualPriceInput = (pieceId: string, value: string) => {
    setPieceManualPriceInputs((current) => ({...current, [pieceId]: value}));
  };

  const formatPieceManualPriceInput = (pieceId: string) => {
    setPieceManualPriceInputs((current) => {
      const parsed = parseQuoteMaterialPriceInput(current[pieceId] || '');
      if (parsed.status !== 'valid' || typeof parsed.value !== 'number') return current;
      return {...current, [pieceId]: formatPriceInputValue(parsed.value)};
    });
  };

  const syncPieceMeasureInputs = (sourcePieces: QuotePiece[]) => {
    setPieceMeasureInputs((current) => {
      const next = {...current};
      sourcePieces.forEach((piece) => {
        (['length', 'width'] as const).forEach((field) => {
          const key = pieceMeasureInputKey(piece.id, field);
          if (activePieceMeasureInput === key) return;
          next[key] = formatMeasureInput(piece[field] || 0);
        });
        const manualAreaKey = pieceManualAreaInputKey(piece.id);
        if (activePieceMeasureInput !== manualAreaKey) {
          next[manualAreaKey] = piece.manualFinalArea == null ? '' : formatMeasureInput(piece.manualFinalArea);
        }
        const manualLongestSideKey = pieceManualLongestSideInputKey(piece.id);
        if (activePieceMeasureInput !== manualLongestSideKey) {
          next[manualLongestSideKey] = piece.manualLongestSide == null ? '' : formatMeasureInput(piece.manualLongestSide);
        }
      });
      return next;
    });
  };

  const handlePieceMeasureInputFocus = (pieceId: string, field: 'length' | 'width', value: number) => {
    const key = pieceMeasureInputKey(pieceId, field);
    setActivePieceMeasureInput(key);
    setPieceMeasureInputs((current) => ({...current, [key]: formatEditableMeasureValue(value || 0)}));
  };

  const handlePieceMeasureInputChange = (pieceId: string, field: 'length' | 'width', value: string) => {
    const key = pieceMeasureInputKey(pieceId, field);
    setPieceMeasureInputs((current) => ({...current, [key]: value}));
    const parsedValue = parseMeasureInput(value);
    updatePiece(pieceId, {
      [field]: parsedValue,
      manualArea: undefined,
    } as Partial<QuotePiece>);
  };

  const handlePieceMeasureInputBlur = (piece: QuotePiece, field: 'length' | 'width') => {
    const key = pieceMeasureInputKey(piece.id, field);
    const rawValue = pieceMeasureInputs[key] || '';
    const parsedValue = parseMeasureInput(rawValue);
    updatePiece(piece.id, {
      [field]: parsedValue,
      manualArea: undefined,
    } as Partial<QuotePiece>);
    setPieceMeasureInputs((current) => ({...current, [key]: formatMeasureInput(parsedValue)}));
    setActivePieceMeasureInput((current) => (current === key ? null : current));
  };

  const handlePieceManualAreaFocus = (pieceId: string, value?: number) => {
    const key = pieceManualAreaInputKey(pieceId);
    setActivePieceMeasureInput(key);
    setPieceMeasureInputs((current) => ({...current, [key]: value == null ? '' : formatEditableMeasureValue(value)}));
  };

  const handlePieceManualAreaChange = (pieceId: string, value: string) => {
    const key = pieceManualAreaInputKey(pieceId);
    setPieceMeasureInputs((current) => ({...current, [key]: value}));
    const parsedValue = parseMeasureInput(value);
    updatePiece(pieceId, {
      manualFinalArea: Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined,
    });
  };

  const handlePieceManualAreaBlur = (piece: QuotePiece) => {
    const key = pieceManualAreaInputKey(piece.id);
    const rawValue = pieceMeasureInputs[key] || '';
    const parsedValue = parseMeasureInput(rawValue);
    const normalizedValue = Number.isFinite(parsedValue) && parsedValue > 0 ? roundNumber(parsedValue, 4) : undefined;
    updatePiece(piece.id, {manualFinalArea: normalizedValue});
    setPieceMeasureInputs((current) => ({...current, [key]: normalizedValue == null ? '' : formatMeasureInput(normalizedValue)}));
    setActivePieceMeasureInput((current) => (current === key ? null : current));
  };

  const handlePieceManualLongestSideFocus = (pieceId: string, value?: number) => {
    const key = pieceManualLongestSideInputKey(pieceId);
    setActivePieceMeasureInput(key);
    setPieceMeasureInputs((current) => ({...current, [key]: value == null ? '' : formatEditableMeasureValue(value)}));
  };

  const handlePieceManualLongestSideChange = (pieceId: string, value: string) => {
    const key = pieceManualLongestSideInputKey(pieceId);
    setPieceMeasureInputs((current) => ({...current, [key]: value}));
    const parsedValue = parseMeasureInput(value);
    updatePiece(pieceId, {
      manualLongestSide: Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined,
    });
  };

  const handlePieceManualLongestSideBlur = (piece: QuotePiece) => {
    const key = pieceManualLongestSideInputKey(piece.id);
    const rawValue = pieceMeasureInputs[key] || '';
    const parsedValue = parseMeasureInput(rawValue);
    const normalizedValue = Number.isFinite(parsedValue) && parsedValue > 0 ? roundNumber(parsedValue, 3) : undefined;
    updatePiece(piece.id, {manualLongestSide: normalizedValue});
    setPieceMeasureInputs((current) => ({...current, [key]: normalizedValue == null ? '' : formatMeasureInput(normalizedValue)}));
    setActivePieceMeasureInput((current) => (current === key ? null : current));
  };

  useEffect(() => {
    if (clientId && !clientSearch) {
      const found = clients.find((client) => client.id === clientId);
      if (found) setClientSearch(found.name);
    }
  }, [clientId, clientSearch, clients]);

  useEffect(() => {
    if (!showDrawing) return;

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [showDrawing]);

  useEffect(() => {
    setPieceMaterialSearch((current) => {
      const next = {...current};
      pieces.forEach((piece) => {
        if (!piece.materialId || next[piece.id]) return;
        const found = materials.find((material) => material.id === piece.materialId);
        if (found) next[piece.id] = found.name;
      });
      return next;
    });
  }, [materials, pieces]);

  const defaultStairConfig = (): QuotePiece['stair'] => ({
    active: true,
    unit: 'cm',
    stepCount: 0,
    stepWidth: 0,
    treadDepth: 0,
    riserHeight: 0,
    landingCount: 0,
    landingWidth: 0,
    landingDepth: 0,
    leftBaseboard: false,
    rightBaseboard: false,
    baseboardHeight: 10,
  });

  const buildNewPiece = (asStair = false, overrides: Partial<QuotePiece> = {}): QuotePiece => {
    const newPiece: QuotePiece = {
      id: Math.random().toString(36).substr(2, 9),
      name: getPieceDefaultName(asStair ? 'escada' : undefined, pieces),
      kind: asStair ? 'escada' : undefined,
      pieceStatus: status,
      pricingMode: 'automatic',
      complexityKey: activeComplexityOptions.find((option) => Number(option.percent || 0) === 0)?.key || DEFAULT_QUOTE_COMPLEXITY_OPTIONS[0].key,
      areaMode: 'dimensions',
      materialId: '',
      unit: 'cm',
      width: 0,
      length: 0,
      area: 0,
      manualFinalArea: undefined,
      sides: [],
      notes: '',
      sculptedSink: {
        active: false,
        drainType: 'Válvula oculta',
        quantity: 1,
        width: 0,
        depth: 0,
        height: 0,
        unit: 'cm',
        calculatedArea: 0,
        calculatedValue: 0
      },
      stair: asStair ?defaultStairConfig() : {active: false, unit: 'cm', stepCount: 0, stepWidth: 0, treadDepth: 0, riserHeight: 0, landingCount: 0, landingWidth: 0, landingDepth: 0, leftBaseboard: false, rightBaseboard: false, baseboardHeight: 10},
      ...overrides,
    };
    return ensurePieceWorkflowStatus(newPiece, status);
  };

  const addPiece = (asStair = false) => {
    const newPiece = buildNewPiece(asStair);
    setPieces([...pieces, newPiece]);
  };

  const openPieceEditor = (
    pieceId: string,
    options?: {
      isNew?: boolean;
      mode?: PieceEditorMode;
      pieceSnapshot?: QuotePiece;
    },
  ) => {
    const piece = options?.pieceSnapshot || pieces.find((item) => item.id === pieceId);
    if (!piece) return;
    setPieceEditorPieceId(pieceId);
    setPieceEditorIsNew(Boolean(options?.isNew));
    setPieceEditorMode(options && 'mode' in options ? options.mode ?? null : inferPieceEditorMode(piece));
    setPieceEditorRestoreSnapshot(
      options?.isNew
        ? null
        : {
            piece: clonePieceForEditor(piece),
            manualPriceInput: pieceManualPriceInputs[pieceId],
            materialSearch: pieceMaterialSearch[pieceId],
          },
    );
    setPieceMaterialPickerOpen((current) => ({...current, [pieceId]: false}));
    setPieceEditorOpen(true);
  };

  const closePieceEditor = () => {
    setPieceEditorOpen(false);
    setPieceEditorPieceId(null);
    setPieceEditorMode(null);
    setPieceEditorIsNew(false);
    setPieceEditorRestoreSnapshot(null);
    setPieceMaterialPickerOpen({});
  };

  const cancelPieceEditor = () => {
    if (!pieceEditorPieceId) {
      closePieceEditor();
      return;
    }

    if (pieceEditorIsNew) {
      removePiece(pieceEditorPieceId);
      closePieceEditor();
      return;
    }

    if (pieceEditorRestoreSnapshot) {
      setPieces((current) => current.map((piece) => (
        piece.id === pieceEditorPieceId ? ensurePieceWorkflowStatus(clonePieceForEditor(pieceEditorRestoreSnapshot.piece), status) : piece
      )));
      setPieceManualPriceInputs((current) => {
        const next = {...current};
        if (pieceEditorRestoreSnapshot.manualPriceInput) next[pieceEditorPieceId] = pieceEditorRestoreSnapshot.manualPriceInput;
        else delete next[pieceEditorPieceId];
        return next;
      });
      setPieceMaterialSearch((current) => {
        const next = {...current};
        if (pieceEditorRestoreSnapshot.materialSearch) next[pieceEditorPieceId] = pieceEditorRestoreSnapshot.materialSearch;
        else delete next[pieceEditorPieceId];
        return next;
      });
    }

    closePieceEditor();
  };

  const savePieceEditor = () => {
    if (!pieceEditorPieceId) return;
    setPieceMaterialPickerOpen((current) => ({...current, [pieceEditorPieceId]: false}));
    closePieceEditor();
  };

  const startAddingPiece = () => {
    const newPiece = buildNewPiece(false);
    setPieces((current) => [...current, newPiece]);
    openPieceEditor(newPiece.id, {isNew: true, mode: null, pieceSnapshot: newPiece});
  };

  const startAddingStair = () => {
    const newPiece = buildNewPiece(true);
    setPieces((current) => [...current, newPiece]);
    openPieceEditor(newPiece.id, {isNew: true, mode: 'stair', pieceSnapshot: newPiece});
  };

  const applyInitialPieceKind = (kind: PieceKindChoice) => {
    if (!pieceEditorPieceId) return;
    const currentPiece = pieces.find((piece) => piece.id === pieceEditorPieceId);
    if (!currentPiece) return;

    const nextName = pieceEditorIsNew
      ? getPieceDefaultName(kind, pieces.filter((piece) => piece.id !== pieceEditorPieceId))
      : currentPiece.name;

    if (kind === 'escada') {
      updatePiece(pieceEditorPieceId, {
        kind,
        name: nextName,
        areaMode: 'dimensions',
        stair: {...defaultStairConfig(), ...(currentPiece.stair || {}), active: true},
        sculptedSink: {...currentPiece.sculptedSink, active: false} as any,
        wetAreaRecess: {...currentPiece.wetAreaRecess, active: false} as any,
      });
      setPieceEditorMode('stair');
      return;
    }

    updatePiece(pieceEditorPieceId, {
      kind,
      name: nextName,
      stair: currentPiece.stair ? {...currentPiece.stair, active: false} : currentPiece.stair,
    });
  };

  const applyPieceEditorMode = (mode: Exclude<PieceEditorMode, null>) => {
    if (!pieceEditorPieceId) return;
    const currentPiece = pieces.find((piece) => piece.id === pieceEditorPieceId);
    if (!currentPiece) return;

    if (currentPiece.kind === 'escada') {
      updatePiece(pieceEditorPieceId, {
        kind: 'escada',
        stair: {...defaultStairConfig(), ...(currentPiece.stair || {}), active: true},
        sculptedSink: {...currentPiece.sculptedSink, active: false} as any,
        wetAreaRecess: {...currentPiece.wetAreaRecess, active: false} as any,
      });
      setPieceEditorMode('stair');
      return;
    }

    setPieceEditorMode(mode);
    if (mode === 'draw') {
      updatePiece(pieceEditorPieceId, {
        areaMode: 'dimensions',
        stair: currentPiece.stair ? {...currentPiece.stair, active: false} : currentPiece.stair,
      });
      return;
    }
    if (mode === 'manual') {
      updatePiece(pieceEditorPieceId, {
        areaMode: 'manual',
        stair: currentPiece.stair ? {...currentPiece.stair, active: false} : currentPiece.stair,
      });
    }
  };

  const countCutouts = (drawingCutouts?: QuotePiece['cutouts']): QuoteCutoutState => {
    const counts: QuoteCutoutState = {...EMPTY_QUOTE_CUTOUTS};
    (drawingCutouts || []).forEach((item) => {
      if (item.type === 'cooktop') counts.cooktop += 1;
      if (item.type === 'torneira') counts.faucetHole += 1;
      if (item.type === 'cuba') counts.sinkUnder += 1;
      if (item.type === 'lixeira') counts.trashBinCutout += 1;
      if (item.type === 'torre_tomada') counts.popUpTowerCutout += 1;
    });
    return counts;
  };

  const applyCutoutDiff = (previousCutouts?: QuotePiece['cutouts'], nextCutouts?: QuotePiece['cutouts']) => {
    const previous = countCutouts(previousCutouts);
    const next = countCutouts(nextCutouts);
    setCutouts((current) => ({
      cooktop: Math.max(0, current.cooktop + (next.cooktop - previous.cooktop)),
      sinkUnder: Math.max(0, current.sinkUnder + (next.sinkUnder - previous.sinkUnder)),
      sinkOver: current.sinkOver,
      faucetHole: Math.max(0, current.faucetHole + (next.faucetHole - previous.faucetHole)),
      trashBinCutout: Math.max(0, current.trashBinCutout + (next.trashBinCutout - previous.trashBinCutout)),
      popUpTowerCutout: Math.max(0, current.popUpTowerCutout + (next.popUpTowerCutout - previous.popUpTowerCutout)),
      wetAreaAmericanRecess: current.wetAreaAmericanRecess,
      wetAreaItalianRecess: current.wetAreaItalianRecess,
    }));
  };

  const cutoutCatalog = useMemo(
    () => buildCutoutCatalog(effectiveQuoteSettings),
    [effectiveQuoteSettings],
  );

  const updatePieceManualCutoutQuantity = (
    piece: QuotePiece,
    cutoutType: PieceScopedCutoutType,
    nextQuantity: number,
  ) => {
    updatePiece(piece.id, {
      manualCutouts: updatePieceManualCutouts(piece, cutoutType, nextQuantity),
    });
  };

  const removePiece = (id: string) => {
    const removedPiece = pieces.find((piece) => piece.id === id);
    if (removedPiece?.cutouts?.length) {
      applyCutoutDiff(removedPiece.cutouts, []);
    }
    setPieces((current) => current.filter((piece) => piece.id !== id));
    setPieceManualPriceInputs((current) => {
      const next = {...current};
      delete next[id];
      return next;
    });
    setPieceMeasureInputs((current) => {
      const next = {...current};
      delete next[pieceMeasureInputKey(id, 'length')];
      delete next[pieceMeasureInputKey(id, 'width')];
      delete next[pieceManualAreaInputKey(id)];
      delete next[pieceManualLongestSideInputKey(id)];
      return next;
    });
    setPieceMaterialSearch((current) => {
      const next = {...current};
      delete next[id];
      return next;
    });
    setPieceMaterialPickerOpen((current) => {
      const next = {...current};
      delete next[id];
      return next;
    });
  };

  const updatePiece = (id: string, data: Partial<QuotePiece>) => {
    setPieces(pieces.map((piece) => {
      if (piece.id !== id) return piece;
      return ensurePieceWorkflowStatus({...piece, ...data}, status);
    }));
  };

  const applyDrawingToPiece = (
    pieceId: string,
    drawingData: {
      json: string;
      area: number;
      previewUrl: string;
      sides: PieceSide[];
      largestSide: number;
      smallestSide: number;
      cutouts: QuotePiece['cutouts'];
    },
  ) => {
    const currentPiece = pieces.find((piece) => piece.id === pieceId);
    const fixturePatch = fixturePatchFromDrawingCutouts(drawingData.cutouts);
    applyCutoutDiff(currentPiece?.cutouts, drawingData.cutouts);
    const dimensionCandidates = [Number(drawingData.largestSide || 0), Number(drawingData.smallestSide || 0)].filter((value) => value > 0);
    const major = dimensionCandidates.length ? Math.max(...dimensionCandidates) : 0;
    const minor = dimensionCandidates.length ? Math.min(...dimensionCandidates) : 0;
    updatePiece(pieceId, {
      drawingJson: drawingData.json,
      manualArea: drawingData.area,
      previewUrl: drawingData.previewUrl,
      sides: drawingData.sides,
      largestSide: drawingData.largestSide,
      smallestSide: drawingData.smallestSide,
      length: major || currentPiece?.length || 0,
      width: minor || currentPiece?.width || major || 0,
      cutouts: drawingData.cutouts,
      selectedFixtureIds: {
        ...currentPiece?.selectedFixtureIds,
        ...fixturePatch.selectedFixtureIds,
      },
      purchasedFixtures: {
        ...currentPiece?.purchasedFixtures,
        ...fixturePatch.purchasedFixtures,
      },
    });
  };

  const saveDrawingAndContinue = (
    sourcePieceId: string,
    drawingData: {
      json: string;
      area: number;
      previewUrl: string;
      sides: PieceSide[];
      largestSide: number;
      smallestSide: number;
      cutouts: QuotePiece['cutouts'];
    },
  ) => {
    applyDrawingToPiece(sourcePieceId, drawingData);
  };

  const calculateWetAreaRecessArea = (piece: QuotePiece) => {
    const recess = piece.wetAreaRecess;
    if (!recess?.active) return 0;
    const factor = recess.unit === 'cm' ?100 : 1;
    return Math.max(0, (recess.width || 0) / factor) * Math.max(0, (recess.depth || 0) / factor);
  };

  const updateFirstPieceFixture = (fixtureKey: 'trashBin' | 'popUpTower', field: 'brand' | 'model' | 'diameter' | 'width' | 'depth' | 'height' | 'notes', value: string | number | undefined) => {
    if (!pieces.length) return;
    const firstPiece = pieces[0];
    const currentFixture = firstPiece.purchasedFixtures?.[fixtureKey] || {};
    updatePiece(firstPiece.id, {
      purchasedFixtures: {
        ...firstPiece.purchasedFixtures,
        [fixtureKey]: {
          ...currentFixture,
          [field]: value,
        },
      },
    });
  };

  const fixturesByCategory = (category: FixtureCategory) =>
    fixtureCatalog.filter((item) => item.active && item.category === category);

  const cutoutFieldByFixtureKey: Record<'cooktop' | 'sink' | 'faucet' | 'popUpTower' | 'trashBin', keyof QuoteCutoutState> = {
    cooktop: 'cooktop',
    sink: 'sinkUnder',
    faucet: 'faucetHole',
    popUpTower: 'popUpTowerCutout',
    trashBin: 'trashBinCutout',
  };

  const fixtureKeyByCutoutType: Record<string, 'cooktop' | 'sink' | 'faucet' | 'popUpTower' | 'trashBin'> = {
    cooktop: 'cooktop',
    cuba: 'sink',
    torneira: 'faucet',
    lixeira: 'trashBin',
    torre_tomada: 'popUpTower',
  };
  const cutoutCountByFixtureKey = (fixtureKey: 'cooktop' | 'sink' | 'faucet' | 'popUpTower' | 'trashBin') =>
    Number(cutouts[cutoutFieldByFixtureKey[fixtureKey]] || 0);

  const drawingFixtureIdForKey = (fixtureKey: 'cooktop' | 'sink' | 'faucet' | 'popUpTower' | 'trashBin') => {
    for (const piece of pieces) {
      const match = piece.cutouts?.find((cutout) => fixtureKeyByCutoutType[cutout.type] === fixtureKey && cutout.fixtureId);
      if (match?.fixtureId) return match.fixtureId;
    }
    return '';
  };

  const fixturePatchFromDrawingCutouts = (drawingCutouts?: QuotePiece['cutouts']) => {
    const selectedFixtureIds: QuotePiece['selectedFixtureIds'] = {};
    const purchasedFixtures: QuotePiece['purchasedFixtures'] = {};
    (drawingCutouts || []).forEach((cutout) => {
      const fixtureKey = fixtureKeyByCutoutType[cutout.type];
      if (!fixtureKey || !cutout.fixtureId || selectedFixtureIds?.[fixtureKey]) return;
      const selected = fixtureCatalog.find((item) => item.id === cutout.fixtureId);
      selectedFixtureIds[fixtureKey] = cutout.fixtureId;
      if (selected) {
        purchasedFixtures[fixtureKey] = {
          brand: selected.brand,
          model: selected.model,
          width: selected.width,
          depth: selected.depth,
          height: selected.height,
          diameter: selected.diameter,
          notes: selected.notes,
        };
      }
    });
    return {selectedFixtureIds, purchasedFixtures};
  };

  const selectCatalogFixtureForFirstPiece = (
    fixtureKey: 'cooktop' | 'sink' | 'faucet' | 'popUpTower' | 'trashBin',
    fixtureId: string,
  ) => {
    if (!pieces.length) return;
    const cutoutField = cutoutFieldByFixtureKey[fixtureKey];
    setCutouts((current) => ({
      ...current,
      [cutoutField]: fixtureId ? 1 : 0,
      ...(fixtureKey === 'sink' ? {sinkOver: 0} : {}),
    }));
    const firstPiece = pieces[0];
    const selected = fixtureCatalog.find((item) => item.id === fixtureId);
    updatePiece(firstPiece.id, {
      selectedFixtureIds: {
        ...firstPiece.selectedFixtureIds,
        [fixtureKey]: fixtureId || undefined,
      },
      purchasedFixtures: {
        ...firstPiece.purchasedFixtures,
        [fixtureKey]: selected
          ?{
              brand: selected.brand,
              model: selected.model,
              width: selected.width,
              depth: selected.depth,
              height: selected.height,
              diameter: selected.diameter,
              notes: selected.notes,
            }
          : undefined,
      },
    });
  };

  const sideOptionsForPiece = (piece: QuotePiece) => [
    { value: 'top', label: `Comprimento superior (${formatCentimeters(piece.length || 0)})`, length: piece.length },
    { value: 'bottom', label: `Comprimento inferior (${formatCentimeters(piece.length || 0)})`, length: piece.length },
    { value: 'left', label: `Largura esquerda (${formatCentimeters(piece.width || 0)})`, length: piece.width },
    { value: 'right', label: `Largura direita (${formatCentimeters(piece.width || 0)})`, length: piece.width },
  ];
  const sideDimensionLabel = (type?: PieceSide['type']) =>
    ['frontao', 'saia', 'pe'].includes(String(type)) ? 'Altura' : 'Profundidade';

  const addSide = (pieceId: string, type: PieceSide['type']) => {
    setPieces(pieces.map(p => {
      if (p.id !== pieceId) return p;
      const firstSide = sideOptionsForPiece(p)[0];
      const defaultHeight =
        type === 'frontao' ? settings.defaultFrontonHeight :
        type === 'saia' ? settings.defaultSkirtHeight :
        settings.defaultTurnHeight;
      const newSide: PieceSide = {
        type,
        side: firstSide.value,
        sideLabel: firstSide.label,
        length: firstSide.length,
        height: defaultHeight,
        quantity: 1,
        area: 0
      };
      return { ...p, sides: [...p.sides, newSide] };
    }));
  };

  const persistQuote = async ({
    navigateAfterPersist = false,
    appendStatusHistory = true,
    logEvent = true,
    showAlertOnError = true,
  }: {
    navigateAfterPersist?: boolean;
    appendStatusHistory?: boolean;
    logEvent?: boolean;
    showAlertOnError?: boolean;
  } = {}) => {
    const failPersist = (message: string) => {
      if (showAlertOnError) {
        window.alert(message);
      }
      throw new Error(message);
    };
    const normalizedTotalArea = roundNumber(totalArea);
    const normalizedTotalPrice = Number(totalPrice.toFixed(2));
    const validationError = validateQuoteBeforeSave({
      clientId,
      pieces,
      selectedClient,
      totalArea: normalizedTotalArea,
      totalPrice: normalizedTotalPrice,
      calculatePieceArea,
    });
    if (validationError) {
      failPersist(String(validationError));
    }
    if (quoteMaterialPriceError) {
      failPersist(String(quoteMaterialPriceError));
    }
    if (pieceManualPriceError) {
      failPersist(String(pieceManualPriceError));
    }
    setSaving(true);
    const firstAssigned = employeeAssignments.find((item) => item.employeeId);
    const primaryMaterialId = pieces[0]?.materialId || materialId || '';
    const primaryMaterialVariantKey = pieces[0]?.materialVariantKey;
    const primaryMaterial = materialWithQuotePrice(primaryMaterialId, primaryMaterialVariantKey);
    const piecesWithStatus = piecesWithPresentationSnapshot.map((piece) => {
      const parsedManualPrice = parseQuoteMaterialPriceInput(pieceManualPriceInputs[piece.id] || '');
      return ensurePieceWorkflowStatus({
        ...piece,
        pricingMode: piece.pricingMode || 'automatic',
        manualPrice:
          (piece.pricingMode || 'automatic') === 'manual' && parsedManualPrice.status === 'valid'
            ? Number(parsedManualPrice.value)
            : undefined,
      }, status);
    });
    const materialPriceOverrides: QuoteMaterialPriceOverride[] = quoteMaterialPriceRows
      .filter((row) => !row.error && typeof row.customPricePerM2 === 'number')
      .map((row) => ({
        materialId: row.materialId,
        materialVariantKey: row.materialVariantKey,
        materialName: row.name,
        pricePerM2: Number(row.customPricePerM2?.toFixed(2) || 0),
        defaultPricePerM2: Number(row.defaultPricePerM2.toFixed(2)),
        minimumSalePerM2: Number(row.minimumSalePerM2.toFixed(2)),
        updatedAt: Timestamp.now(),
      }));
    const nextStatusHistory = appendStatusHistory
      ? [...statusHistory, {
        status,
        changedAt: Timestamp.now(),
        changedByUid: appUid || '',
        changedByName: currentUserName,
        responsibleEmployeeId: firstAssigned?.employeeId || '',
        responsibleEmployeeName: firstAssigned?.employeeName || '',
      }]
      : statusHistory;

    const quoteData: Partial<Quote> = {
      clientId,
      clientName: selectedClient?.name || '',
      phone: selectedClient?.phone || '',
      address: selectedClient?.address || '',
      environment,
      responsible,
      responsibleUserUid: appUid || '',
      responsibleUserName: currentUserName,
      materialId: primaryMaterialId,
      materialName: primaryMaterial?.name || '',
      paymentMethod: resolvedPaymentMethod,
      paymentMode,
      totalPaymentMethod,
      remainingPaymentMethod,
      entryAmount: normalizedEntryAmount,
      installmentCount: normalizedInstallmentCount,
      installmentAmount: Number(installmentAmount.toFixed(2)),
      paymentNotes,
      commissionPercent: normalizedCommissionPercent,
      negotiationDiscountPercent: normalizedNegotiationDiscountPercent,
      rtPercent: normalizedRtPercent,
      deliveryDays,
      validityDate: Timestamp.fromDate(new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)),
      commercialNotes,
      status,
      totalArea: normalizedTotalArea,
      totalPrice: normalizedTotalPrice,
      laborCharge: Number(originalLaborCost.toFixed(2)),
      deliveryFee: Number(deliveryFee.toFixed(2)),
      complexityKey: hasPieceScopedComplexity ? '' : resolvedComplexity.key,
      complexityLabel: hasPieceScopedComplexity ? '' : resolvedComplexity.label,
      complexityPercent: hasPieceScopedComplexity ? 0 : Number(complexityPercent.toFixed(2)),
      pricingMode: quotePricingMode,
      includeMaterialLoss,
      includeCutouts,
      includeSculptedSink,
      includeLabor,
      includeDelivery,
      includeComplexity,
      pricingSnapshot: buildQuotePricingSnapshot(effectiveQuoteSettings),
      pieces: piecesWithStatus,
      cutouts: effectiveQuoteCutouts,
      materialPriceOverrides,
      employeeAssignments,
      statusHistory: nextStatusHistory,
      ...(id ?{} : {createdAt: Timestamp.now()}),
      createdBy: appUid || '',
    };

    try {
      let persistedQuoteId = id;
      if (id) {
        await setDoc(doc(db, 'quotes', id), quoteData, { merge: true });
        await applyQuoteInventoryByStatusTransition(id, originalStatus, status, quoteData);
        clearDraft(quoteDraftKey);
        setQuoteDraftRecovered(false);
        setQuoteDraftSavedAt(null);
        if (logEvent) {
          await logSystemEvent({
            type: 'quote_updated',
            title: LABELS.quotes.updated,
            description: `${selectedClient?.name || 'Cliente'} - ${environment || 'Sem ambiente'}`,
            entityType: 'quote',
            entityId: id,
            quoteId: id,
            quoteStatus: status,
            clientId,
            clientName: selectedClient?.name || '',
            materialId: primaryMaterialId,
            materialName: primaryMaterial?.name || '',
            userUid: appUid || '',
            userName: currentUserName,
            metadata: {totalArea: normalizedTotalArea, totalPrice: normalizedTotalPrice, pieces: pieces.length},
          });
        }
      } else {
        const createdRef = await addDoc(collection(db, 'quotes'), quoteData);
        persistedQuoteId = createdRef.id;
        await applyQuoteInventoryByStatusTransition(createdRef.id, LABELS.quotes.singular, status, quoteData);
        clearDraft(quoteDraftKey);
        setQuoteDraftRecovered(false);
        setQuoteDraftSavedAt(null);
        if (logEvent) {
          await logSystemEvent({
            type: 'quote_created',
            title: LABELS.quotes.created,
            description: `${selectedClient?.name || 'Cliente'} - ${environment || 'Sem ambiente'}`,
            entityType: 'quote',
            entityId: createdRef.id,
            quoteId: createdRef.id,
            quoteStatus: status,
            clientId,
            clientName: selectedClient?.name || '',
            materialId: primaryMaterialId,
            materialName: primaryMaterial?.name || '',
            userUid: appUid || '',
            userName: currentUserName,
            metadata: {totalArea: normalizedTotalArea, totalPrice: normalizedTotalPrice, pieces: pieces.length},
          });
        }
      }
      setOriginalStatus(status);
      if (navigateAfterPersist) {
        navigate('/quotes');
      }
      return persistedQuoteId;
    } catch (err) {
      console.error('Erro ao salvar orcamento:', err);
      const errorMessage = [
        (err as {message?: string})?.message,
        (err as {details?: string})?.details,
        (err as {hint?: string})?.hint,
      ].filter(Boolean).join(' | ');
      const message = errorMessage
        ? `Nao foi possivel salvar este orcamento. ${errorMessage}`
        : 'Nao foi possivel salvar este orcamento agora. Tente novamente em instantes.';
      if (showAlertOnError) {
        window.alert(message);
      }
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    try {
      await persistQuote({navigateAfterPersist: true});
    } catch {
      // The persist helper already surfaced the save failure to the user.
    }
  };

  if (authLoading || settingsLoading || loading || !auxiliaryDataReady) return <div>Carregando...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-32">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/quotes')} className="self-start rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:bg-slate-50">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
              {id ? LABELS.quotes.edit : LABELS.quotes.new}
            </h1>
          <p className="text-slate-500 mt-1">{LABELS.quotes.editorDescription}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || Boolean(quoteMaterialPriceError) || Boolean(pieceManualPriceError)}
          className="flex items-center gap-2 bg-brand-primary text-[#3F3A34] px-8 py-3 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95 disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {saving ?'Salvando...' : LABELS.quotes.save}
        </button>
      </header>

      {quoteDraftRecovered && (
        <DraftNotice
          message="Este orçamento voltou com o rascunho salvo automaticamente. Você pode seguir de onde parou."
          savedAt={quoteDraftSavedAt}
          onClear={clearQuoteDraftState}
        />
      )}
      <DraftAutosaveStatus savedAt={quoteDraftSavedAt} />

      <div className="grid grid-cols-1 gap-5 lg:h-[calc(100svh-190px)] lg:grid-cols-[minmax(360px,384px)_minmax(0,1fr)] lg:gap-8 lg:overflow-hidden xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2">
          <div className="space-y-5 lg:pb-6">
            <section className="rounded-[32px] bg-brand-primary p-6 text-[#3F3A34] shadow-xl shadow-brand-primary/20">
              <div className="flex items-center gap-2 opacity-80">
                <Calculator className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-[0.24em]">Resumo Financeiro</span>
              </div>
              <div className="mt-4 text-4xl font-display font-bold">{formatCurrency(totalPrice)}</div>
              <div className="mt-2 text-xs font-semibold text-[#5F5549]">Valor final do orçamento</div>
              <div className="mt-5 space-y-2 text-sm text-[#4F473E]">
                <div className="flex items-center justify-between gap-3"><span>Área final total</span><strong className="text-[#3F3A34]">{formatArea(totalArea)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Pedra base</span><strong className="text-[#3F3A34]">{formatCurrency(stonesCost)}</strong></div>
                <div className={cn('flex items-center justify-between gap-3', !includeMaterialLoss && 'text-[#7A6D5F]')}><span>Perda material {!includeMaterialLoss && '(Desativado)'}</span><strong className="text-[#3F3A34]">{formatCurrency(materialLossCost)}</strong></div>
                <div className={cn('flex items-center justify-between gap-3', !includeCutouts && 'text-[#7A6D5F]')}><span>Recortes {!includeCutouts && '(Desativado)'}</span><strong className="text-[#3F3A34]">{formatCurrency(cutoutsCost)}</strong></div>
                <div className={cn('flex items-center justify-between gap-3', !includeSculptedSink && 'text-[#7A6D5F]')}><span>Pia esculpida {!includeSculptedSink && '(Desativado)'}</span><strong className="text-[#3F3A34]">{formatCurrency(sculptedLaborCost)}</strong></div>
                <div className={cn('flex items-center justify-between gap-3', !includeLabor && 'text-[#7A6D5F]')}><span>Mão de obra {!includeLabor && '(Desativado)'}</span><strong className="text-[#3F3A34]">{formatCurrency(laborCost)}</strong></div>
                <div className="flex items-center justify-between gap-3 border-t border-[#3F3A34]/15 pt-2"><span>Subtotal produção</span><strong className="text-[#3F3A34]">{formatCurrency(productionSubtotal)}</strong></div>
                <div className={cn('flex items-center justify-between gap-3', !includeDelivery && 'text-[#7A6D5F]')}><span>Entrega {!includeDelivery && '(Desativado)'}</span><strong className="text-[#3F3A34]">{formatCurrency(deliveryFee)}</strong></div>
                <div className={cn('flex items-center justify-between gap-3', !includeComplexity && 'text-[#7A6D5F]')}><span>Complexidade ({formatPercentage(complexityPercent)}){!includeComplexity && ' (Desativado)'}</span><strong className="text-[#3F3A34]">{formatCurrency(complexityValue)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Ajuste pagamento ({selectedPaymentAdjustment > 0 ? '+' : ''}{formatPercentage(selectedPaymentAdjustment)})</span><strong className="text-[#3F3A34]">{formatCurrency(adjustmentValue)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Comissão ({formatPercentage(normalizedCommissionPercent)})</span><strong className="text-[#3F3A34]">{formatCurrency(commissionValue)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Descontos ({formatPercentage(normalizedNegotiationDiscountPercent)})</span><strong className="text-[#3F3A34]">-{formatCurrency(negotiationDiscountValue)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Acréscimos ({formatPercentage(normalizedRtPercent)})</span><strong className="text-[#3F3A34]">{formatCurrency(rtValue)}</strong></div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white/20 px-4 py-3 text-base">
                  <span className="font-bold text-[#3F3A34]">Total final</span>
                  <strong className="font-display text-xl text-[#3F3A34]">{formatCurrency(totalPrice)}</strong>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setSidebarSection(isDigitalOpen ? null : 'digital')}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors', isDigitalOpen ? 'bg-brand-primary text-[#3F3A34]' : 'bg-slate-100 text-slate-500')}>
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold text-slate-900">Proposta Digital</div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="truncate">
                        {!id
                          ? 'Salve o orçamento primeiro'
                          : latestDigitalVersion
                            ? `${latestDigitalVersion.versionLabel} · ${latestDigitalVersion.status}`
                            : 'Nenhuma versão gerada'}
                      </span>
                      {latestDigitalVersion && (
                        <span className={cn(
                          'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase',
                          latestDigitalVersion.status === 'ACEITO'
                            ? 'bg-green-50 text-green-700'
                            : latestDigitalVersion.status === 'REVOGADO'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-slate-100 text-slate-500',
                        )}
                        >
                          {latestDigitalVersion.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200', isDigitalOpen && 'rotate-180')} />
              </button>

              <div className={cn('grid transition-all duration-200 ease-out', isDigitalOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                <div className="overflow-hidden">
                  <div className="border-t border-slate-100 px-5 py-5">
                    <div className="space-y-4">
                      {digitalError && (
                        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                          {digitalError}
                        </div>
                      )}

                      {!id && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                          Salve o orçamento primeiro para liberar a proposta digital.
                        </div>
                      )}

                      {latestDigitalVersion ? (
                        <>
                          <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Versão atual</div>
                                <div className="mt-2 truncate text-sm font-semibold text-slate-900">
                                  {latestDigitalVersion.versionLabel} · {latestDigitalVersion.proposalCode}
                                </div>
                              </div>
                              {digitalLoading && <div className="text-xs font-semibold text-slate-400">Atualizando...</div>}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                              <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</div>
                                <div className="mt-1 font-semibold text-slate-900">{latestDigitalVersion.status}</div>
                              </div>
                              <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gerada em</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatPresentationDate(latestDigitalVersion.createdAt)}</div>
                              </div>
                              <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Validade</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatPresentationDate(latestDigitalVersion.validUntil)}</div>
                              </div>
                              <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Visualizada</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatPresentationDate(latestDigitalVersion.firstViewedAt)}</div>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button type="button" onClick={() => handleOpenDigitalVersion(latestDigitalVersion)} disabled={digitalBusy === `open:${latestDigitalVersion.id}`} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                              <ExternalLink className="h-4 w-4" />
                              Visualizar
                            </button>
                            <button type="button" onClick={() => handleCopyDigitalLink(latestDigitalVersion)} disabled={digitalBusy === `copy:${latestDigitalVersion.id}`} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                              <Copy className="h-4 w-4" />
                              Copiar link
                            </button>
                            <button type="button" onClick={() => handleSendDigitalWhatsApp(latestDigitalVersion)} disabled={digitalBusy === `wa:${latestDigitalVersion.id}`} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                              <MessageCircle className="h-4 w-4" />
                              WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={handleGenerateDigitalVersion}
                              disabled={!id || digitalBusy === 'generate'}
                              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-[#3F3A34] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {digitalBusy === 'generate' ? <CheckCircle2 className="h-4 w-4 animate-pulse" /> : <Sparkles className="h-4 w-4" />}
                              Nova versão
                            </button>
                            <button type="button" onClick={() => handleRevokeDigitalVersion(latestDigitalVersion)} disabled={digitalBusy === `revoke:${latestDigitalVersion.id}` || latestDigitalVersion.status === 'REVOGADO'} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 disabled:opacity-60 sm:col-span-2">
                              <Ban className="h-4 w-4" />
                              Revogar link
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-4">
                          <div className="text-sm text-slate-500">
                            Gere a versão comercial em HTML para o cliente com histórico, link compartilhável e aceite digital.
                          </div>
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={handleGenerateDigitalVersion}
                              disabled={!id || digitalBusy === 'generate'}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-[#3F3A34] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {digitalBusy === 'generate' ? <CheckCircle2 className="h-4 w-4 animate-pulse" /> : <Sparkles className="h-4 w-4" />}
                              Gerar proposta
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="rounded-[24px] border border-slate-100 bg-slate-50/70">
                        <button
                          type="button"
                          onClick={() => setDigitalHistoryOpen((current) => !current)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <History className="h-4 w-4 text-brand-primary" />
                            Histórico de versões
                          </div>
                          <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform duration-200', digitalHistoryOpen && 'rotate-180')} />
                        </button>
                        <div className={cn('grid transition-all duration-200 ease-out', digitalHistoryOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                          <div className="overflow-hidden">
                            <div className="border-t border-slate-100 px-4 py-4">
                              <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
                                {digitalVersions.length === 0 ? (
                                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">Sem versões geradas.</div>
                                ) : (
                                  digitalVersions.map((version) => (
                                    <div key={version.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-semibold text-slate-900">{version.versionLabel}</div>
                                        <span className={cn('rounded-full px-3 py-1 text-[10px] font-bold uppercase', version.status === 'ACEITO' ? 'bg-green-50 text-green-700' : version.status === 'REVOGADO' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500')}>
                                          {version.status}
                                        </span>
                                      </div>
                                      <div className="mt-2 text-xs leading-5 text-slate-500">
                                        {formatPresentationDate(version.createdAt)} · validade {formatPresentationDate(version.validUntil)}
                                      </div>
                                      {version.acceptedAt && (
                                        <div className="mt-2 text-xs font-semibold text-green-700">Aceita em {formatPresentationDate(version.acceptedAt)}</div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>

                              {digitalAcceptances.length > 0 && (
                                <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-4 py-4">
                                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Aceites registrados</div>
                                  <div className="mt-3 space-y-2">
                                    {digitalAcceptances.slice(0, 3).map((acceptance) => (
                                      <div key={acceptance.id} className="text-sm text-slate-700">
                                        <span className="font-semibold">{acceptance.acceptedName}</span> · {acceptance.versionNumber ? `V${acceptance.versionNumber}` : '-'} · {formatPresentationDate(acceptance.createdAt)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <SidebarAccordionSection sectionKey="client" openSection={sidebarSection} onToggle={setSidebarSection} icon={Building2} title="Cliente" description="Selecione o cliente para este orçamento.">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nome</label>
                  <div className="relative">
                    <input
                      value={clientSearch}
                      onFocus={() => setClientPickerOpen(true)}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setClientId('');
                        setClientPickerOpen(true);
                      }}
                      className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="Pesquisar cliente..."
                    />
                    <button type="button" onClick={() => setClientPickerOpen((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {clientPickerOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setClientId('');
                            setClientSearch('');
                            setClientPickerOpen(false);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50"
                        >
                          Selecionar cliente
                        </button>
                        {filteredClients.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setClientId(client.id);
                              setClientSearch(client.name);
                              setClientPickerOpen(false);
                            }}
                            className={cn('w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-brand-primary/10', clientId === client.id ? 'bg-brand-primary text-[#3F3A34] hover:bg-brand-primary' : 'text-slate-700')}
                          >
                            <span className="block">{client.name}</span>
                          </button>
                        ))}
                        {filteredClients.length === 0 && <div className="px-3 py-3 text-sm font-semibold text-slate-400">Nenhum cliente encontrado.</div>}
                      </div>
                    )}
                  </div>
                </div>

                {selectedClient && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cidade</label><div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">{selectedClient.city || '-'}</div></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bairro</label><div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">{selectedClient.neighborhood || '-'}</div></div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ambiente</label><input value={environment} onChange={(e) => setEnvironment(e.target.value)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" placeholder="Ex: Cozinha" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Responsável</label><input value={responsible} onChange={(e) => setResponsible(e.target.value)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" placeholder="Responsável" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prazo (dias)</label><NumericInput value={deliveryDays} onValueChange={(value) => setDeliveryDays(value)} decimals={0} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Validade (dias)</label><NumericInput value={validityDays} onValueChange={(value) => setValidityDays(value)} decimals={0} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data da medição</label><input type="date" value={measurementDate} onChange={(e) => setMeasurementDate(e.target.value)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data da entrega</label><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" /></div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Observações</label>
                  <textarea value={commercialNotes} onChange={(e) => setCommercialNotes(e.target.value)} className="min-h-[120px] w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" placeholder="Informações de atendimento, instalação e observações gerais..." />
                </div>
              </div>
            </SidebarAccordionSection>

            <SidebarAccordionSection sectionKey="materials" openSection={sidebarSection} onToggle={setSidebarSection} icon={Package2} title="Materiais" description="Resumo dos materiais selecionados nas peças do orçamento.">
              <div className="space-y-3">
                {quoteMaterialPriceRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-400">Selecione materiais nas peças para visualizar os dados aqui.</div>
                ) : quoteMaterialPriceRows.map((row) => (
                  <div key={row.key} className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4">
                    <div className="font-bold text-slate-900">{row.name}</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-400">{row.specs || 'Sem especificações adicionais'}</div>
                    <div className="mt-3 text-sm text-slate-600">{row.pieceNames.length ? `Aplicado em: ${row.pieceNames.join(', ')}` : 'Sem observações adicionais.'}</div>
                  </div>
                ))}
              </div>
            </SidebarAccordionSection>

            <SidebarAccordionSection sectionKey="pricing" openSection={sidebarSection} onToggle={setSidebarSection} icon={BadgeDollarSign} title="Precificação" description="Custos, regras automáticas e margens do orçamento.">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-brand-primary" /><h3 className="text-sm font-semibold text-slate-900">Componentes do orçamento</h3></div>
                  <div className="mt-4 divide-y divide-slate-100">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Material</div>
                        <div className="text-xs text-slate-400">Sempre ativo</div>
                      </div>
                      <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(stonesCost)}</div>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Perda de material</div>
                        <div className="text-xs text-slate-400">{formatPercentage(MATERIAL_LOSS_PERCENTAGE)} · {includeMaterialLoss ? 'Ativo' : `Desativado · original ${formatCurrency(originalMaterialLossCost)}`}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(materialLossCost)}</div>
                        <PricingSwitch checked={includeMaterialLoss} onChange={setIncludeMaterialLoss} label="Alternar perda de material" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Recortes</div>
                        <div className="text-xs text-slate-400">{includeCutouts ? 'Ativo' : `Desativado · original ${formatCurrency(originalCutoutsCost)}`}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(cutoutsCost)}</div>
                        <PricingSwitch checked={includeCutouts} onChange={setIncludeCutouts} label="Alternar recortes" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Pia esculpida</div>
                        <div className="text-xs text-slate-400">{includeSculptedSink ? 'Ativo' : `Desativado · original ${formatCurrency(originalSculptedLaborCost)}`}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(sculptedLaborCost)}</div>
                        <PricingSwitch checked={includeSculptedSink} onChange={setIncludeSculptedSink} label="Alternar pia esculpida" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Mão de obra</div>
                        <div className="text-xs text-slate-400">{includeLabor ? (resolvedLaborPricing.source === 'linear' ? 'Linear' : 'Automática') : `Desativado · original ${formatCurrency(originalLaborCost)}`}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(laborCost)}</div>
                        <PricingSwitch checked={includeLabor} onChange={setIncludeLabor} label="Alternar mão de obra" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Entrega</div>
                        <div className="text-xs text-slate-400">{includeDelivery ? (deliveryResolution.source === 'district' ? 'Bairro' : deliveryResolution.source === 'city' ? 'Cidade' : 'Padrão') : `Desativado · original ${formatCurrency(originalDeliveryFee)}`}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(deliveryFee)}</div>
                        <PricingSwitch checked={includeDelivery} onChange={setIncludeDelivery} label="Alternar entrega" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Complexidade das peças</div>
                        <div className="text-xs text-slate-400">
                          {hasPieceScopedComplexity
                            ? 'Definida individualmente dentro de cada peça'
                            : `Compatibilidade histórica · ${resolvedComplexity.label} · ${complexityPercent > 0 ? '+' : ''}${formatPercentage(complexityPercent)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm font-semibold text-slate-900">{formatCurrency(complexityValue)}</div>
                        <PricingSwitch checked={includeComplexity} onChange={setIncludeComplexity} label="Alternar complexidade das peças" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">Total final desejado</div>
                  <p className="mt-1 text-xs text-slate-500">Calcula o desconto ou acréscimo necessário usando a regra oficial do orçamento.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <CurrencyInput
                      value={desiredTotalInput}
                      onValueChange={(_, rawValue) => setDesiredTotalInput(rawValue)}
                      onBlur={applyDesiredTotalAdjustment}
                      placeholder="R$ 0,00"
                      className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                    />
                    <button
                      type="button"
                      onClick={applyDesiredTotalAdjustment}
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white transition-all hover:bg-slate-800"
                    >
                      Calcular
                    </button>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    {desiredTotalFeedback || 'O percentual calculado atualiza o campo oficial de desconto ou acréscimo.'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">Ajuste de materiais neste orçamento</div>
                  {quoteMaterialPriceRows.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-400">Selecione materiais nas peças para personalizar valores.</div>
                  ) : quoteMaterialPriceRows.map((row) => {
                    const hasCustomInput = Boolean(row.customInput.trim());
                    const isValidCustom = hasCustomInput && !row.error;
                    return (
                      <div key={row.key} className={cn('mt-4 rounded-xl border bg-slate-50 p-4 transition-all', row.error ? 'border-red-200 ring-2 ring-red-50' : isValidCustom ? 'border-green-100' : 'border-slate-100')}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{row.name}</div>
                            <div className="text-[11px] font-semibold text-slate-400">{row.specs || row.pieceNames.join(', ') || 'Material selecionado'}</div>
                          </div>
                          <span className={cn('inline-flex self-start rounded-full px-3 py-1 text-[10px] font-bold uppercase', row.error ? 'bg-red-50 text-red-600' : isValidCustom ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500')}>{row.error ? 'Inválido' : isValidCustom ? 'Válido' : 'Preço padrão'}</span>
                        </div>
                        <CurrencyInput value={row.customInput} onValueChange={(_, rawValue) => updateMaterialCustomPriceInput(row.key, rawValue)} onBlur={() => formatMaterialCustomPriceInput(row.key)} className={cn('mt-3 w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-mono outline-none transition-all focus:ring-2', row.error ? 'border-red-300 text-red-700 focus:ring-red-100' : isValidCustom ? 'border-green-200 text-slate-900 focus:ring-green-100' : 'border-slate-100 text-slate-900 focus:ring-brand-primary/20')} placeholder="R$ 0,00" />
                      </div>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Comissão (%)</span><PercentageInput value={commissionPercent} onValueChange={(value) => setCommissionPercent(String(value))} className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-brand-primary/20" placeholder="0" /></label>
                  <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Descontos (%)</span><PercentageInput value={negotiationDiscountPercent} onValueChange={(value) => setNegotiationDiscountPercent(String(value))} className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-brand-primary/20" placeholder="0" /></label>
                  <label className="space-y-1 sm:col-span-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Acréscimos (%)</span><PercentageInput value={rtPercent} onValueChange={(value) => setRtPercent(String(value))} className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-brand-primary/20" placeholder="0" /></label>
                </div>
              </div>
            </SidebarAccordionSection>

            <SidebarAccordionSection sectionKey="payment" openSection={sidebarSection} onToggle={setSidebarSection} icon={CreditCard} title="Forma de Pagamento" description="Condição comercial, parcelas, entrada e observações financeiras.">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setPaymentMode('total')} className={cn('rounded-2xl px-4 py-3 text-sm font-semibold transition-all', paymentMode === 'total' ? 'bg-brand-primary text-[#3F3A34]' : 'bg-slate-50 text-slate-600')}>Valor total</button>
                  <button type="button" onClick={() => setPaymentMode('entry')} className={cn('rounded-2xl px-4 py-3 text-sm font-semibold transition-all', paymentMode === 'entry' ? 'bg-brand-primary text-[#3F3A34]' : 'bg-slate-50 text-slate-600')}>Entrada + restante</button>
                </div>
                {paymentMode === 'total' ? (
                  <select value={totalPaymentMethod} onChange={(e) => setTotalPaymentMethod(e.target.value)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                    <option value="">Selecionar forma de pagamento</option>
                    {effectiveQuoteSettings.paymentMethods.filter((method) => method.name.trim()).map((method) => (
                      <option key={method.name} value={method.name}>{method.name} ({method.adjustment > 0 ? '+' : ''}{formatPercentage(method.adjustment)})</option>
                    ))}
                  </select>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <CurrencyInput value={entryAmount} onValueChange={(_, rawValue) => setEntryAmount(rawValue)} placeholder="R$ 0,00" className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" />
                    <select value={remainingPaymentMethod} onChange={(e) => setRemainingPaymentMethod(e.target.value)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                      <option value="">Selecionar condição do restante</option>
                      {effectiveQuoteSettings.paymentMethods.filter((method) => method.name.trim()).map((method) => (
                        <option key={method.name} value={method.name}>{method.name} ({method.adjustment > 0 ? '+' : ''}{formatPercentage(method.adjustment)})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parcelas</label><NumericInput value={normalizedInstallmentCount} onValueChange={(value) => setInstallmentCount(Math.max(1, value))} decimals={0} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Valor de cada parcela</label><div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">{formatCurrency(installmentAmount)}</div></div>
                </div>
                <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="min-h-[110px] w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm" placeholder="Observações de pagamento..." />
              </div>
            </SidebarAccordionSection>
          </div>
        </div>

        {/* Left Column: Basic Info */}
        <div className="hidden">
          <section className="bg-brand-primary p-8 rounded-[32px] text-[#3F3A34] shadow-xl shadow-brand-primary/30">
            <div className="flex items-center gap-2 mb-4 opacity-80">
              <Calculator className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Resumo do Total</span>
            </div>
            <div className="text-4xl font-display font-bold mb-2">
              {formatCurrency(totalPrice)}
            </div>
            <div className="space-y-2 text-sm font-medium text-[#4F473E]">
              <div className="flex justify-between gap-3"><span>Área final total</span><strong>{formatArea(totalArea)}</strong></div>
              <div className="flex justify-between gap-3"><span>Pedras</span><strong>{formatCurrency(stonesCost)}</strong></div>
              <div className={cn('flex justify-between gap-3', !includeMaterialLoss && 'text-[#7A6D5F]')}>
                <span>{includeMaterialLoss ? `Perda material (${formatPercentage(MATERIAL_LOSS_PERCENTAGE)})` : 'Perda material desativada'}</span>
                <strong>{formatCurrency(materialLossCost)}</strong>
              </div>
              <div className={cn('flex justify-between gap-3', !includeLabor && 'text-[#7A6D5F]')}><span>Mão de obra {!includeLabor && '(Desativado)'}</span><strong>{formatCurrency(laborCost)}</strong></div>
              <div className={cn('flex justify-between gap-3', !includeCutouts && 'text-[#7A6D5F]')}><span>Recortes {!includeCutouts && '(Desativado)'}</span><strong>{formatCurrency(cutoutsCost)}</strong></div>
              <div className={cn('flex justify-between gap-3', !includeSculptedSink && 'text-[#7A6D5F]')}><span>Pia esculpida {!includeSculptedSink && '(Desativado)'}</span><strong>{formatCurrency(sculptedLaborCost)}</strong></div>
              <div className="flex justify-between gap-3 border-t border-[#3F3A34]/15 pt-2"><span>Ajuste pagamento ({selectedPaymentAdjustment > 0 ? '+' : ''}{formatPercentage(selectedPaymentAdjustment)})</span><strong>{formatCurrency(adjustmentValue)}</strong></div>
              <div className="flex justify-between gap-3"><span>Negociação (-{formatPercentage(normalizedNegotiationDiscountPercent)})</span><strong>-{formatCurrency(negotiationDiscountValue)}</strong></div>
              <div className="flex justify-between gap-3"><span>RT (+{formatPercentage(normalizedRtPercent)})</span><strong>{formatCurrency(rtValue)}</strong></div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <h2 className="font-display font-bold text-xl text-slate-800">Dados do orçamento</h2>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cliente</label>
              <div className="relative">
                <input
                  value={clientSearch}
                  onFocus={() => setClientPickerOpen(true)}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setClientId('');
                    setClientPickerOpen(true);
                  }}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20"
                  placeholder="Pesquisar cliente..."
                />
                <button type="button" onClick={() => setClientPickerOpen((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <ChevronDown className="h-4 w-4" />
                </button>
                {clientPickerOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setClientId('');
                        setClientSearch('');
                        setClientPickerOpen(false);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50"
                    >
                      Selecionar cliente
                    </button>
                    {filteredClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setClientId(client.id);
                          setClientSearch(client.name);
                          setClientPickerOpen(false);
                        }}
                        className={cn('w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-brand-primary/10', clientId === client.id ? 'bg-brand-primary text-[#3F3A34] hover:bg-brand-primary' : 'text-slate-700')}
                      >
                        <span className="block">{client.name}</span>
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <div className="px-3 py-3 text-sm font-semibold text-slate-400">Nenhum cliente encontrado.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedClient && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cidade</label><div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{selectedClient.city || '-'}</div></div>
                <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Bairro</label><div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{selectedClient.neighborhood || '-'}</div></div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ambiente</label>
              <input
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
                placeholder="Ex: Cozinha"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Responsável</label>
              <input
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
                placeholder="Nome do responsável"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Prazo (dias)</label>
                <NumericInput
                  value={deliveryDays}
                  onValueChange={(value) => setDeliveryDays(value)}
                  decimals={0}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Validade (dias)</label>
                <NumericInput
                  value={validityDays}
                  onValueChange={(value) => setValidityDays(value)}
                  decimals={0}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-800">Materiais do orçamento</h3>
                  <p className="text-xs text-slate-500">Preços personalizados ficam salvos apenas neste orçamento.</p>
                </div>
                {quoteMaterialPriceError && (
                  <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-bold uppercase text-red-600">Revisar</span>
                )}
              </div>

              {quoteMaterialPriceRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm font-semibold text-slate-400">
                  Selecione materiais nas peças para personalizar os valores deste orçamento.
                </div>
              ) : (
                <div className="space-y-3">
                  {quoteMaterialPriceRows.map((row) => {
                    const hasCustomInput = Boolean(row.customInput.trim());
                    const isValidCustom = hasCustomInput && !row.error;
                    return (
                      <div key={row.key} className={cn('rounded-2xl border bg-white p-4 shadow-sm transition-all', row.error ? 'border-red-200 ring-2 ring-red-50' : isValidCustom ? 'border-green-100' : 'border-slate-100')}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900">{row.name}</div>
                            <div className="text-[11px] font-semibold text-slate-400">{row.specs || row.pieceNames.join(', ') || 'Material selecionado'}</div>
                            {row.pieceNames.length > 0 && (
                              <div className="mt-1 text-[11px] text-slate-500">Peças: {row.pieceNames.join(', ')}</div>
                            )}
                          </div>
                          <span className={cn('inline-flex self-start rounded-full px-3 py-1 text-[10px] font-bold uppercase', row.error ? 'bg-red-50 text-red-600' : isValidCustom ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500')}>
                            {row.error ? 'Inválido' : isValidCustom ? 'Válido' : 'Preço padrão'}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-slate-50 p-3">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Preço padrão</span>
                            <strong className="font-mono text-slate-900">{formatCurrency(row.defaultPricePerM2)}/m²</strong>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-3">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Valor mínimo</span>
                            <strong className="font-mono text-slate-900">{formatCurrency(row.minimumSalePerM2)}/m²</strong>
                          </div>
                        </div>

                        <label className="mt-3 block space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Valor personalizado neste orçamento</span>
                          <CurrencyInput
                            value={row.customInput}
                            onValueChange={(_, rawValue) => updateMaterialCustomPriceInput(row.key, rawValue)}
                            onBlur={() => formatMaterialCustomPriceInput(row.key)}
                            className={cn(
                              'w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-mono outline-none transition-all focus:ring-2',
                              row.error ? 'border-red-300 text-red-700 focus:ring-red-100' : isValidCustom ? 'border-green-200 text-slate-900 focus:ring-green-100' : 'border-slate-100 text-slate-900 focus:ring-brand-primary/20',
                            )}
                            placeholder="R$ 0,00"
                          />
                        </label>
                        <div className={cn('mt-2 text-[11px] font-semibold', row.error ? 'text-red-600' : 'text-slate-500')}>
                          {row.error || 'Esse valor será aplicado apenas neste orçamento.'}
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400">
                          Valor em uso no cálculo: <span className="font-mono font-bold text-slate-600">{formatCurrency(row.usedPricePerM2)}/m²</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pagamento</label>
              <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('total')}
                    className={cn(
                      'rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                      paymentMode === 'total' ? 'bg-brand-primary text-[#3F3A34]' : 'bg-white text-slate-600',
                    )}
                  >
                    Valor total
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('entry')}
                    className={cn(
                      'rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                      paymentMode === 'entry' ? 'bg-brand-primary text-[#3F3A34]' : 'bg-white text-slate-600',
                    )}
                  >
                    Entrada + restante
                  </button>
                </div>

                {paymentMode === 'total' ? (
                  <div className="space-y-1">
                    <select
                      value={totalPaymentMethod}
                      onChange={(e) => setTotalPaymentMethod(e.target.value)}
                      className="w-full bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
                    >
                      <option value="">Selecionar forma de pagamento</option>
                      {effectiveQuoteSettings.paymentMethods.filter((method) => method.name.trim()).map((method) => (
                        <option key={method.name} value={method.name}>{method.name} ({method.adjustment > 0 ? '+' : ''}{formatPercentage(method.adjustment)})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Entrada</label>
                      <CurrencyInput
                        value={entryAmount}
                        onValueChange={(_, rawValue) => setEntryAmount(rawValue)}
                        placeholder="R$ 0,00"
                        className="w-full bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Restante</label>
                      <select
                        value={remainingPaymentMethod}
                        onChange={(e) => setRemainingPaymentMethod(e.target.value)}
                        className="w-full bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
                      >
                        <option value="">Selecionar condição do restante</option>
                        {effectiveQuoteSettings.paymentMethods.filter((method) => method.name.trim()).map((method) => (
                          <option key={method.name} value={method.name}>{method.name} ({method.adjustment > 0 ? '+' : ''}{formatPercentage(method.adjustment)})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {(resolvedPaymentMethod || selectedPaymentAdjustment) && (
                  <div className="space-y-1 text-[11px] text-slate-500">
                    <div>Condição: {resolvedPaymentMethod || 'A definir'}</div>
                    <div>
                      Ajuste aplicado: {selectedPaymentAdjustment > 0 ? '+' : ''}{formatPercentage(selectedPaymentAdjustment)} {paymentMode === 'entry' ? 'sobre o saldo restante' : 'sobre o valor total'}
                    </div>
                    {paymentMode === 'entry' && (
                      <div>
                        Entrada: {formatCurrency(normalizedEntryAmount)} · Restante: {formatCurrency(Math.max(0, subtotalBeforeAdjustment - normalizedEntryAmount))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Negociação (%)</label>
                  <PercentageInput
                  value={negotiationDiscountPercent}
                  onValueChange={(value) => setNegotiationDiscountPercent(String(value))}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm"
                  placeholder="Desconto"
                />
                <div className="text-[10px] font-semibold text-slate-400">Desconto no total</div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">RT (%)</label>
                  <PercentageInput
                  value={rtPercent}
                  onValueChange={(value) => setRtPercent(String(value))}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm"
                  placeholder="Acréscimo"
                />
                <div className="text-[10px] font-semibold text-slate-400">Acréscimo no total</div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Pieces */}
        <div className="min-w-0 space-y-6 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:pb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-display font-bold text-slate-900">{LABELS.pieces.quotePieces}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startAddingPiece}
                className="inline-flex items-center gap-2 rounded-2xl border border-brand-primary/20 bg-brand-primary px-4 py-2 text-sm font-bold text-[#3F3A34] shadow-sm transition-all hover:bg-brand-primary/90"
              >
                <Plus className="w-5 h-5" /> Criar peça
              </button>
              <button
                type="button"
                onClick={startAddingStair}
                className="rounded-2xl bg-brand-primary px-4 py-2 text-sm font-bold text-[#3F3A34] shadow-sm hover:bg-brand-primary/90"
              >
                Criar escada
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {pieces.length === 0 && (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[32px] text-center space-y-4">
                <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                <div className="text-slate-500 font-medium tracking-tight">Nenhuma peça adicionada ainda.</div>
                <p className="text-sm text-slate-500">Use os botões acima para criar uma peça comum ou iniciar o cadastro de uma escada.</p>
              </div>
            )}

            {pieces.map((piece, pIdx) => {
              const pieceTotals = calculatePieceArea(piece);
              const pieceArea = pieceTotals.totalArea;
              const stairDetails = calculateStairArea(piece);
              const pieceMaterial = materialWithQuotePrice(piece.materialId, piece.materialVariantKey);
              const stock = piece.materialId ?materialStock(piece.materialId, piece.materialVariantKey) : {available: 0};
              const pieceDimensions = getPieceMajorMinorSides(piece);
              const effectiveLongestSide = getEffectivePieceLongestSide(piece);
              const pieceAreaMode = getPieceAreaMode(piece);
              const isManualPieceArea = pieceAreaMode === 'manual';
              const drawingArea = getStoredDrawingArea(piece);
              const manualFinalArea = getStoredManualFinalArea(piece);
              const pieceCutoutBreakdown = originalPiecePricingBreakdowns[pIdx];
              const pieceFinalBreakdown = finalPiecePricingBreakdowns[pIdx];
              const pieceScopedCutouts = pieceCutoutBreakdown?.cutoutRows || [];
              const pieceScopedCutoutTotal = pieceCutoutBreakdown?.calculatedCutoutValue || 0;
              const hasMaterial = Boolean(piece.materialId);
              const hasEnoughStock = hasMaterial && stock.available >= pieceArea;
              const lotInfo = hasMaterial ?materialLotInfo(piece.materialId, pieceArea, piece.materialVariantKey) : null;
              const pieceWorkflowStatus = normalizeQuoteStatus(piece.pieceStatus || status);
              const pieceMode = inferPieceEditorMode(piece);
              const pieceKind = inferPieceKind(piece);
              const isDrawEditor = pieceEditorMode === 'draw';
              const isManualEditor = pieceEditorMode === 'manual';
              const isStairEditor = pieceEditorMode === 'stair';
              const filteredPieceMaterials = filteredMaterialsForPiece(piece.id);
              const isEditingPiece = pieceEditorOpen && pieceEditorPieceId === piece.id;
              const selectedInitialKind = piece.kind;
              if (!isEditingPiece) {
                return (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => openPieceEditor(piece.id)}
                    className="w-full rounded-[28px] border border-slate-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-primary/20 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary text-xs font-bold text-[#3F3A34]">
                            {pIdx + 1}
                          </div>
                          <div className="truncate font-display text-xl font-bold text-slate-900">{piece.name}</div>
                          <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase', quoteStatusColor(pieceWorkflowStatus))}>
                            {pieceWorkflowStatus}
                          </span>
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase text-slate-600">
                            {getPieceKindLabel(pieceKind)}
                          </span>
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase text-slate-600">
                            {pieceMode === 'stair' ? 'Escada' : pieceMode === 'draw' ? 'Desenho' : 'Medidas prontas'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Área</div>
                            <div className="mt-2 font-mono text-sm font-bold text-slate-900">{formatMeasure(pieceArea)}</div>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Material</div>
                            <div className="mt-2 truncate text-sm font-semibold text-slate-900">{pieceMaterial?.name || 'Sem material'}</div>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Valor</div>
                            <div className="mt-2 font-mono text-sm font-bold text-slate-900">{formatCurrency(pieceCutoutBreakdown?.pieceSubtotalValue || 0)}</div>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Recortes</div>
                            <div className="mt-2 font-mono text-sm font-bold text-slate-900">{formatCurrency(pieceScopedCutoutTotal)}</div>
                          </div>
                        </div>
                        {pieceFinalBreakdown ? (
                          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Detalhamento financeiro</div>
                              <div className="text-sm font-semibold text-slate-900">Final: {formatCurrency(pieceFinalBreakdown.pieceFinalValue)}</div>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                              {[
                                ['Material', pieceFinalBreakdown.stoneBaseValue],
                                ['Perda', pieceFinalBreakdown.materialLossValue],
                                ['Mão de obra', pieceFinalBreakdown.laborValue],
                                ['Recortes', pieceFinalBreakdown.cutoutValue],
                                ['Pia esculpida', pieceFinalBreakdown.sinkAdditionalValue],
                                [
                                  pieceFinalBreakdown.complexityLabel
                                    ? `Complexidade ${pieceFinalBreakdown.complexityLabel} (${formatPercentage(pieceFinalBreakdown.complexityPercent)})`
                                    : 'Complexidade',
                                  pieceFinalBreakdown.complexityValue,
                                ],
                                ['Subtotal próprio', pieceFinalBreakdown.pieceSubtotalValue],
                                ['Participação ajustes globais', pieceFinalBreakdown.allocatedQuoteAdjustmentValue],
                              ].filter(([, value]) => Math.abs(Number(value) || 0) > 0).map(([label, value]) => (
                                <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                                  <span className="min-w-0 truncate text-slate-500">{label}</span>
                                  <strong className="shrink-0 font-mono text-slate-900">{formatCurrency(Number(value) || 0)}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="inline-flex items-center self-start rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                        Abrir editor
                      </div>
                    </div>
                  </button>
                );
              }
              return (
              <div className="fixed inset-0 z-[90] px-3 py-3 sm:px-6 sm:py-6">
                <button type="button" aria-label="Fechar painel da peça" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={cancelPieceEditor} />
                <div className="relative flex h-full w-full items-center justify-center">
              <div
                key={piece.id}
                className={cn(
                  'relative flex w-full flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-[#FBFBFD] shadow-2xl',
                  pieceEditorMode === null
                    ? 'max-w-[680px] max-h-[min(100vh-1.5rem,760px)]'
                    : 'h-full max-h-full max-w-[1040px] sm:max-h-[calc(100vh-3rem)]',
                )}
              >
                {pieceEditorMode === null ? (
                  <div className="border-b border-slate-200 bg-white/95 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Criar peça</div>
                        <h2 className="mt-3 font-display text-2xl font-bold text-slate-900">Escolha o tipo e a forma de cadastro</h2>
                        <p className="mt-2 max-w-xl text-sm text-slate-500">Defina primeiro a classificação da peça e como ela será cadastrada. O restante do formulário aparece só depois dessa escolha.</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Fechar editor da peça"
                        title="Fechar editor da peça"
                        onClick={cancelPieceEditor}
                        className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:text-slate-700"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-b border-slate-200 bg-white/95 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-3">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                          {pieceEditorIsNew ? 'Adicionar peça' : 'Editar peça'}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-brand-primary text-[#3F3A34] text-xs font-bold rounded-lg flex items-center justify-center">
                            {pIdx + 1}
                          </div>
                          <input
                            type="text"
                            value={piece.name}
                            onChange={(e) => updatePiece(piece.id, { name: e.target.value })}
                            className="min-w-0 bg-transparent font-display font-bold text-slate-800 outline-none focus:text-brand-primary transition-all w-full"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase text-slate-600">
                            {getPieceKindLabel(pieceKind)}
                          </div>
                          <div className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase', quoteStatusColor(pieceWorkflowStatus))}>
                            {pieceWorkflowStatus}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Fechar editor da peça"
                        title="Fechar editor da peça"
                        onClick={cancelPieceEditor}
                        className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:text-slate-700"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}

                {pieceEditorMode === null ? (
                  <div className="overflow-y-auto px-5 py-5">
                    <div className="space-y-5">
                      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">1. Que tipo de peça é?</div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          {([
                            {key: 'bancada', label: 'Bancada', description: 'Peça padrão do orçamento.', icon: Building2},
                            {key: 'escada', label: 'Escada', description: 'Reutiliza o fluxo oficial já existente.', icon: Layers},
                            {key: 'soleira_baguete', label: 'Soleira / Baguete', description: 'Classificação leve dentro da própria peça.', icon: Wrench},
                          ] as const).map(({key, label, description, icon: Icon}) => {
                            const selected = selectedInitialKind === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => applyInitialPieceKind(key)}
                                className={cn(
                                  'rounded-[24px] border px-4 py-4 text-left transition-all',
                                  selected ? 'border-brand-primary bg-brand-primary/10 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-brand-primary/30 hover:bg-white',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-bold uppercase tracking-[0.18em] text-slate-700">{label}</div>
                                    <p className="mt-2 text-sm text-slate-500">{description}</p>
                                  </div>
                                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', selected ? 'bg-brand-primary text-[#3F3A34]' : 'bg-white text-slate-500')}>
                                    <Icon className="h-5 w-5" />
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>

                      {selectedInitialKind !== 'escada' ? (
                      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">2. Como essa peça será cadastrada?</div>
                        <p className="mt-2 text-sm text-slate-500">
                          Escolha o fluxo mais adequado para continuar sem expor todos os campos de uma vez.
                        </p>
                        <div className="mt-6 space-y-3">
                          <button
                            type="button"
                            onClick={() => applyPieceEditorMode('draw')}
                            disabled={!selectedInitialKind}
                            className={cn(
                              'flex w-full items-start justify-between rounded-[24px] border px-4 py-4 text-left transition-all',
                              selectedInitialKind
                                ? 'border-slate-200 bg-slate-50 hover:border-brand-primary/30 hover:bg-white'
                                : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
                            )}
                          >
                            <div>
                              <div className="text-sm font-bold uppercase tracking-[0.18em] text-slate-700">Desenhar a peça</div>
                              <p className="mt-2 text-sm text-slate-500">Criar a geometria da peça e utilizar as medidas do desenho.</p>
                            </div>
                            <PenTool className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
                          </button>
                          <button
                            type="button"
                            onClick={() => applyPieceEditorMode('manual')}
                            disabled={!selectedInitialKind}
                            className={cn(
                              'flex w-full items-start justify-between rounded-[24px] border px-4 py-4 text-left transition-all',
                              selectedInitialKind
                                ? 'border-slate-200 bg-slate-50 hover:border-brand-primary/30 hover:bg-white'
                                : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
                            )}
                          >
                            <div>
                              <div className="text-sm font-bold uppercase tracking-[0.18em] text-slate-700">Usar medidas prontas</div>
                              <p className="mt-2 text-sm text-slate-500">Informar manualmente as medidas de uma peça já definida.</p>
                            </div>
                            <ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
                          </button>
                        </div>
                      </section>
                      ) : null}
                    </div>
                  </div>
                ) : (
                <div className="flex-1 overflow-y-auto p-5 pb-[calc(10rem+env(safe-area-inset-bottom))]">
                  <div className="space-y-5">
                    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Material</div>
                          <h3 className="mt-2 font-display text-lg font-bold text-slate-900">Selecione o material da peça</h3>
                        </div>
                        <div className="relative">
                          <input
                            value={pieceMaterialSearch[piece.id] || pieceMaterial?.name || ''}
                            onFocus={() => setPieceMaterialPickerOpen((current) => ({...current, [piece.id]: true}))}
                            onChange={(e) => {
                              setPieceMaterialSearch((current) => ({...current, [piece.id]: e.target.value}));
                              updatePiece(piece.id, {materialId: '', materialVariantKey: undefined, materialLine: undefined, materialType: undefined, thicknessLabel: undefined, texture: undefined, provider: undefined});
                              setPieceMaterialPickerOpen((current) => ({...current, [piece.id]: true}));
                            }}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                            placeholder="Pesquisar material para esta peça..."
                          />
                          <button type="button" onClick={() => setPieceMaterialPickerOpen((current) => ({...current, [piece.id]: !current[piece.id]}))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          {pieceMaterialPickerOpen[piece.id] && (
                            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
                              <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  updatePiece(piece.id, {materialId: '', materialVariantKey: undefined, materialLine: undefined, materialType: undefined, thicknessLabel: undefined, texture: undefined, provider: undefined});
                                  setPieceMaterialSearch((current) => ({...current, [piece.id]: ''}));
                                  setPieceMaterialPickerOpen((current) => ({...current, [piece.id]: false}));
                                }}
                                className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50"
                              >
                                Selecionar material
                              </button>
                              {filteredPieceMaterials.map((material) => {
                                const itemStock = materialStock(material.id, material.variantKey);
                                const available = itemStock.available > 0;
                                return (
                                  <button
                                    key={material.id}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      updatePiece(piece.id, {
                                        materialId: material.id,
                                        materialVariantKey: material.variantKey,
                                        materialLine: material.materialLine,
                                        materialType: material.materialType,
                                        thicknessLabel: material.thicknessLabel,
                                        texture: material.texture,
                                        provider: material.provider,
                                      });
                                      setPieceMaterialSearch((current) => ({...current, [piece.id]: material.name}));
                                      setPieceMaterialPickerOpen((current) => ({...current, [piece.id]: false}));
                                    }}
                                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-brand-primary/10', piece.materialId === material.id ? 'bg-brand-primary text-[#3F3A34] hover:bg-brand-primary' : 'text-slate-700')}
                                  >
                                    <div className={cn('h-12 w-12 shrink-0 overflow-hidden rounded-xl border', piece.materialId === material.id ? 'border-white/30 bg-white/15' : 'border-slate-100 bg-slate-50')}>
                                      {imageVariantUrl(material, 'thumbnail') ? <img src={imageVariantUrl(material, 'thumbnail')} alt={material.name} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase text-slate-300">Sem foto</div>}
                                    </div>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate">{material.name}</span>
                                      <span className={cn('block text-[11px] font-medium', piece.materialId === material.id ? 'text-[#5F5549]' : 'text-slate-400')}>
                                        {formatMaterialSpecs(material) || material.category || 'Sem categoria'}
                                      </span>
                                    </span>
                                    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase', available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600', piece.materialId === material.id && 'bg-white/20 text-[#3F3A34]')}>
                                      <span className={cn('h-2 w-2 rounded-full', available ? 'bg-green-500' : 'bg-red-500')} />
                                      {available ? 'Disponível' : 'Indisponível'}
                                    </span>
                                  </button>
                                );
                              })}
                              {filteredPieceMaterials.length === 0 ? <div className="px-3 py-3 text-sm font-semibold text-slate-400">Nenhum material encontrado.</div> : null}
                            </div>
                          )}
                        </div>
                        <div className={cn('rounded-2xl px-4 py-3 text-[11px] font-bold uppercase tracking-wide', !hasMaterial ? 'bg-slate-100 text-slate-500' : hasEnoughStock ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
                          {!hasMaterial ? 'Selecione um material para validar o estoque' : hasEnoughStock ? `m² suficiente: ${formatArea(stock.available)} disponível` : `m² insuficiente: precisa ${formatArea(pieceArea)} e há ${formatArea(stock.available)}`}
                        </div>
                        {hasMaterial && hasEnoughStock && lotInfo ? (
                          <div className={cn('rounded-2xl px-4 py-3 text-[11px] font-bold uppercase tracking-wide', lotInfo.canUseSingleLot ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>
                            {lotInfo.canUseSingleLot
                              ? `Mesmo lote: cabe na chapa ${lotInfo.singleLot?.code || 'sem lote'} (${formatArea(lotInfo.singleLot?.availableArea || 0)})`
                              : `Lotes diferentes: precisa combinar ${lotInfo.lotCountNeeded || 2} chapas para ${formatArea(pieceArea)}`}
                          </div>
                        ) : null}
                        {hasMaterial && !hasEnoughStock ? (
                          <div className="rounded-2xl bg-red-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-red-600">
                            Não há lote suficiente para esta peça.
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {isDrawEditor ? (
                      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
                          <div>
                            {piece.previewUrl ? (
                              <button type="button" onClick={() => setShowDrawing(piece.id)} className="group relative block w-full overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-2 text-left transition-all hover:border-brand-primary/30 hover:bg-white">
                                <img src={piece.previewUrl} alt={piece.name} className="aspect-square w-full rounded-[18px] object-contain" />
                                <div className="absolute inset-0 flex items-center justify-center rounded-[24px] bg-brand-primary/0 opacity-0 transition-all group-hover:bg-brand-primary/10 group-hover:opacity-100">
                                  <PenTool className="h-5 w-5 text-brand-primary" />
                                </div>
                                <div className="absolute bottom-4 right-4 h-3 w-3 rounded-full border-2 border-white bg-green-500 shadow-sm" title="Desenho técnico disponível" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setShowDrawing(piece.id)}
                                className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-all hover:border-brand-primary/20 hover:bg-white hover:text-brand-primary"
                              >
                                <Pencil className="h-8 w-8 opacity-50" />
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{LABELS.pieces.draw}</span>
                              </button>
                            )}
                          </div>
                          <div className="space-y-5">
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Desenho da peça</div>
                              <h3 className="mt-2 font-display text-lg font-bold text-slate-900">Abra ou atualize a geometria</h3>
                              <p className="mt-2 text-sm text-slate-500">O desenho continua usando o mesmo canvas, a mesma persistência e os mesmos cálculos já existentes.</p>
                              <button
                                type="button"
                                onClick={() => setShowDrawing(piece.id)}
                                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-4 py-2 text-sm font-bold text-[#3F3A34] transition-all hover:bg-brand-primary/90"
                              >
                                <PenTool className="h-4 w-4" />
                                {piece.previewUrl ? 'Editar desenho' : 'Desenhar peça'}
                              </button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Área calculada</div>
                                <div className="mt-2 font-mono text-base font-bold text-slate-900">{formatMeasure(pieceArea)}</div>
                                {drawingArea > 0 ? <div className="mt-2 text-[11px] font-semibold text-emerald-700">Valor vindo do desenho técnico.</div> : null}
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Maior lado</div>
                                <div className="mt-2 font-mono text-base font-bold text-slate-900">{effectiveLongestSide > 0 ? formatCentimeters(effectiveLongestSide) : '-'}</div>
                                <div className="mt-2 text-[11px] font-semibold text-slate-500">Usado no cálculo da mão de obra linear.</div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Largura do desenho</div>
                                <div className="mt-2 font-mono text-base font-bold text-slate-900">{pieceDimensions.major > 0 ? formatCentimeters(pieceDimensions.major) : '-'}</div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Profundidade do desenho</div>
                                <div className="mt-2 font-mono text-base font-bold text-slate-900">{pieceDimensions.minor > 0 ? formatCentimeters(pieceDimensions.minor) : '-'}</div>
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Comp. (cm)</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={pieceMeasureInputs[pieceMeasureInputKey(piece.id, 'length')] || formatMeasureInput(piece.length)}
                                  onFocus={(event) => {
                                    handlePieceMeasureInputFocus(piece.id, 'length', piece.length);
                                    event.currentTarget.select();
                                  }}
                                  onChange={(e) => handlePieceMeasureInputChange(piece.id, 'length', e.target.value)}
                                  onBlur={() => handlePieceMeasureInputBlur(piece, 'length')}
                                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Largura (cm)</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={pieceMeasureInputs[pieceMeasureInputKey(piece.id, 'width')] || formatMeasureInput(piece.width)}
                                  onFocus={(event) => {
                                    handlePieceMeasureInputFocus(piece.id, 'width', piece.width);
                                    event.currentTarget.select();
                                  }}
                                  onChange={(e) => handlePieceMeasureInputChange(piece.id, 'width', e.target.value)}
                                  onBlur={() => handlePieceMeasureInputBlur(piece, 'width')}
                                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    {isManualEditor ? (
                      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="space-y-5">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Medidas prontas</div>
                            <h3 className="mt-2 font-display text-lg font-bold text-slate-900">Informe somente os dados finais</h3>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1 sm:col-span-2">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Área final da peça (m²)</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={pieceMeasureInputs[pieceManualAreaInputKey(piece.id)] || (piece.manualFinalArea == null ? '' : formatMeasureInput(piece.manualFinalArea))}
                                onFocus={(event) => {
                                  handlePieceManualAreaFocus(piece.id, piece.manualFinalArea);
                                  event.currentTarget.select();
                                }}
                                onChange={(e) => handlePieceManualAreaChange(piece.id, e.target.value)}
                                onBlur={() => handlePieceManualAreaBlur(piece)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                                placeholder="0,000"
                              />
                              <div className="text-[11px] font-semibold text-slate-500">
                                O m² informado passa a ser a área oficial desta peça no orçamento.
                              </div>
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Maior lado da peça (cm)</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={pieceMeasureInputs[pieceManualLongestSideInputKey(piece.id)] || (piece.manualLongestSide == null ? '' : formatMeasureInput(piece.manualLongestSide))}
                                onFocus={(event) => {
                                  handlePieceManualLongestSideFocus(piece.id, piece.manualLongestSide);
                                  event.currentTarget.select();
                                }}
                                onChange={(e) => handlePieceManualLongestSideChange(piece.id, e.target.value)}
                                onBlur={() => handlePieceManualLongestSideBlur(piece)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                                placeholder="0,0"
                              />
                              <div className="text-[11px] font-semibold text-slate-500">Usado para cálculo da mão de obra linear.</div>
                            </label>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Resumo das medidas</div>
                              <div className="mt-2 space-y-2 text-sm text-slate-700">
                                <div className="flex items-center justify-between gap-3">
                                  <span>Área em uso</span>
                                  <strong className="font-mono text-slate-900">{formatMeasure(pieceArea)}</strong>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span>Maior lado em uso</span>
                                  <strong className="font-mono text-slate-900">{effectiveLongestSide > 0 ? formatCentimeters(effectiveLongestSide) : '-'}</strong>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    {isStairEditor ? (
                      <section className="rounded-[28px] border border-amber-200 bg-white p-5 shadow-sm">
                        <div className="space-y-5">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-700">Escada</div>
                              <h3 className="mt-2 font-display text-lg font-bold text-slate-900">Parâmetros da escada</h3>
                              <p className="mt-2 text-sm text-slate-500">Os cálculos de piso, espelho, patamar e rodapé lateral continuam exatamente os mesmos.</p>
                            </div>
                            <select
                              value={piece.stair?.unit || 'cm'}
                              onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, unit: e.target.value as 'cm' | 'm'}})}
                              className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                            >
                              <option value="cm">cm</option>
                              <option value="m">m</option>
                            </select>
                          </div>
                          <div className="grid gap-3 md:grid-cols-4">
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Qtd. degraus</span>
                              <NumericInput min="0" value={piece.stair?.stepCount || 0} onValueChange={(value) => updatePiece(piece.id, {stair: {...piece.stair!, stepCount: value}})} decimals={0} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Largura degrau</span>
                              <NumericInput min="0" value={piece.stair?.stepWidth || 0} onValueChange={(value) => updatePiece(piece.id, {stair: {...piece.stair!, stepWidth: value}})} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Profundidade piso</span>
                              <NumericInput min="0" value={piece.stair?.treadDepth || 0} onValueChange={(value) => updatePiece(piece.id, {stair: {...piece.stair!, treadDepth: value}})} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Altura espelho</span>
                              <NumericInput min="0" value={piece.stair?.riserHeight || 0} onValueChange={(value) => updatePiece(piece.id, {stair: {...piece.stair!, riserHeight: value}})} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Qtd. patamares</span>
                              <NumericInput min="0" value={piece.stair?.landingCount || 0} onValueChange={(value) => updatePiece(piece.id, {stair: {...piece.stair!, landingCount: value}})} decimals={0} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Largura patamar</span>
                              <NumericInput min="0" value={piece.stair?.landingWidth || 0} onValueChange={(value) => updatePiece(piece.id, {stair: {...piece.stair!, landingWidth: value}})} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Profundidade patamar</span>
                              <NumericInput min="0" value={piece.stair?.landingDepth || 0} onValueChange={(value) => updatePiece(piece.id, {stair: {...piece.stair!, landingDepth: value}})} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Altura rodapé</span>
                              <NumericInput min="0" value={piece.stair?.baseboardHeight || 0} onValueChange={(value) => updatePiece(piece.id, {stair: {...piece.stair!, baseboardHeight: value}})} className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-mono outline-none" />
                            </label>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-slate-600">
                              <input type="checkbox" checked={Boolean(piece.stair?.leftBaseboard)} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, leftBaseboard: e.target.checked}})} className="h-4 w-4 accent-brand-primary" />
                              Rodapé esquerdo
                            </label>
                            <label className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-slate-600">
                              <input type="checkbox" checked={Boolean(piece.stair?.rightBaseboard)} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, rightBaseboard: e.target.checked}})} className="h-4 w-4 accent-brand-primary" />
                              Rodapé direito
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Pisos</div><div className="mt-2 font-mono font-bold text-slate-900">{formatArea(stairDetails.treadArea)}</div></div>
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Espelhos</div><div className="mt-2 font-mono font-bold text-slate-900">{formatArea(stairDetails.riserArea)}</div></div>
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Patamar</div><div className="mt-2 font-mono font-bold text-slate-900">{formatArea(stairDetails.landingArea)}</div></div>
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Rodapé</div><div className="mt-2 font-mono font-bold text-slate-900">{formatArea(stairDetails.baseboardArea)}</div></div>
                            <div className="rounded-2xl bg-brand-primary px-4 py-3 text-sm text-[#3F3A34]"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5F5549]">Total escada</div><div className="mt-2 font-mono font-bold">{formatArea(stairDetails.totalArea)}</div></div>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Preço da peça</div>
                            <h3 className="mt-2 font-display text-lg font-bold text-slate-900">Automático ou manual</h3>
                            <p className="mt-2 text-sm text-slate-500">O cálculo permanece exatamente o mesmo; este bloco só organiza melhor a entrada visual.</p>
                          </div>
                          <div className="flex rounded-xl bg-slate-100 p-1">
                            <button
                              type="button"
                              onClick={() => updatePiece(piece.id, {pricingMode: 'automatic', manualPrice: undefined})}
                              className={cn('px-4 py-2 text-[10px] font-bold uppercase rounded-lg transition-all', (piece.pricingMode || 'automatic') === 'automatic' ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-400')}
                            >
                              Automático
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePiece(piece.id, {pricingMode: 'manual'})}
                              className={cn('px-4 py-2 text-[10px] font-bold uppercase rounded-lg transition-all', piece.pricingMode === 'manual' ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-400')}
                            >
                              Manual
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Valor em uso</div>
                            <div className="mt-2 font-mono text-lg font-bold text-slate-900">
                              {formatCurrency(basePiecePricingBreakdowns[pIdx]?.pieceSubtotalValue || 0)}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                            <label className="block space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Valor manual da peça</span>
                              <CurrencyInput
                                value={pieceManualPriceInputs[piece.id] || ''}
                                onValueChange={(_, rawValue) => updatePieceManualPriceInput(piece.id, rawValue)}
                                onBlur={() => formatPieceManualPriceInput(piece.id)}
                                disabled={(piece.pricingMode || 'automatic') !== 'manual'}
                                placeholder="R$ 0,00"
                                className={cn(
                                  'w-full rounded-2xl border bg-white px-4 py-3 text-sm font-mono outline-none transition-all focus:ring-2',
                                  (piece.pricingMode || 'automatic') !== 'manual'
                                    ? 'cursor-not-allowed border-slate-100 text-slate-400'
                                    : pieceManualPriceErrors[piece.id]
                                      ? 'border-red-300 text-red-700 focus:ring-red-100'
                                      : 'border-slate-200 text-slate-900 focus:ring-brand-primary/20',
                                )}
                              />
                            </label>
                            <div className={cn('mt-2 text-[11px] font-semibold', pieceManualPriceErrors[piece.id] ? 'text-red-600' : 'text-slate-500')}>
                              {pieceManualPriceErrors[piece.id] || ((piece.pricingMode || 'automatic') === 'manual'
                                ? 'Esse valor manual substitui o cálculo automático desta peça.'
                                : 'Ative o modo manual para digitar um valor personalizado para esta peça.')}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Complexidade da peça</div>
                              <p className="mt-1 text-sm text-slate-500">Incide somente sobre o subtotal próprio desta peça.</p>
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                              {formatCurrency(pieceCutoutBreakdown?.complexityValue || 0)}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {activeComplexityOptions.map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => updatePiece(piece.id, {complexityKey: option.key})}
                                className={cn(
                                  'flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all',
                                  (piece.complexityKey || activeComplexityOptions.find((item) => Number(item.percent || 0) === 0)?.key) === option.key
                                    ? 'border-brand-primary bg-white text-brand-primary shadow-sm'
                                    : 'border-slate-100 bg-white text-slate-700 hover:border-brand-primary/30',
                                )}
                              >
                                <span>{option.label}</span>
                                <span>{option.percent > 0 ? '+' : ''}{formatPercentage(option.percent)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    {isManualEditor ? (
                    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Recortes</div>
                            <h3 className="mt-2 font-display text-lg font-bold text-slate-900">Serviços adicionais da peça</h3>
                            <p className="mt-2 text-sm text-slate-500">Os preços continuam vindo do catálogo oficial já carregado no orçamento.</p>
                          </div>
                          <select
                            value=""
                            onChange={(event) => {
                              const selectedType = event.target.value as PieceScopedCutoutType;
                              if (!selectedType) return;
                              const existingRow = pieceScopedCutouts.find((item) => item.label === getCutoutLabel(selectedType));
                              const nextQuantity = existingRow ? existingRow.count + 1 : 1;
                              updatePieceManualCutoutQuantity(piece, selectedType, nextQuantity);
                              event.currentTarget.value = '';
                            }}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 outline-none md:w-[220px]"
                          >
                            <option value="">+ Adicionar recorte</option>
                            {cutoutCatalog
                              .filter((item) => !pieceScopedCutouts.some((row) => row.label === item.label))
                              .map((item) => (
                                <option key={item.type} value={item.type}>
                                  {item.label}
                                </option>
                              ))}
                          </select>
                        </div>

                        {pieceScopedCutouts.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                            Nenhum recorte adicionado nesta peça.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {pieceScopedCutouts.map((row) => {
                              const cutoutType = cutoutCatalog.find((item) => item.label === row.label)?.type;
                              if (!cutoutType) return null;
                              return (
                                <div key={row.label} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900">{row.label}</div>
                                    <div className="text-xs text-slate-500">{row.count} un. · {formatCurrency(row.price)} por unidade</div>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                                    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white">
                                      <button
                                        type="button"
                                        onClick={() => updatePieceManualCutoutQuantity(piece, cutoutType, row.count - 1)}
                                        className="px-3 py-2 text-sm font-bold text-slate-500 transition-colors hover:text-slate-900"
                                      >
                                        -
                                      </button>
                                      <span className="min-w-[40px] px-2 text-center text-sm font-semibold text-slate-900">{row.count}</span>
                                      <button
                                        type="button"
                                        onClick={() => updatePieceManualCutoutQuantity(piece, cutoutType, row.count + 1)}
                                        className="px-3 py-2 text-sm font-bold text-slate-500 transition-colors hover:text-slate-900"
                                      >
                                        +
                                      </button>
                                    </div>
                                    <div className="min-w-[88px] text-right text-sm font-semibold text-slate-900">
                                      {formatCurrency(row.count * row.price)}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => updatePieceManualCutoutQuantity(piece, cutoutType, 0)}
                                      className="rounded-xl p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500"
                                      aria-label={`Remover ${row.label}`}
                                      title={`Remover ${row.label}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                              <span className="font-semibold text-slate-600">Subtotal de recortes da peça</span>
                              <strong className="font-mono text-slate-900">{formatCurrency(pieceScopedCutoutTotal)}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                    ) : null}
                  </div>
                </div>
                )}
                {pieceEditorMode === null ? (
                  <div className="border-t border-slate-200 bg-white/95 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={cancelPieceEditor}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-slate-200 bg-white/95 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Área</div>
                          <div className="mt-2 font-mono font-bold text-slate-900">{formatMeasure(pieceArea)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Material</div>
                          <div className="mt-2 truncate font-semibold text-slate-900">{pieceMaterial?.name || 'Sem material'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Valor da peça</div>
                          <div className="mt-2 font-mono font-bold text-slate-900">{formatCurrency(pieceCutoutBreakdown?.pieceSubtotalValue || 0)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Recortes</div>
                          <div className="mt-2 font-mono font-bold text-slate-900">{formatCurrency(pieceScopedCutoutTotal)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                      {!pieceEditorIsNew ? (
                        <button
                          type="button"
                          onClick={() => {
                            removePiece(piece.id);
                            closePieceEditor();
                          }}
                          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition-all hover:bg-red-100"
                        >
                          Excluir
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={cancelPieceEditor}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={savePieceEditor}
                        className="rounded-2xl bg-brand-primary px-4 py-2 text-sm font-bold text-[#3F3A34] transition-all hover:bg-brand-primary/90"
                      >
                        {pieceEditorIsNew ? 'Adicionar peça' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
                </div>
              </div>
              );
            })}
          </div>

          <section className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm space-y-4 sm:rounded-[32px] sm:p-6 lg:p-8">
            <h2 className="font-display font-bold text-xl text-slate-800">Observações Comerciais</h2>
            <textarea 
              value={commercialNotes}
              onChange={(e) => setCommercialNotes(e.target.value)}
              placeholder="Informações sobre entrega, instalação, etc..."
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all min-h-[120px]"
            />
          </section>
        </div>
      </div>

      {showDrawing && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 p-2 backdrop-blur-md overscroll-contain sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex min-h-[calc(100svh-16px)] w-full max-w-5xl flex-col rounded-[28px] bg-white shadow-2xl sm:h-[90vh] sm:min-h-0 sm:rounded-[40px]">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Desenho Técnico</h3>
                <p className="text-slate-400 text-sm">Peça: {pieces.find(p => p.id === showDrawing)?.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
                <button
                  id={`save-continue-drawing-${showDrawing}`}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3 text-sm font-bold text-brand-primary transition-all hover:bg-brand-primary/10 sm:px-5"
                >
                  <Plus className="w-4 h-4" />
                  Salvar e continuar
                </button>
                <button
                  id={`save-drawing-${showDrawing}`}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-bold text-[#3F3A34] shadow-lg shadow-brand-primary/20 transition-all hover:bg-brand-primary/90 sm:px-5"
                >
                  <Save className="w-4 h-4" />
                  Salvar peça
                </button>
                <button
                  onClick={() => setShowDrawing(null)}
                  className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full transition-all text-slate-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-2 sm:p-8">
              <DrawingCanvas 
                initialJson={pieces.find(p => p.id === showDrawing)?.drawingJson}
                initialSides={pieces.find(p => p.id === showDrawing)?.sides}
                initialCutouts={pieces.find(p => p.id === showDrawing)?.cutouts}
                saveButtonId={`save-drawing-${showDrawing}`}
                saveAndContinueButtonId={`save-continue-drawing-${showDrawing}`}
                fixtureCatalog={fixtureCatalog}
                settings={settings}
                onSave={({ json, area, previewUrl, sides, largestSide, smallestSide, cutouts: drawingCutouts }) => {
                  applyDrawingToPiece(showDrawing, {
                    json,
                    area,
                    previewUrl,
                    sides,
                    largestSide,
                    smallestSide,
                    cutouts: drawingCutouts,
                  });
                  setShowDrawing(null);
                }}
                onSaveAndContinue={({ json, area, previewUrl, sides, largestSide, smallestSide, cutouts: drawingCutouts }) => {
                  saveDrawingAndContinue(showDrawing, {
                    json,
                    area,
                    previewUrl,
                    sides,
                    largestSide,
                    smallestSide,
                    cutouts: drawingCutouts,
                  });
                }}
                onCancel={() => setShowDrawing(null)}
                className="h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const X = ({ className }: any) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
