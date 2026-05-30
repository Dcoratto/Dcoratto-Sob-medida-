import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, Timestamp, onSnapshot, query, selectFields } from '../lib/firestore';
import { db } from '../lib/firestore';
import { useSettings } from '../hooks/useSettings';
import { Client, CondominiumRule, EmployeeAssignment, FixtureCatalogItem, FixtureCategory, InventoryItem, InventoryReservation, Material, PieceSide, Quote, QuoteMaterialPriceOverride, QuotePiece, QuoteStatus, QuoteStatusHistory } from '../types';
import { useQuoteCalculator } from '../hooks/useQuoteCalculator';
import {
  ArrowLeft, Save, Plus, Trash2, Pencil,
  ChevronDown, ChevronUp, Calculator,
  MapPin, Phone, User,
  Layers, PenTool
} from 'lucide-react';
import { cn, formatArea, formatCentimeters, formatCurrency, formatMeasure, formatMeasureInput, parseCurrencyInput, parseMeasureInput, roundNumber } from '../lib/utils';
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
import {getPieceMajorMinorSides} from '../lib/pieceDimensions';
import {getInventoryItemArea} from '../lib/inventoryMetrics';
import {buildPiecePricingBreakdowns} from '../lib/quotePiecePricing';
import {LABELS} from '../constants/labels';
import {imageVariantUrl} from '../lib/storage';

type QuoteCutoutState = { cooktop: number; sinkUnder: number; sinkOver: number; faucetHole: number; trashBinCutout: number; popUpTowerCutout: number; wetAreaAmericanRecess: number; wetAreaItalianRecess: number };

const MATERIAL_PRICE_MINIMUM_ERROR = 'O valor personalizado não pode ser menor que o valor mínimo definido para este material.';

const quoteMaterialPriceKey = (materialId?: string, materialVariantKey?: string) =>
  `${materialId || ''}::${materialVariantKey || ''}`;

const formatPriceInputValue = (value: number) =>
  (Number.isFinite(value) ? value : 0).toFixed(2).replace('.', ',');

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
  const { user, profile, appUid } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quoteDraftRecovered, setQuoteDraftRecovered] = useState(false);
  const [quoteDraftSavedAt, setQuoteDraftSavedAt] = useState<string | null>(null);

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
  const [negotiationDiscountPercent, setNegotiationDiscountPercent] = useState('');
  const [rtPercent, setRtPercent] = useState('');
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
  const [cutouts, setCutouts] = useState<QuoteCutoutState>({ cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0, trashBinCutout: 0, popUpTowerCutout: 0, wetAreaAmericanRecess: 0, wetAreaItalianRecess: 0 });
  const [showDrawing, setShowDrawing] = useState<string | null>(null);
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignment[]>([]);
  const [statusHistory, setStatusHistory] = useState<QuoteStatusHistory[]>([]);
  const [fixtureCatalog, setFixtureCatalog] = useState<FixtureCatalogItem[]>([]);
  const [quotePricingMode, setQuotePricingMode] = useState<'sale' | 'cost'>('sale');
  const quoteDraftHydratedRef = useRef(false);
  const quoteDraftKey = `quote-editor-draft:${appUid || 'anonymous'}:${id || 'new'}`;

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
  const { calculatePieceArea, calculateSculptedSink, calculateStairArea } = useQuoteCalculator(settings, (piece) => materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey));
  const currentUserName = profile?.name || user?.user_metadata?.name || user?.email || 'Usuário';
  
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

  const totalMethodAdjustment = settings.paymentMethods.find(m => m.name === totalPaymentMethod)?.adjustment || 0;
  const remainingMethodAdjustment = settings.paymentMethods.find(m => m.name === remainingPaymentMethod)?.adjustment || 0;
  const totalArea = pieces.reduce((acc, p) => acc + calculatePieceArea(p).totalArea, 0);
  const pieceAreaDetails = pieces.map((piece) => ({piece, totals: calculatePieceArea(piece), material: materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey)}));
  const basePiecePricingBreakdowns = useMemo(
    () => buildPiecePricingBreakdowns({
      pieces,
      quoteCutouts: cutouts,
      settings,
      calculatePieceArea,
      resolveMaterialPricePerM2: (piece) => materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey)?.pricePerM2 || 0,
      includeLabor: quotePricingMode !== 'cost',
      resolveManualPiecePrice: (piece) => {
        if ((piece.pricingMode || 'automatic') !== 'manual') return undefined;
        const parsed = parseQuoteMaterialPriceInput(pieceManualPriceInputs[piece.id] || '');
        return parsed.status === 'valid' ? Number(parsed.value) : undefined;
      },
    }),
    [calculatePieceArea, cutouts, materialId, pieceManualPriceInputs, pieces, quotePricingMode, settings],
  );
  const stonesCost = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.stoneBaseValue, 0);
  const materialLossCost = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.materialLossValue, 0);
  const laborCost = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.laborValue, 0);
  const cutoutsCost = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.cutoutValue, 0);
  const sculptedLaborCost = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.sinkAdditionalValue, 0);
  const subtotalBeforeAdjustment = basePiecePricingBreakdowns.reduce((acc, item) => acc + item.pieceSubtotalValue, 0);
  const normalizedEntryAmount = Math.min(Math.max(Number(entryAmount) || 0, 0), subtotalBeforeAdjustment);
  const financedAmount = Math.max(0, subtotalBeforeAdjustment - normalizedEntryAmount);
  const selectedPaymentAdjustment = paymentMode === 'entry' ? remainingMethodAdjustment : totalMethodAdjustment;
  const adjustmentBase = paymentMode === 'entry' ? financedAmount : subtotalBeforeAdjustment;
  const adjustmentValue = adjustmentBase * (selectedPaymentAdjustment / 100);
  const paymentAdjustedTotal = subtotalBeforeAdjustment + adjustmentValue;
  const normalizedNegotiationDiscountPercent = Math.max(0, Number(negotiationDiscountPercent) || 0);
  const normalizedRtPercent = Math.max(0, Number(rtPercent) || 0);
  const negotiationDiscountValue = paymentAdjustedTotal * (normalizedNegotiationDiscountPercent / 100);
  const rtValue = paymentAdjustedTotal * (normalizedRtPercent / 100);
  const totalPrice = paymentAdjustedTotal - negotiationDiscountValue + rtValue;
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


  useEffect(() => {
    let cancelled = false;
    let subscribeTimer: number | undefined;
    let unsubClients = () => {};
    let unsubCondominiums = () => {};
    let unsubMaterials = () => {};
    let unsubInventory = () => {};
    let unsubReservations = () => {};
    let unsubFixtureCatalog = () => {};

    const subscribeAuxiliaryData = () => {
      if (cancelled) return;
      unsubClients = onSnapshot(query(
        collection(db, 'clients'),
        selectFields('name', 'phone', 'email', 'cpf', 'rg', 'address', 'streetAddress', 'city', 'condominiumId', 'condominiumName', 'neighborhood', 'zipCode', 'addressType', 'block', 'lot', 'tower', 'apartmentNumber'),
      ), (snap) => {
        setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      });

      unsubCondominiums = onSnapshot(query(
        collection(db, 'condominiums'),
        selectFields('name', 'city', 'allowedWeekdays', 'blockNationalHolidays', 'blockCityHolidays'),
      ), (snap) => {
        setCondominiums(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CondominiumRule)));
      });

      unsubMaterials = onSnapshot(query(
        collection(db, 'materials'),
        selectFields('name', 'provider', 'category', 'materialLine', 'materialType', 'thicknessLabel', 'texture', 'imageUrl', 'thumbnailUrl', 'mediumUrl', 'originalUrl', 'pricePerM2', 'baseCostPerM2', 'baseMinimumSalePerM2', 'active'),
      ), (snap) => {
        setMaterials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
      });

      unsubInventory = onSnapshot(query(
        collection(db, 'inventory'),
        selectFields('materialId', 'materialName', 'provider', 'category', 'materialLine', 'materialType', 'thicknessLabel', 'texture', 'area', 'cost', 'minimumSalePrice', 'status', 'photoUrl', 'thumbnailUrl', 'mediumUrl', 'originalUrl'),
      ), (snap) => {
        setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      });

      unsubReservations = onSnapshot(query(
        collection(db, 'inventoryReservations'),
        selectFields('quoteId', 'materialId', 'materialVariantKey', 'materialLine', 'materialType', 'thicknessLabel', 'texture', 'provider', 'materialName', 'area', 'quoteStatus', 'clientName'),
      ), (snap) => {
        setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryReservation)));
      });
      unsubFixtureCatalog = onSnapshot(query(
        collection(db, 'fixtureCatalog'),
        selectFields('name', 'category', 'brand', 'model', 'width', 'depth', 'height', 'diameter', 'imageUrl', 'thumbnailUrl', 'mediumUrl', 'originalUrl', 'notes', 'active'),
      ), (snap) => {
        setFixtureCatalog(
          snap.docs.map((doc) => normalizeFixtureCatalogItem({ id: doc.id, ...doc.data() } as FixtureCatalogItem)),
        );
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
      setEntryAmount(String(draft.entryAmount || ''));
      setNegotiationDiscountPercent(String(draft.negotiationDiscountPercent || ''));
      setRtPercent(String(draft.rtPercent || ''));
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
      setMaterialCustomPriceInputs((draft.materialCustomPriceInputs as Record<string, string>) || inputValuesFromMaterialOverrides(draft.materialPriceOverrides as QuoteMaterialPriceOverride[]));
      setPieceManualPriceInputs((draft.pieceManualPriceInputs as Record<string, string>) || inputValuesFromPieceManualPrices(draftPieces));
      setCutouts((draft.cutouts as QuoteCutoutState) || { cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0, trashBinCutout: 0, popUpTowerCutout: 0, wetAreaAmericanRecess: 0, wetAreaItalianRecess: 0 });
      setEmployeeAssignments(Array.isArray(draft.employeeAssignments) ? draft.employeeAssignments as EmployeeAssignment[] : []);
      setStatusHistory(Array.isArray(draft.statusHistory) ? draft.statusHistory as QuoteStatusHistory[] : []);
      setPieceMaterialSearch((draft.pieceMaterialSearch as Record<string, string>) || {});
    };

    // If editing, fetch initial quote
    const fetchQuote = async () => {
      if (id) {
        const docRef = doc(db, 'quotes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as unknown as Quote;
          setClientId(data.clientId);
          setClientSearch(data.clientName || '');
          setEnvironment(data.environment);
          setResponsible(data.responsible);
          setMaterialId(data.materialId);
          setPaymentMethod(data.paymentMethod);
          setPaymentMode(data.paymentMode || (data.remainingPaymentMethod || data.entryAmount ? 'entry' : 'total'));
          setTotalPaymentMethod(data.totalPaymentMethod || data.paymentMethod || '');
          setRemainingPaymentMethod(data.remainingPaymentMethod || '');
          setEntryAmount(data.entryAmount ? String(data.entryAmount) : '');
          setNegotiationDiscountPercent(data.negotiationDiscountPercent ? String(data.negotiationDiscountPercent) : '');
          setRtPercent(data.rtPercent ? String(data.rtPercent) : '');
          setDeliveryDays(data.deliveryDays);
          setMeasurementDate(formatDateInput(data.measurementDate));
          setDeliveryDate(formatDateInput(data.deliveryDate));
          setValidityDays(15); // Adjust if needed
          setCommercialNotes(data.commercialNotes || '');
          setStatus(normalizeQuoteStatus(data.status));
          setOriginalStatus(normalizeQuoteStatus(data.status));
          setQuotePricingMode(data.pricingMode || 'sale');
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
            cooktop: data.cutouts?.cooktop || 0,
            sinkUnder: data.cutouts?.sinkUnder || 0,
            sinkOver: data.cutouts?.sinkOver || 0,
            faucetHole: data.cutouts?.faucetHole || 0,
            trashBinCutout: data.cutouts?.trashBinCutout || 0,
            popUpTowerCutout: data.cutouts?.popUpTowerCutout || 0,
            wetAreaAmericanRecess: data.cutouts?.wetAreaAmericanRecess || 0,
            wetAreaItalianRecess: data.cutouts?.wetAreaItalianRecess || 0,
          });
        }
      }
      const {data: draft, savedAt} = loadDraftMeta<Record<string, unknown>>(quoteDraftKey);
      setQuoteDraftRecovered(Boolean(draft));
      setQuoteDraftSavedAt(savedAt);
      applyDraft(draft);
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
  }, [id, quoteDraftKey]);

  useEffect(() => {
    if (!id && !responsible && currentUserName !== 'Usuário') {
      setResponsible(currentUserName);
    }
  }, [currentUserName, id, responsible]);

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
      negotiationDiscountPercent,
      rtPercent,
      deliveryDays,
      measurementDate,
      deliveryDate,
      validityDays,
      pricingMode: quotePricingMode,
      commercialNotes,
      status,
      originalStatus,
      pieces,
      materialCustomPriceInputs,
      pieceManualPriceInputs,
      cutouts,
      employeeAssignments,
      statusHistory,
      pieceMaterialSearch,
    });
    if (savedAt) setQuoteDraftSavedAt(savedAt);
  }, [clientId, clientSearch, commercialNotes, cutouts, deliveryDate, deliveryDays, employeeAssignments, entryAmount, environment, loading, materialCustomPriceInputs, materialId, measurementDate, negotiationDiscountPercent, originalStatus, paymentMethod, paymentMode, pieceManualPriceInputs, pieceMaterialSearch, pieces, quoteDraftKey, quotePricingMode, remainingPaymentMethod, responsible, rtPercent, status, statusHistory, totalPaymentMethod, validityDays]);

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

  const addPiece = (asStair = false) => {
    const newPiece: QuotePiece = {
      id: Math.random().toString(36).substr(2, 9),
      name: asStair ?`Escada ${pieces.filter((piece) => piece.stair?.active).length + 1}` : `${LABELS.pieces.singular} ${pieces.length + 1}`,
      pieceStatus: status,
      pricingMode: 'automatic',
      materialId: '',
      unit: 'cm',
      width: 0,
      length: 0,
      area: 0,
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
      stair: asStair ?defaultStairConfig() : {active: false, unit: 'cm', stepCount: 0, stepWidth: 0, treadDepth: 0, riserHeight: 0, landingCount: 0, landingWidth: 0, landingDepth: 0, leftBaseboard: false, rightBaseboard: false, baseboardHeight: 10}
    };
    setPieces([...pieces, newPiece]);
  };

  const countCutouts = (drawingCutouts?: QuotePiece['cutouts']): QuoteCutoutState => {
    const counts: QuoteCutoutState = {cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0, trashBinCutout: 0, popUpTowerCutout: 0, wetAreaAmericanRecess: 0, wetAreaItalianRecess: 0};
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

  const removePiece = (id: string) => {
    const removedPiece = pieces.find((piece) => piece.id === id);
    if (removedPiece?.cutouts?.length) {
      applyCutoutDiff(removedPiece.cutouts, []);
    }
    setPieces(pieces.filter(p => p.id !== id));
    setPieceManualPriceInputs((current) => {
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

  const piecePricingBreakdowns = useMemo(
    () => buildPiecePricingBreakdowns({
      pieces,
      quoteCutouts: cutouts,
      totalQuotePrice: totalPrice,
      settings,
      calculatePieceArea,
      resolveMaterialPricePerM2: (piece) => materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey)?.pricePerM2 || 0,
      includeLabor: quotePricingMode !== 'cost',
      resolveManualPiecePrice: (piece) => {
        if ((piece.pricingMode || 'automatic') !== 'manual') return undefined;
        const parsed = parseQuoteMaterialPriceInput(pieceManualPriceInputs[piece.id] || '');
        return parsed.status === 'valid' ? Number(parsed.value) : undefined;
      },
    }),
    [calculatePieceArea, cutouts, materialId, pieceManualPriceInputs, pieces, quotePricingMode, settings, totalPrice],
  );
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

  const handleSave = async () => {
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
      alert(validationError);
      return;
    }
    if (quoteMaterialPriceError) {
      alert(quoteMaterialPriceError);
      return;
    }
    if (pieceManualPriceError) {
      alert(pieceManualPriceError);
      return;
    }
    setSaving(true);
    const firstAssigned = employeeAssignments.find((item) => item.employeeId);
    const primaryMaterialId = pieces[0]?.materialId || materialId || '';
    const primaryMaterialVariantKey = pieces[0]?.materialVariantKey;
    const primaryMaterial = materialWithQuotePrice(primaryMaterialId, primaryMaterialVariantKey);
    const piecesWithStatus = pieces.map((piece) => {
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
      negotiationDiscountPercent: normalizedNegotiationDiscountPercent,
      rtPercent: normalizedRtPercent,
      deliveryDays,
      validityDate: Timestamp.fromDate(new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)),
      commercialNotes,
      status,
      totalArea: normalizedTotalArea,
      totalPrice: normalizedTotalPrice,
      pricingMode: quotePricingMode,
      pieces: piecesWithStatus,
      cutouts,
      materialPriceOverrides,
      employeeAssignments,
      statusHistory: [...statusHistory, {
        status,
        changedAt: Timestamp.now(),
        changedByUid: appUid || '',
        changedByName: currentUserName,
        responsibleEmployeeId: firstAssigned?.employeeId || '',
        responsibleEmployeeName: firstAssigned?.employeeName || '',
      }],
      ...(id ?{} : {createdAt: Timestamp.now()}),
      createdBy: appUid || '',
    };

    try {
      if (id) {
        await setDoc(doc(db, 'quotes', id), quoteData, { merge: true });
        await applyQuoteInventoryByStatusTransition(id, originalStatus, status, quoteData);
        clearDraft(quoteDraftKey);
        setQuoteDraftRecovered(false);
        setQuoteDraftSavedAt(null);
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
      } else {
        const createdRef = await addDoc(collection(db, 'quotes'), quoteData);
        await applyQuoteInventoryByStatusTransition(createdRef.id, LABELS.quotes.singular, status, quoteData);
        clearDraft(quoteDraftKey);
        setQuoteDraftRecovered(false);
        setQuoteDraftSavedAt(null);
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
      setOriginalStatus(status);
      navigate('/quotes');
    } catch (err) {
      console.error('Erro ao salvar orçamento:', err);
      const errorMessage = [
        (err as {message?: string})?.message,
        (err as {details?: string})?.details,
        (err as {hint?: string})?.hint,
      ].filter(Boolean).join(' · ');
      window.alert(errorMessage ? `Não foi possível salvar este orçamento. ${errorMessage}` : 'Não foi possível salvar este orçamento agora. Tente novamente em instantes.');
    } finally {
      setSaving(false);
    }
  };

  if (settingsLoading) return <div>Carregando...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32">
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
          className="flex items-center gap-2 bg-brand-primary text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95 disabled:opacity-50"
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-8">
        {/* Left Column: Basic Info */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-brand-primary p-8 rounded-[32px] text-white shadow-xl shadow-brand-primary/30">
            <div className="flex items-center gap-2 mb-4 opacity-80">
              <Calculator className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Resumo do Total</span>
            </div>
            <div className="text-4xl font-display font-bold mb-2">
              {formatCurrency(totalPrice)}
            </div>
            <div className="space-y-2 text-sm font-medium text-white/75">
              <div className="flex justify-between gap-3"><span>Área final total</span><strong>{formatArea(totalArea)}</strong></div>
              <div className="flex justify-between gap-3"><span>Pedras</span><strong>{formatCurrency(stonesCost)}</strong></div>
              <div className="flex justify-between gap-3"><span>Perda material (10%)</span><strong>{formatCurrency(materialLossCost)}</strong></div>
              <div className="flex justify-between gap-3"><span>Mão de obra</span><strong>{formatCurrency(laborCost)}</strong></div>
              <div className="flex justify-between gap-3"><span>Recortes</span><strong>{formatCurrency(cutoutsCost)}</strong></div>
              <div className="flex justify-between gap-3"><span>Pia esculpida</span><strong>{formatCurrency(sculptedLaborCost)}</strong></div>
              <div className="flex justify-between gap-3 border-t border-white/15 pt-2"><span>Ajuste pagamento ({selectedPaymentAdjustment}%)</span><strong>{formatCurrency(adjustmentValue)}</strong></div>
              <div className="flex justify-between gap-3"><span>Negociação (-{normalizedNegotiationDiscountPercent}%)</span><strong>-{formatCurrency(negotiationDiscountValue)}</strong></div>
              <div className="flex justify-between gap-3"><span>RT (+{normalizedRtPercent}%)</span><strong>{formatCurrency(rtValue)}</strong></div>
            </div>
            <div className="mt-4 space-y-2 rounded-2xl bg-white/10 p-3 text-xs text-white/80">
              {pieceAreaDetails.map(({piece, totals, material}, index) => (
                (() => {
                  const pricing = piecePricingBreakdowns[index];
                  const baseStoneValue = pricing?.stoneBaseValue || 0;
                  const lossValue = pricing?.materialLossValue || 0;
                  const stoneValue = pricing?.stoneWithLossValue || 0;
                  const laborValue = pricing?.laborValue || 0;
                  const cutoutValue = pricing?.cutoutValue || 0;
                  const sinkAdditionalValue = pricing?.sinkAdditionalValue || 0;
                  const pieceTotalValue = pricing?.pieceFinalValue || 0;
                  const allocatedAdjustmentValue = pricing?.allocatedQuoteAdjustmentValue || 0;
                  const cutoutCount = pricing?.cutoutCount || 0;
                  const cutoutRows = pricing?.cutoutRows || [];
                  return (
                    <div key={piece.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-sm text-white">{piece.name}</div>
                          <div className="text-[11px] text-white/65">{material?.name || 'Sem material'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Total da peça</div>
                          <div className="font-bold text-sm text-white">{formatCurrency(pieceTotalValue)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-white/6 p-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-white/55">Pedra base</div>
                          <div className="mt-1 font-semibold text-white">{formatCurrency(baseStoneValue)}</div>
                        </div>
                        <div className="rounded-xl bg-amber-400/10 p-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-100/80">Perda 10%</div>
                          <div className="mt-1 font-semibold text-white">{formatCurrency(lossValue)}</div>
                        </div>
                        <div className="rounded-xl bg-white/6 p-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-white/55">Mão de obra</div>
                          <div className="mt-1 font-semibold text-white">{formatCurrency(laborValue)}</div>
                        </div>
                        <div className="rounded-xl bg-white/6 p-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-white/55">Recortes</div>
                          <div className="mt-1 font-semibold text-white">{formatCurrency(cutoutValue)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 opacity-80">
                        <span>Bancada: {formatArea(totals.mainArea)}</span>
                        <span>Cuba: {formatArea(totals.sinkArea || 0)}</span>
                        <span>Adicionais: {formatArea(totals.sidesArea + totals.recessArea)}</span>
                        <span>Perda: {formatArea(totals.lossArea || 0)}</span>
                        <span>Pedra com perda: {formatCurrency(stoneValue)}</span>
                        <span>Furos/recortes: {cutoutCount} un</span>
                        {sinkAdditionalValue > 0 && (
                          <span className="col-span-2">Adicional pia esculpida: {formatCurrency(sinkAdditionalValue)}</span>
                        )}
                        {allocatedAdjustmentValue !== 0 && (
                          <span className="col-span-2">Rateio ajustes do orçamento: {allocatedAdjustmentValue > 0 ? '+' : ''}{formatCurrency(allocatedAdjustmentValue)}</span>
                        )}
                        {cutoutCount > 0 && (
                          <span className="col-span-2">Detalhe recortes: {cutoutRows.map((item) => `${item.count} ${item.label}`).join(', ')}</span>
                        )}
                        <span className="col-span-2 border-t border-white/10 pt-2">Área final: {formatArea(totals.totalArea)}</span>
                      </div>
                    </div>
                  );
                })()
              ))}
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
                        className={cn('w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-brand-primary/10', clientId === client.id ? 'bg-brand-primary text-white hover:bg-brand-primary' : 'text-slate-700')}
                      >
                        <span className="block">{client.name}</span>
                        <span className={cn('text-[11px] font-medium', clientId === client.id ? 'text-white/80' : 'text-slate-400')}>{client.phone || client.email || 'Sem contato'}</span>
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <div className="px-3 py-3 text-sm font-semibold text-slate-400">Nenhum cliente encontrado.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

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
                <input
                  type="number"
                  value={deliveryDays}
                  onChange={(e) => setDeliveryDays(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Validade (dias)</label>
                <input
                  type="number"
                  value={validityDays}
                  onChange={(e) => setValidityDays(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-800">Modo de preço</h3>
                <p className="text-xs text-slate-500">No preço de custo, a mão de obra da peça sai do cálculo do orçamento.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setQuotePricingMode('sale')}
                  className={cn(
                    'rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all',
                    quotePricingMode === 'sale' ? 'bg-brand-primary text-white shadow-sm' : 'bg-white text-slate-600',
                  )}
                >
                  Preço de venda
                </button>
                <button
                  type="button"
                  onClick={() => setQuotePricingMode('cost')}
                  className={cn(
                    'rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all',
                    quotePricingMode === 'cost' ? 'bg-brand-primary text-white shadow-sm' : 'bg-white text-slate-600',
                  )}
                >
                  Preço de custo
                </button>
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
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.customInput}
                            onChange={(event) => updateMaterialCustomPriceInput(row.key, event.target.value)}
                            onBlur={() => formatMaterialCustomPriceInput(row.key)}
                            className={cn(
                              'w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-mono outline-none transition-all focus:ring-2',
                              row.error ? 'border-red-300 text-red-700 focus:ring-red-100' : isValidCustom ? 'border-green-200 text-slate-900 focus:ring-green-100' : 'border-slate-100 text-slate-900 focus:ring-brand-primary/20',
                            )}
                            placeholder="0,00"
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
                      paymentMode === 'total' ? 'bg-brand-primary text-white' : 'bg-white text-slate-600',
                    )}
                  >
                    Valor total
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('entry')}
                    className={cn(
                      'rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                      paymentMode === 'entry' ? 'bg-brand-primary text-white' : 'bg-white text-slate-600',
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
                      {settings.paymentMethods.filter((method) => method.name.trim()).map((method) => (
                        <option key={method.name} value={method.name}>{method.name} ({method.adjustment > 0 ? '+' : ''}{method.adjustment}%)</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Entrada</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={entryAmount}
                        onChange={(e) => setEntryAmount(e.target.value)}
                        placeholder="0,00"
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
                        {settings.paymentMethods.filter((method) => method.name.trim()).map((method) => (
                          <option key={method.name} value={method.name}>{method.name} ({method.adjustment > 0 ? '+' : ''}{method.adjustment}%)</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {(resolvedPaymentMethod || selectedPaymentAdjustment) && (
                  <div className="space-y-1 text-[11px] text-slate-500">
                    <div>Condição: {resolvedPaymentMethod || 'A definir'}</div>
                    <div>
                      Ajuste aplicado: {selectedPaymentAdjustment > 0 ? '+' : ''}{selectedPaymentAdjustment}% {paymentMode === 'entry' ? 'sobre o saldo restante' : 'sobre o valor total'}
                    </div>
                    {paymentMode === 'entry' && (
                      <div>
                        Entrada: {formatCurrency(normalizedEntryAmount)} · Restante: {formatCurrency(financedAmount)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Negociação (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={negotiationDiscountPercent}
                  onChange={(e) => setNegotiationDiscountPercent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm"
                  placeholder="Desconto"
                />
                <div className="text-[10px] font-semibold text-slate-400">Desconto no total</div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">RT (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rtPercent}
                  onChange={(e) => setRtPercent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm"
                  placeholder="Acréscimo"
                />
                <div className="text-[10px] font-semibold text-slate-400">Acréscimo no total</div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Pieces */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-display font-bold text-slate-900">{LABELS.pieces.quotePieces}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => addPiece(false)}
                className="flex items-center gap-2 text-brand-primary font-bold hover:underline"
              >
                <Plus className="w-5 h-5" /> {LABELS.pieces.add}
              </button>
              <button
                type="button"
                onClick={() => addPiece(true)}
                className="rounded-2xl bg-brand-primary px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-primary/90"
              >
                Adicionar Escada
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {pieces.length === 0 && (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[32px] text-center space-y-4">
                <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                <div className="text-slate-500 font-medium tracking-tight">Nenhuma peça adicionada ainda.</div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={() => addPiece(false)} className="text-brand-primary font-bold">Adicionar peça normal</button>
                  <button type="button" onClick={() => addPiece(true)} className="text-brand-primary font-bold">Adicionar escada</button>
                </div>
              </div>
            )}

            {pieces.map((piece, pIdx) => {
              const pieceArea = calculatePieceArea(piece).totalArea;
              const stairDetails = calculateStairArea(piece);
              const pieceMaterial = materialWithQuotePrice(piece.materialId, piece.materialVariantKey);
              const stock = piece.materialId ?materialStock(piece.materialId, piece.materialVariantKey) : {available: 0};
              const pieceDimensions = getPieceMajorMinorSides(piece);
              const hasMaterial = Boolean(piece.materialId);
              const hasEnoughStock = hasMaterial && stock.available >= pieceArea;
              const lotInfo = hasMaterial ?materialLotInfo(piece.materialId, pieceArea, piece.materialVariantKey) : null;
              const pieceWorkflowStatus = normalizeQuoteStatus(piece.pieceStatus || status);
              return (
              <div key={piece.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-slate-50/50 px-8 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-brand-primary text-white text-xs font-bold rounded-lg flex items-center justify-center">
                      {pIdx + 1}
                    </div>
                    <input 
                      type="text" 
                      value={piece.name}
                      onChange={(e) => updatePiece(piece.id, { name: e.target.value })}
                      className="bg-transparent font-display font-bold text-slate-800 outline-none focus:text-brand-primary transition-all w-48"
                    />
                    <div className="hidden md:flex rounded-xl bg-white p-1 border border-slate-100">
                      <button
                        type="button"
                        onClick={() => updatePiece(piece.id, {stair: {...(piece.stair || defaultStairConfig()), active: false}})}
                        className={cn('px-3 py-1 text-[10px] font-bold uppercase rounded-lg transition-all', !piece.stair?.active ?'bg-brand-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-700')}
                      >
                        Peça
                      </button>
                      <button
                        type="button"
                        onClick={() => updatePiece(piece.id, {stair: {...defaultStairConfig(), ...(piece.stair || {}), active: true}, sculptedSink: {...piece.sculptedSink, active: false} as any, wetAreaRecess: {...piece.wetAreaRecess, active: false} as any})}
                        className={cn('px-3 py-1 text-[10px] font-bold uppercase rounded-lg transition-all', piece.stair?.active ?'bg-brand-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-700')}
                      >
                        Escada
                      </button>
                    </div>
                    <div className={cn('hidden md:inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase', quoteStatusColor(pieceWorkflowStatus))}>
                      {pieceWorkflowStatus}
                    </div>
                  </div>
                  <button 
                    type="button"
                    aria-label={LABELS.pieces.remove}
                    title={LABELS.pieces.remove}
                    onClick={() => removePiece(piece.id)} 
                    className="p-2 text-slate-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  {/* Drawing Preview and Dimensions */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-1">
                      {piece.previewUrl ?(
                        <div className="relative group cursor-pointer" onClick={() => setShowDrawing(piece.id)}>
                          <img 
                            src={piece.previewUrl} 
                            alt={piece.name} 
                            className="w-full aspect-square object-contain bg-slate-50 rounded-2xl border border-slate-100 p-2" 
                          />
                          <div className="absolute inset-0 bg-brand-primary/0 group-hover:bg-brand-primary/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-2xl">
                            <PenTool className="w-5 h-5 text-brand-primary" />
                          </div>
                <div className="absolute bottom-2 right-2 bg-green-500 w-3 h-3 rounded-full border-2 border-white shadow-sm" title="Desenho técnico disponível" />
                        </div>
                      ) : (
                        <button 
                          onClick={() => setShowDrawing(piece.id)}
                          className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-brand-primary hover:border-brand-primary/20 hover:bg-white transition-all"
                        >
                          <Pencil className="w-8 h-8 opacity-50" />
                          <span className="text-[10px] uppercase font-bold tracking-widest">{LABELS.pieces.draw}</span>
                        </button>
                      )}
                    </div>

                    <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Medidas do desenho</div>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold text-slate-700">
                          <span>Largura: <span className="font-mono text-slate-900">{pieceDimensions.major > 0 ? formatCentimeters(pieceDimensions.major) : '-'}</span></span>
                          <span>Profundidade: <span className="font-mono text-slate-900">{pieceDimensions.minor > 0 ? formatCentimeters(pieceDimensions.minor) : '-'}</span></span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status da peça</label>
                        <select
                          value={pieceWorkflowStatus}
                          onChange={(e) => updatePiece(piece.id, {pieceStatus: normalizeQuoteStatus(e.target.value)})}
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                        >
                          {QUOTE_STATUSES.map((pieceStatus) => (
                            <option key={pieceStatus} value={pieceStatus}>{pieceStatus}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Material da peça</label>
                        <div className="relative">
                          <input
                            value={pieceMaterialSearch[piece.id] || pieceMaterial?.name || ''}
                            onFocus={() => setPieceMaterialPickerOpen((current) => ({...current, [piece.id]: true}))}
                            onChange={(e) => {
                              setPieceMaterialSearch((current) => ({...current, [piece.id]: e.target.value}));
                              updatePiece(piece.id, {materialId: '', materialVariantKey: undefined, materialLine: undefined, materialType: undefined, thicknessLabel: undefined, texture: undefined, provider: undefined});
                              setPieceMaterialPickerOpen((current) => ({...current, [piece.id]: true}));
                            }}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20"
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
                              {filteredMaterialsForPiece(piece.id).map((material) => {
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
                                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-brand-primary/10', piece.materialId === material.id ? 'bg-brand-primary text-white hover:bg-brand-primary' : 'text-slate-700')}
                                  >
                                    <div className={cn('h-12 w-12 shrink-0 overflow-hidden rounded-xl border', piece.materialId === material.id ? 'border-white/30 bg-white/15' : 'border-slate-100 bg-slate-50')}>
                                      {imageVariantUrl(material, 'thumbnail') ? <img src={imageVariantUrl(material, 'thumbnail')} alt={material.name} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase text-slate-300">Sem foto</div>}
                                    </div>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate">{material.name}</span>
                                      <span className={cn('block text-[11px] font-medium', piece.materialId === material.id ? 'text-white/80' : 'text-slate-400')}>
                                        {formatMaterialSpecs(material) || material.category || 'Sem categoria'}
                                      </span>
                                    </span>
                                    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase', available ?'bg-green-50 text-green-700' : 'bg-red-50 text-red-600', piece.materialId === material.id && 'bg-white/15 text-white')}>
                                      <span className={cn('h-2 w-2 rounded-full', available ?'bg-green-500' : 'bg-red-500')} />
                                      {available ?'Disponível' : 'Indisponível'}
                                    </span>
                                  </button>
                                );
                              })}
                              {filteredMaterialsForPiece(piece.id).length === 0 && <div className="px-3 py-3 text-sm font-semibold text-slate-400">Nenhum material encontrado.</div>}
                            </div>
                          )}
                        </div>
                      </div>
                      {piece.stair?.active && (
                        <div className="md:col-span-3 rounded-3xl border border-amber-100 bg-amber-50/40 p-5 space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <h3 className="font-display text-lg font-bold text-slate-900">Orçamento de escada</h3>
                              <p className="text-xs text-slate-500">Calcula piso, espelho, patamar e rodapé lateral da escada.</p>
                            </div>
                            <select
                              value={piece.stair.unit}
                              onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, unit: e.target.value as 'cm' | 'm'}})}
                              className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                            >
                              <option value="cm">cm</option>
                              <option value="m">m</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <label className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Qtd. degraus</span>
                              <input type="number" min="0" value={piece.stair.stepCount} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, stepCount: Number(e.target.value)}})} className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Largura degrau</span>
                              <input type="number" min="0" value={piece.stair.stepWidth} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, stepWidth: Number(e.target.value)}})} className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Profundidade piso</span>
                              <input type="number" min="0" value={piece.stair.treadDepth} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, treadDepth: Number(e.target.value)}})} className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Altura espelho</span>
                              <input type="number" min="0" value={piece.stair.riserHeight} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, riserHeight: Number(e.target.value)}})} className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 font-mono outline-none" />
                            </label>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <label className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Qtd. patamares</span>
                              <input type="number" min="0" value={piece.stair.landingCount} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, landingCount: Number(e.target.value)}})} className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Largura patamar</span>
                              <input type="number" min="0" value={piece.stair.landingWidth} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, landingWidth: Number(e.target.value)}})} className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 font-mono outline-none" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Profundidade patamar</span>
                              <input type="number" min="0" value={piece.stair.landingDepth} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, landingDepth: Number(e.target.value)}})} className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 font-mono outline-none" />
                            </label>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-600">
                              <input type="checkbox" checked={piece.stair.leftBaseboard} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, leftBaseboard: e.target.checked}})} className="h-4 w-4 accent-brand-primary" />
                              Rodapé esquerdo
                            </label>
                            <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-600">
                              <input type="checkbox" checked={piece.stair.rightBaseboard} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, rightBaseboard: e.target.checked}})} className="h-4 w-4 accent-brand-primary" />
                              Rodapé direito
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Altura rodapé</span>
                              <input type="number" min="0" value={piece.stair.baseboardHeight} onChange={(e) => updatePiece(piece.id, {stair: {...piece.stair!, baseboardHeight: Number(e.target.value)}})} className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 font-mono outline-none" />
                            </label>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                            <div className="rounded-2xl bg-white p-3"><span className="block font-bold uppercase text-slate-400">Pisos</span><strong>{formatArea(stairDetails.treadArea)}</strong></div>
                            <div className="rounded-2xl bg-white p-3"><span className="block font-bold uppercase text-slate-400">Espelhos</span><strong>{formatArea(stairDetails.riserArea)}</strong></div>
                            <div className="rounded-2xl bg-white p-3"><span className="block font-bold uppercase text-slate-400">Patamar</span><strong>{formatArea(stairDetails.landingArea)}</strong></div>
                            <div className="rounded-2xl bg-white p-3"><span className="block font-bold uppercase text-slate-400">Rodapé</span><strong>{formatArea(stairDetails.baseboardArea)}</strong></div>
                            <div className="rounded-2xl bg-brand-primary p-3 text-white"><span className="block font-bold uppercase text-white/70">Total escada</span><strong>{formatArea(stairDetails.totalArea)}</strong></div>
                          </div>
                        </div>
                      )}
                      {!piece.stair?.active && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Comp. (cm)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatMeasureInput(piece.length)}
                          onChange={(e) => updatePiece(piece.id, { length: parseMeasureInput(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                        />
                      </div>
                      )}
                      {!piece.stair?.active && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Largura (cm)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatMeasureInput(piece.width)}
                          onChange={(e) => updatePiece(piece.id, { width: parseMeasureInput(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                        />
                      </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Área Total (m²)</label>
                        <div className="px-4 py-2.5 bg-slate-100 rounded-xl font-mono text-slate-600 flex flex-col items-end">
                          <div className="flex justify-between w-full items-center">
                            <span className="text-[9px] uppercase font-bold text-slate-400">Total:</span>
                             <span className="font-bold text-slate-900">{formatMeasure(pieceArea)}</span>
                          </div>
                          {piece.sculptedSink?.active && (
                            <div className="text-[8px] text-slate-400 flex flex-col w-full">
                              <div className="flex justify-between">
                                <span>Peça:</span>
                                <span>{formatMeasure(calculatePieceArea(piece).mainArea)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Cuba:</span>
                                <span>{formatMeasure(calculatePieceArea(piece).sinkArea)}</span>
                              </div>
                            </div>
                          )}
                          {piece.wetAreaRecess?.active && (
                            <div className="text-[8px] text-slate-400 flex justify-between w-full">
                              <span>Rebaixo:</span>
                              <span>{formatMeasure(calculatePieceArea(piece).recessArea)}</span>
                            </div>
                          )}
                          {piece.manualArea && (
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-1" title="Calculado via desenho" />
                          )}
                        </div>
                        <div className={cn('mt-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wide', !hasMaterial ?'bg-slate-100 text-slate-500' : hasEnoughStock ?'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
                          {!hasMaterial ?'Selecione um material para validar o estoque' : hasEnoughStock ?`m² suficiente: ${formatArea(stock.available)} disponível` : `m² insuficiente: precisa ${formatArea(pieceArea)} e há ${formatArea(stock.available)}`}
                        </div>
                        {hasMaterial && hasEnoughStock && lotInfo && (
                          <div className={cn('mt-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wide', lotInfo.canUseSingleLot ?'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>
                            {lotInfo.canUseSingleLot
                              ? `Mesmo lote: cabe na chapa ${lotInfo.singleLot?.code || 'sem lote'} (${formatArea(lotInfo.singleLot?.availableArea || 0)})`
                              : `Lotes diferentes: precisa combinar ${lotInfo.lotCountNeeded || 2} chapas para ${formatArea(pieceArea)}`}
                          </div>
                        )}
                        {hasMaterial && !hasEnoughStock && (
                          <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-red-600">
                            Não há lote suficiente para esta peça.
                        </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-50 space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Preço da peça</h3>
                        <p className="text-xs text-slate-500">Você pode manter o cálculo automático ou informar um valor manual só para esta peça.</p>
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

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Valor em uso</div>
                        <div className="mt-2 font-mono text-lg font-bold text-slate-900">
                          {formatCurrency(basePiecePricingBreakdowns[pIdx]?.pieceSubtotalValue || 0)}
                        </div>
                      </div>
                      <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <label className="block space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Valor manual da peça</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={pieceManualPriceInputs[piece.id] || ''}
                            onChange={(event) => updatePieceManualPriceInput(piece.id, event.target.value)}
                            onBlur={() => formatPieceManualPriceInput(piece.id)}
                            disabled={(piece.pricingMode || 'automatic') !== 'manual'}
                            placeholder="0,00"
                            className={cn(
                              'w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-mono outline-none transition-all focus:ring-2',
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
                  </div>

                  {/* Pia Esculpida Section */}
                  <div className="pt-4 border-t border-slate-50 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-slate-700">Pia Esculpida:</label>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button 
                            onClick={() => updatePiece(piece.id, { sculptedSink: { ...(piece.sculptedSink || {
                              drainType: 'Válvula oculta', quantity: 1, width: 0, depth: 0, height: 0, unit: 'cm'
                            }), active: true } as any })}
                            className={cn("px-4 py-1 text-[10px] font-bold uppercase rounded-lg transition-all", piece.sculptedSink?.active ?"bg-white text-brand-primary shadow-sm" : "text-slate-400")}
                          >Sim</button>
                          <button 
                            onClick={() => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink, active: false } as any })}
                            className={cn("px-4 py-1 text-[10px] font-bold uppercase rounded-lg transition-all", !piece.sculptedSink?.active ?"bg-white text-brand-primary shadow-sm" : "text-slate-400")}
                          >Não</button>
                        </div>
                      </div>
                    </div>

                    {piece.sculptedSink?.active && (
                      <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 space-y-6 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tipo de ralo</label>
                            <select 
                              value={piece.sculptedSink.drainType || 'Válvula oculta'}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, drainType: e.target.value as any } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none"
                            >
                              <option value="Válvula oculta">Válvula oculta</option>
                              <option value="Ralo click">Ralo click</option>
                              <option value="Ralo oculto">Ralo oculto</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quantidade</label>
                            <input 
                              type="number" 
                              min="1"
                              value={piece.sculptedSink.quantity}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, quantity: Math.max(1, Number(e.target.value)) } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Medida Unidade</label>
                            <select 
                              value={piece.sculptedSink.unit}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, unit: e.target.value as any } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none"
                            >
                              <option value="cm">cm</option>
                              <option value="m">m</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Largura Cuba ({piece.sculptedSink.unit})</label>
                            <input 
                              type="number" 
                              value={piece.sculptedSink.width}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, width: Number(e.target.value) } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Profundidade Cuba ({piece.sculptedSink.unit})</label>
                            <input 
                              type="number" 
                              value={piece.sculptedSink.depth}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, depth: Number(e.target.value) } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Altura Interna ({piece.sculptedSink.unit})</label>
                            <input 
                              type="number" 
                              value={piece.sculptedSink.height}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, height: Number(e.target.value) } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none"
                            />
                          </div>
                        </div>

                        {/* Internal Result Summary */}
                        {piece.sculptedSink.width > 0 && (
                          <div className="bg-white border border-slate-100 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                            {(() => {
                              const pieceTotals = calculatePieceArea(piece);
                              const pieceMaterial = materialWithQuotePrice(piece.materialId || materialId, piece.materialVariantKey);
                              const calc = calculateSculptedSink(piece.sculptedSink, pieceMaterial);
                              return (
                                <>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Área bancada</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatArea(pieceTotals.mainArea)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Área cuba</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatArea(calc.baseArea)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Perda aplicada</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatArea(pieceTotals.lossArea || 0)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Área final</span>
                                    <div className="text-brand-primary font-mono font-bold">{formatArea(pieceTotals.totalArea)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Ralo</span>
                                    <div className="text-slate-900 font-mono font-bold">{piece.sculptedSink.drainType || 'Válvula oculta'}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Mão de Obra</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatCurrency(calc.laborValue + calc.extraSinkValue)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Valor pedra</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatCurrency(pieceTotals.totalArea * (pieceMaterial?.pricePerM2 || 0))}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Valor Total Pia</span>
                                    <div className="text-brand-primary font-mono font-bold">{formatCurrency(calc.value)}</div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-50 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-slate-700">Rebaixo área molhada:</label>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => updatePiece(piece.id, { wetAreaRecess: { ...(piece.wetAreaRecess || {type: 'americano', width: 0, depth: 0, unit: 'cm'}), active: true } as any })}
                            className={cn("px-4 py-1 text-[10px] font-bold uppercase rounded-lg transition-all", piece.wetAreaRecess?.active ?"bg-white text-brand-primary shadow-sm" : "text-slate-400")}
                          >Sim</button>
                          <button
                            type="button"
                            onClick={() => updatePiece(piece.id, { wetAreaRecess: { ...piece.wetAreaRecess, active: false } as any })}
                            className={cn("px-4 py-1 text-[10px] font-bold uppercase rounded-lg transition-all", !piece.wetAreaRecess?.active ?"bg-white text-brand-primary shadow-sm" : "text-slate-400")}
                          >Não</button>
                        </div>
                      </div>
                    </div>

                    {piece.wetAreaRecess?.active && (
                      <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tipo de rebaixo</label>
                            <select
                              value={piece.wetAreaRecess.type}
                              onChange={(e) => updatePiece(piece.id, { wetAreaRecess: { ...piece.wetAreaRecess!, type: e.target.value as any } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none"
                            >
                              <option value="americano">Americano</option>
                              <option value="italiano">Italiano</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Largura ({piece.wetAreaRecess.unit})</label>
                            <input type="number" value={piece.wetAreaRecess.width} onChange={(e) => updatePiece(piece.id, { wetAreaRecess: { ...piece.wetAreaRecess!, width: Number(e.target.value) } })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Profundidade ({piece.wetAreaRecess.unit})</label>
                            <input type="number" value={piece.wetAreaRecess.depth} onChange={(e) => updatePiece(piece.id, { wetAreaRecess: { ...piece.wetAreaRecess!, depth: Number(e.target.value) } })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Unidade</label>
                            <select value={piece.wetAreaRecess.unit} onChange={(e) => updatePiece(piece.id, { wetAreaRecess: { ...piece.wetAreaRecess!, unit: e.target.value as any } })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none">
                              <option value="cm">cm</option>
                              <option value="m">m</option>
                            </select>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white p-4">
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Área do rebaixo (m²)</span>
                          <div className="text-brand-primary font-mono font-bold">{formatMeasure(calculateWetAreaRecessArea(piece))}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Adicionais - Frontão, Saia, etc */}
                  <div className="space-y-4 pt-4 border-t border-slate-50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Adicionais (Frontão/Saia/Virada/Pé)</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'frontao')}
                          className="px-3 py-2 rounded-xl bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-widest hover:bg-brand-primary/15 transition-all"
                        >
                        + Frontão
                        </button>
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'saia')}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                          + Saia
                        </button>
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'virada')}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                          + Virada
                        </button>
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'pe')}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                        + Pé de bancada
                        </button>
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'guarnicao')}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                        + Guarnição
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {piece.sides.map((side, sIdx) => (
                        <div key={sIdx} className="grid grid-cols-1 gap-3 rounded-[20px] border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_72px_36px] sm:items-end">
                          <div className="min-w-0 space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Tipo / Medida</span>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_minmax(0,1fr)]">
                              <select 
                                value={side.type}
                                onChange={(e) => {
                                  const newSides = [...piece.sides];
                                  newSides[sIdx].type = e.target.value as any;
                                  newSides[sIdx].height =
                                    e.target.value === 'frontao' ? settings.defaultFrontonHeight :
                                    e.target.value === 'saia' ? settings.defaultSkirtHeight :
                                    settings.defaultTurnHeight;
                                  updatePiece(piece.id, { sides: newSides });
                                }}
                                className="min-w-0 bg-white border border-slate-200 rounded-lg text-xs p-1"
                              >
                              <option value="frontao">Frontão</option>
                                <option value="saia">Saia</option>
                                <option value="virada">Virada</option>
                              <option value="pe">Pé de bancada</option>
                              <option value="guarnicao">Guarnição</option>
                              </select>
                              <select 
                                value={side.side}
                                onChange={(e) => {
                                  const newSides = [...piece.sides];
                                  const selectedSide = sideOptionsForPiece(piece).find(option => option.value === e.target.value);
                                  newSides[sIdx].side = e.target.value;
                                  newSides[sIdx].sideLabel = selectedSide?.label;
                                  newSides[sIdx].length = selectedSide?.length || 0;
                                  updatePiece(piece.id, { sides: newSides });
                                }}
                                className="min-w-0 bg-white border border-slate-200 rounded-lg text-xs p-1"
                              >
                                {sideOptionsForPiece(piece).map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="space-y-1 sm:w-16">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">{sideDimensionLabel(side.type)}</span>
                            <input 
                              type="number" 
                              value={side.height}
                              onChange={(e) => {
                                const newSides = [...piece.sides];
                                newSides[sIdx].height = Number(e.target.value);
                                updatePiece(piece.id, { sides: newSides });
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg text-xs p-1 text-center"
                            />
                          </div>
                          <button 
                            type="button"
                            aria-label="Remover lado"
                            title="Remover lado"
                            onClick={() => {
                              const newSides = [...piece.sides];
                              newSides.splice(sIdx, 1);
                              updatePiece(piece.id, { sides: newSides });
                            }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <section className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm space-y-6 sm:rounded-[32px] sm:p-6 lg:p-8">
            <h2 className="font-display font-bold text-xl text-slate-800">Recortes e Acabamentos Especiais</h2>
            {!pieces.length ?(
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Adicione ao menos uma peça para vincular os recortes cadastrados no Admin.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
                {([
                  { key: 'cooktop', label: 'Cooktop', category: 'cooktop' },
                  { key: 'sink', label: 'Cuba', category: 'sink' },
                  { key: 'faucet', label: 'Torneira', category: 'faucet' },
                  { key: 'trashBin', label: 'Lixeira de embutir', category: 'trashBin' },
                  { key: 'popUpTower', label: 'Torre de tomada', category: 'popUpTower' },
                ] as const).map((fixtureConfig) => {
                  const options = fixturesByCategory(fixtureConfig.category);
                  const selectedId = pieces[0]?.selectedFixtureIds?.[fixtureConfig.key] || drawingFixtureIdForKey(fixtureConfig.key);
                  const selectedItem = options.find((item) => item.id === selectedId);
                  const totalLinkedCutouts = cutoutCountByFixtureKey(fixtureConfig.key);
                  return (
                    <div key={fixtureConfig.key} className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-col items-start gap-1.5">
                        <div className="text-[11px] font-bold uppercase leading-tight tracking-wider text-slate-500">{fixtureConfig.label}</div>
                        <span className={cn('inline-flex rounded-full px-2 py-1 text-[10px] font-bold leading-none', totalLinkedCutouts > 0 ?'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500')}>
                          {totalLinkedCutouts} no orçamento
                        </span>
                      </div>
                      <select
                        value={selectedId}
                        onChange={(e) => selectCatalogFixtureForFirstPiece(fixtureConfig.key, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Sem recorte</option>
                        {options.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} {item.brand ?`- ${item.brand}` : ''} {item.model ?`(${item.model})` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedItem && (
                        <div className="space-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                          <div><span className="font-semibold text-slate-600">Marca:</span> {selectedItem.brand || '-'}</div>
                          <div><span className="font-semibold text-slate-600">Modelo:</span> {selectedItem.model || '-'}</div>
                          {imageVariantUrl(selectedItem, 'thumbnail') && <img src={imageVariantUrl(selectedItem, 'thumbnail')} alt={selectedItem.name} loading="lazy" decoding="async" className="mt-2 h-20 w-full rounded-lg object-contain bg-slate-50" />}
                        </div>
                      )}
                      {!options.length && (
                        <div className="text-xs text-slate-400">Cadastre opções no Admin.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

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
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <button
                  id={`save-drawing-${showDrawing}`}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-primary/20 transition-all hover:bg-brand-primary/90 sm:px-5"
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
                fixtureCatalog={fixtureCatalog}
                settings={settings}
                onSave={({ json, area, previewUrl, sides, largestSide, smallestSide, cutouts: drawingCutouts }) => {
                    const currentPiece = pieces.find((piece) => piece.id === showDrawing);
                    const fixturePatch = fixturePatchFromDrawingCutouts(drawingCutouts);
                    applyCutoutDiff(currentPiece?.cutouts, drawingCutouts);
                    const dimensionCandidates = [Number(largestSide || 0), Number(smallestSide || 0)].filter((value) => value > 0);
                    const major = dimensionCandidates.length ? Math.max(...dimensionCandidates) : 0;
                    const minor = dimensionCandidates.length ? Math.min(...dimensionCandidates) : 0;
                    updatePiece(showDrawing, { 
                      drawingJson: json, 
                      manualArea: area, 
                      previewUrl, 
                      sides, 
                      largestSide, 
                      smallestSide,
                      length: major || currentPiece?.length || 0,
                      width: minor || currentPiece?.width || major || 0,
                      cutouts: drawingCutouts,
                      selectedFixtureIds: {
                        ...currentPiece?.selectedFixtureIds,
                      ...fixturePatch.selectedFixtureIds,
                    },
                    purchasedFixtures: {
                      ...currentPiece?.purchasedFixtures,
                      ...fixturePatch.purchasedFixtures,
                    },
                  });
                  setShowDrawing(null);
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


