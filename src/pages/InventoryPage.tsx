import React, {useEffect, useMemo, useRef, useState} from 'react';
import {addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc} from '../lib/firestore';
import {AlertTriangle, CheckCircle2, Edit2, Eye, FileText, Filter, ImagePlus, LocateFixed, MapPin, MessageCircle, PackageCheck, Plus, Search, ShoppingCart, Trash2, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {db} from '../lib/firestore';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {InventoryItem, InventoryPurchase, InventoryReservation, Material, Quote, SystemEvent} from '../types';
import {cn, formatCurrency, formatNumber} from '../lib/utils';
import {useAuth} from '../contexts/AuthContext';
import {logSystemEvent} from '../lib/systemEvents';
import {useSettings} from '../hooks/useSettings';
import {formatMaterialSpecs, formatMaterialSpecsWithProvider} from '../lib/materialSpecs';
import {generatePurchaseOrderPdf} from '../lib/purchaseOrderPdfGenerator';
import {optimizeImageFile} from '../lib/imageUtils';
import {clearDraft, loadDraftMeta, saveDraft} from '../lib/draftStorage';
import {DraftNotice} from '../components/DraftNotice';
import {DraftAutosaveStatus} from '../components/DraftAutosaveStatus';
import {validateInventoryItemPayload, validatePurchaseSlabs} from '../lib/businessRules';

const statusOptions: InventoryItem['status'][] = ['Disponível', 'Reservada', 'Usada', 'Retalho', 'Descarte'];

const patioRacks = Array.from({length: 9}, (_, index) => `Cavalete ${index + 1}`);
const patioRackRows = [
  ['Cavalete 1'],
  ['Cavalete 2', 'Cavalete 3'],
  ['Cavalete 4', 'Cavalete 5'],
  ['Cavalete 6', 'Cavalete 7'],
  ['Cavalete 8'],
  ['Cavalete 9'],
] as const;
const UNASSIGNED_PANEL_ID = '__unassigned__';

const normalizeStatus = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

type PurchaseMeasureMode = 'same' | 'different';

type PurchaseSlabForm = {
  code: string;
  length: string;
  width: string;
  thickness: string;
  cost: string;
  minimumSalePrice: string;
};

const emptyPurchaseSlab = (): PurchaseSlabForm => ({
  code: '',
  length: '',
  width: '',
  thickness: '',
  cost: '',
  minimumSalePrice: '',
});

const parseThicknessValue = (label: string) => Number(String(label || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;

const isApprovedReservation = (reservation: InventoryReservation) => {
  const status = normalizeStatus(reservation.quoteStatus);
  return [
    'orcamento aprovado',
    'medicao',
    'projeto',
    'projeto aprovado',
    'corte',
    'acabamento',
    'montagem',
    'producao finalizada',
    'conferencia final',
    'entrega',
  ].includes(status);
};

const isSoldReservation = (reservation: InventoryReservation) => normalizeStatus(reservation.quoteStatus) === 'finalizado';

const isActiveReservation = (reservation: InventoryReservation) => {
  const status = normalizeStatus(reservation.quoteStatus);
  return !['recusado', 'cancelado', 'finalizado'].includes(status);
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  return null;
};

export const InventoryPage: React.FC = () => {
  const {user, profile, appUid, hasPermission} = useAuth();
  const {settings} = useSettings();
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotesLoaded, setQuotesLoaded] = useState(false);
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [inventoryDraftRecovered, setInventoryDraftRecovered] = useState(false);
  const [purchaseDraftRecovered, setPurchaseDraftRecovered] = useState(false);
  const [inventoryDraftSavedAt, setInventoryDraftSavedAt] = useState<string | null>(null);
  const [purchaseDraftSavedAt, setPurchaseDraftSavedAt] = useState<string | null>(null);
  const [showLossModal, setShowLossModal] = useState(false);
  const [reservationMaterialId, setReservationMaterialId] = useState<string | null>(null);
  const [selectedRackId, setSelectedRackId] = useState(patioRacks[0]);
  const [selectedPatioPanel, setSelectedPatioPanel] = useState<string>(patioRacks[0]);
  const [focusedInventoryId, setFocusedInventoryId] = useState('');
  const patioMapRef = useRef<HTMLDivElement | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [code, setCode] = useState('');
  const [provider, setProvider] = useState('');
  const [rackId, setRackId] = useState('');
  const [category, setCategory] = useState('');
  const [materialLine, setMaterialLine] = useState('');
  const [materialType, setMaterialType] = useState('Chapa');
  const [thicknessLabel, setThicknessLabel] = useState('');
  const [texture, setTexture] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [thickness, setThickness] = useState('');
  const [cost, setCost] = useState('');
  const [minimumSalePrice, setMinimumSalePrice] = useState('');
  const [status, setStatus] = useState<InventoryItem['status']>('Disponível');
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [purchaseMaterialId, setPurchaseMaterialId] = useState('');
  const [purchaseMaterialName, setPurchaseMaterialName] = useState('');
  const [purchaseCode, setPurchaseCode] = useState('');
  const [purchaseProvider, setPurchaseProvider] = useState('');
  const [purchaseCategory, setPurchaseCategory] = useState('');
  const [purchaseMaterialLine, setPurchaseMaterialLine] = useState('');
  const [purchaseMaterialType, setPurchaseMaterialType] = useState('Chapa');
  const [purchaseThicknessLabel, setPurchaseThicknessLabel] = useState('');
  const [purchaseTexture, setPurchaseTexture] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('1');
  const [purchaseMeasureMode, setPurchaseMeasureMode] = useState<PurchaseMeasureMode>('same');
  const [purchaseLength, setPurchaseLength] = useState('');
  const [purchaseWidth, setPurchaseWidth] = useState('');
  const [purchaseThickness, setPurchaseThickness] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [purchaseMinimumSalePrice, setPurchaseMinimumSalePrice] = useState('');
  const [purchaseSlabs, setPurchaseSlabs] = useState<PurchaseSlabForm[]>([emptyPurchaseSlab()]);
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseExpectedDeliveryDate, setPurchaseExpectedDeliveryDate] = useState('');
  const [lossQuoteId, setLossQuoteId] = useState('');
  const [lossPieceId, setLossPieceId] = useState('');
  const [lossInventoryId, setLossInventoryId] = useState('');
  const [lossReason, setLossReason] = useState('Quebra');
  const [lossNotes, setLossNotes] = useState('');
  const inventoryDraftLoadedRef = useRef(false);
  const purchaseDraftLoadedRef = useRef(false);
  const inventoryDraftKey = `inventory-form-draft:${appUid || 'anonymous'}`;
  const purchaseDraftKey = `inventory-purchase-draft:${appUid || 'anonymous'}`;

  useEffect(() => {
    const qItems = query(collection(db, 'inventory'), orderBy('code', 'asc'));
    const handleReadError = (error: unknown, label: string) => {
      console.error(`Erro ao carregar ${label}:`, error);
      setLoadError('Não foi possível carregar todo o estoque agora. A tela pode ficar incompleta até a conexão estabilizar ou o acesso ao banco voltar ao normal.');
      setLoading(false);
    };
    const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
      setItems(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as InventoryItem)));
      setLoading(false);
    }, (error) => handleReadError(error, 'itens de estoque'));

    const qMaterials = query(collection(db, 'materials'), orderBy('name', 'asc'));
    const unsubscribeMaterials = onSnapshot(qMaterials, (snapshot) => {
      setMaterials(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as Material)));
    }, (error) => handleReadError(error, 'pedras do catálogo'));

    const unsubscribeReservations = onSnapshot(collection(db, 'inventoryReservations'), (snapshot) => {
      setReservations(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as InventoryReservation)));
    }, (error) => handleReadError(error, 'reservas do estoque'));

    const qPurchases = query(collection(db, 'inventoryPurchases'), orderBy('purchasedAt', 'desc'));
    const unsubscribePurchases = onSnapshot(qPurchases, (snapshot) => {
      setPurchases(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as InventoryPurchase)));
    }, (error) => handleReadError(error, 'histórico de compras'));
    const unsubscribeEvents = onSnapshot(query(collection(db, 'systemEvents'), orderBy('createdAt', 'desc')), (snapshot) => {
      setSystemEvents(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as SystemEvent)));
    }, (error) => handleReadError(error, 'histórico operacional'));

    return () => {
      unsubscribeItems();
      unsubscribeMaterials();
      unsubscribeReservations();
      unsubscribePurchases();
      unsubscribeEvents();
    };
  }, []);

  useEffect(() => {
    if (!showModal || editingItem || inventoryDraftLoadedRef.current) return;

    const {data: draft, savedAt} = loadDraftMeta<Record<string, string>>(inventoryDraftKey);
    if (draft) {
      setInventoryDraftRecovered(true);
      setInventoryDraftSavedAt(savedAt);
      setSelectedMaterialId(draft.selectedMaterialId || '');
      setMaterialName(draft.materialName || '');
      setCode(draft.code || '');
      setProvider(draft.provider || '');
      setRackId(draft.rackId || '');
      setCategory(draft.category || '');
      setMaterialLine(draft.materialLine || '');
      setMaterialType(draft.materialType || 'Chapa');
      setThicknessLabel(draft.thicknessLabel || '');
      setTexture(draft.texture || '');
      setLength(draft.length || '');
      setWidth(draft.width || '');
      setThickness(draft.thickness || '');
      setCost(draft.cost || '');
      setMinimumSalePrice(draft.minimumSalePrice || '');
      setStatus((draft.status as InventoryItem['status']) || 'Disponível');
      setNotes(draft.notes || '');
      setPhotoPreview(draft.photoPreview || '');
    } else {
      setInventoryDraftRecovered(false);
      setInventoryDraftSavedAt(null);
    }

    inventoryDraftLoadedRef.current = true;
  }, [editingItem, inventoryDraftKey, showModal]);

  useEffect(() => {
    if (!showModal || editingItem || !inventoryDraftLoadedRef.current) return;

    const savedAt = saveDraft(inventoryDraftKey, {
      selectedMaterialId,
      materialName,
      code,
      provider,
      rackId,
      category,
      materialLine,
      materialType,
      thicknessLabel,
      texture,
      length,
      width,
      thickness,
      cost,
      minimumSalePrice,
      status,
      notes,
      photoPreview,
    });
    if (savedAt) setInventoryDraftSavedAt(savedAt);
  }, [category, code, cost, editingItem, inventoryDraftKey, length, materialLine, materialName, materialType, minimumSalePrice, notes, photoPreview, provider, rackId, selectedMaterialId, showModal, status, texture, thickness, thicknessLabel, width]);

  useEffect(() => {
    if (!showPurchaseModal || purchaseDraftLoadedRef.current) return;

    const {data: draft, savedAt} = loadDraftMeta<Record<string, unknown>>(purchaseDraftKey);
    if (draft) {
      setPurchaseDraftRecovered(true);
      setPurchaseDraftSavedAt(savedAt);
      setPurchaseMaterialId(String(draft.purchaseMaterialId || ''));
      setPurchaseMaterialName(String(draft.purchaseMaterialName || ''));
      setPurchaseCode(String(draft.purchaseCode || ''));
      setPurchaseProvider(String(draft.purchaseProvider || ''));
      setPurchaseCategory(String(draft.purchaseCategory || ''));
      setPurchaseMaterialLine(String(draft.purchaseMaterialLine || ''));
      setPurchaseMaterialType(String(draft.purchaseMaterialType || 'Chapa'));
      setPurchaseThicknessLabel(String(draft.purchaseThicknessLabel || ''));
      setPurchaseTexture(String(draft.purchaseTexture || ''));
      setPurchaseQuantity(String(draft.purchaseQuantity || '1'));
      setPurchaseMeasureMode((draft.purchaseMeasureMode as PurchaseMeasureMode) || 'same');
      setPurchaseLength(String(draft.purchaseLength || ''));
      setPurchaseWidth(String(draft.purchaseWidth || ''));
      setPurchaseThickness(String(draft.purchaseThickness || ''));
      setPurchaseCost(String(draft.purchaseCost || ''));
      setPurchaseMinimumSalePrice(String(draft.purchaseMinimumSalePrice || ''));
      setPurchaseSlabs(Array.isArray(draft.purchaseSlabs) && draft.purchaseSlabs.length ? draft.purchaseSlabs as PurchaseSlabForm[] : [emptyPurchaseSlab()]);
      setPurchaseNotes(String(draft.purchaseNotes || ''));
      setPurchaseExpectedDeliveryDate(String(draft.purchaseExpectedDeliveryDate || ''));
    } else {
      setPurchaseDraftRecovered(false);
      setPurchaseDraftSavedAt(null);
    }

    purchaseDraftLoadedRef.current = true;
  }, [purchaseDraftKey, showPurchaseModal]);

  useEffect(() => {
    if (!showPurchaseModal || !purchaseDraftLoadedRef.current) return;

    const savedAt = saveDraft(purchaseDraftKey, {
      purchaseMaterialId,
      purchaseMaterialName,
      purchaseCode,
      purchaseProvider,
      purchaseCategory,
      purchaseMaterialLine,
      purchaseMaterialType,
      purchaseThicknessLabel,
      purchaseTexture,
      purchaseQuantity,
      purchaseMeasureMode,
      purchaseLength,
      purchaseWidth,
      purchaseThickness,
      purchaseCost,
      purchaseMinimumSalePrice,
      purchaseSlabs,
      purchaseNotes,
      purchaseExpectedDeliveryDate,
    });
    if (savedAt) setPurchaseDraftSavedAt(savedAt);
  }, [purchaseCategory, purchaseCode, purchaseCost, purchaseDraftKey, purchaseExpectedDeliveryDate, purchaseLength, purchaseMaterialId, purchaseMaterialLine, purchaseMaterialName, purchaseMaterialType, purchaseMeasureMode, purchaseMinimumSalePrice, purchaseNotes, purchaseProvider, purchaseQuantity, purchaseSlabs, purchaseTexture, purchaseThickness, purchaseThicknessLabel, purchaseWidth, showPurchaseModal]);

  const ensureQuotesLoaded = async () => {
    if (quotesLoaded) return;
    try {
      const qQuotes = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(qQuotes);
      setQuotes(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as Quote)));
      setQuotesLoaded(true);
    } catch (error) {
      console.error('Erro ao carregar orçamentos para perdas:', error);
      setLoadError('Não foi possível carregar orçamentos e perdas agora. Tente novamente em instantes.');
    }
  };

  const resetForm = () => {
    inventoryDraftLoadedRef.current = false;
    setInventoryDraftRecovered(false);
    setInventoryDraftSavedAt(null);
    setSelectedMaterialId('');
    setMaterialName('');
    setCode('');
    setProvider('');
    setRackId('');
    setCategory('');
    setMaterialLine('');
    setMaterialType('Chapa');
    setThicknessLabel('');
    setTexture('');
    setLength('');
    setWidth('');
    setThickness('');
    setCost('');
    setMinimumSalePrice('');
    setStatus('Disponível');
    setNotes('');
    setPhotoFile(null);
    setPhotoPreview('');
    setEditingItem(null);
  };

  const currentUserName = profile?.name || user?.user_metadata?.name || user?.email || 'Usuário';
  const materialCatalog = settings.materialCatalog;
  const supplierOptions = materialCatalog.suppliers || [];
  const thicknessOptions = materialType === 'Lamina' ? materialCatalog.slabThicknesses : materialCatalog.naturalThicknesses;
  const purchaseThicknessOptions = purchaseMaterialType === 'Lamina' ? materialCatalog.slabThicknesses : materialCatalog.naturalThicknesses;
  const findSupplier = (name?: string) => supplierOptions.find((supplier) => supplier.name === name);
  const normalizeWhatsApp = (value?: string) => String(value || '').replace(/\D/g, '');
  const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parseInputDate = (value: string) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 9, 0, 0, 0);
  };
  const purchaseCalendarEventRef = (groupId: string) => doc(db, 'calendarEvents', `purchase-${groupId}`);

  const resetPurchaseForm = () => {
    purchaseDraftLoadedRef.current = false;
    setPurchaseDraftRecovered(false);
    setPurchaseDraftSavedAt(null);
    setPurchaseMaterialId('');
    setPurchaseMaterialName('');
    setPurchaseCode('');
    setPurchaseProvider('');
    setPurchaseCategory('');
    setPurchaseMaterialLine('');
    setPurchaseMaterialType('Chapa');
    setPurchaseThicknessLabel('');
    setPurchaseTexture('');
    setPurchaseQuantity('1');
    setPurchaseMeasureMode('same');
    setPurchaseLength('');
    setPurchaseWidth('');
    setPurchaseThickness('');
    setPurchaseCost('');
    setPurchaseMinimumSalePrice('');
    setPurchaseSlabs([emptyPurchaseSlab()]);
    setPurchaseNotes('');
    setPurchaseExpectedDeliveryDate('');
  };

  const clearInventoryDraftState = () => {
    clearDraft(inventoryDraftKey);
    resetForm();
    inventoryDraftLoadedRef.current = true;
  };

  const clearPurchaseDraftState = () => {
    clearDraft(purchaseDraftKey);
    resetPurchaseForm();
    purchaseDraftLoadedRef.current = true;
  };

  const resetLossForm = () => {
    setLossQuoteId('');
    setLossPieceId('');
    setLossInventoryId('');
    setLossReason('Quebra');
    setLossNotes('');
  };

  const updatePurchaseQuantity = (value: string) => {
    const quantity = Math.max(1, Number(value) || 1);
    setPurchaseQuantity(String(quantity));
    setPurchaseSlabs((prev) => Array.from({length: quantity}, (_, index) => prev[index] || emptyPurchaseSlab()));
  };

  const updatePurchaseSlab = (index: number, field: keyof PurchaseSlabForm, value: string) => {
    setPurchaseSlabs((prev) => prev.map((slab, slabIndex) => slabIndex === index ?{...slab, [field]: value} : slab));
  };

  const upsertPurchaseCalendarEvent = async (groupId: string, payload: {
    supplier: string;
    materialName: string;
    quantity: number;
    totalArea: number;
    expectedDeliveryDate: Date;
    notes?: string;
  }) => {
    await setDoc(purchaseCalendarEventRef(groupId), {
      title: `Entrega de compra · ${payload.materialName}`,
      description: [
        `Fornecedor: ${payload.supplier || 'Não informado'}`,
        `Material: ${payload.materialName}`,
        `Quantidade: ${payload.quantity} chapa(s)`,
        `Área total: ${formatNumber(payload.totalArea)} m²`,
        payload.notes ? `Observações: ${payload.notes}` : '',
      ].filter(Boolean).join('\n'),
      date: Timestamp.fromDate(payload.expectedDeliveryDate),
      dateKey: keyOf(payload.expectedDeliveryDate),
      eventTime: '09:00',
      status: 'Pedido de compra',
      sourceType: 'purchase-delivery',
      purchaseGroupId: groupId,
      supplier: payload.supplier || '',
      materialName: payload.materialName,
      quantity: payload.quantity,
      totalArea: payload.totalArea,
      updatedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      createdByUid: appUid || '',
      createdByName: currentUserName,
    }, {merge: true});
  };

  const removePurchaseCalendarEvent = async (groupId: string) => {
    await deleteDoc(purchaseCalendarEventRef(groupId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem ?!hasPermission('estoque', 'editar') : !hasPermission('estoque', 'adicionar')) {
      alert('Você não tem permissão para alterar o estoque. Fale com o administrador.');
      return;
    }
    if (!selectedMaterialId) {
      alert('Selecione uma pedra cadastrada no Admin.');
      return;
    }

    const area = (Number(length) * Number(width)) / 10000;
    const totalCost = Number(cost);
    const minimumSale = Number(minimumSalePrice || cost);
    const inventoryRef = editingItem ?doc(db, 'inventory', editingItem.id) : doc(collection(db, 'inventory'));
    const materialId = selectedMaterialId;
    const selectedMaterial = materials.find((material) => material.id === materialId);
    let photoUrl = editingItem?.photoUrl || selectedMaterial?.imageUrl || '';
    if (photoFile) {
      photoUrl = await optimizeImageFile(photoFile, {
        maxBytes: 850 * 1024,
        maxSide: 900,
        mimeType: 'image/webp',
      });
    }

    const data = {
      materialId,
      materialName: selectedMaterial?.name || materialName.trim(),
      code: code.trim(),
      provider: provider.trim(),
      rackId,
      category: category.trim(),
      materialLine: materialLine.trim(),
      materialType: materialType.trim(),
      thicknessLabel: thicknessLabel.trim(),
      texture: texture.trim(),
      length: Number(length),
      width: Number(width),
      thickness: parseThicknessValue(thicknessLabel) || Number(thickness),
      area,
      cost: totalCost,
      minimumSalePrice: minimumSale,
      status,
      notes,
      photoUrl,
    };
    const validationError = validateInventoryItemPayload({
      selectedMaterialId,
      code,
      length: Number(length),
      width: Number(width),
      cost: totalCost,
      minimumSalePrice: minimumSale,
    }, items, editingItem?.id);
    if (validationError) {
      alert(validationError);
      return;
    }
    const savedItem = {id: inventoryRef.id, ...data} as InventoryItem;
    const syncSavedItem = () => {
      setItems((current) => {
        const nextItems = current.some((item) => item.id === savedItem.id)
          ? current.map((item) => item.id === savedItem.id ? savedItem : item)
          : [...current, savedItem];

        return nextItems.sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR', {sensitivity: 'base'}));
      });
      if (savedItem.rackId) {
        setSelectedRackId(savedItem.rackId);
        setFocusedInventoryId(savedItem.id);
      }
    };

    try {
      if (editingItem) {
        await updateDoc(inventoryRef, data);
        syncSavedItem();
        clearDraft(inventoryDraftKey);
        setShowModal(false);
        resetForm();
        void logSystemEvent({
          type: 'inventory_updated',
          title: 'Item de estoque atualizado',
          description: `${data.materialName} - ${data.code}`,
          entityType: 'inventory',
          entityId: inventoryRef.id,
          materialId,
          materialName: data.materialName,
          userUid: appUid || '',
          userName: currentUserName,
          metadata: {area, cost: totalCost, minimumSalePrice: minimumSale, status},
        }).catch((error) => console.error('Erro ao registrar histórico do estoque:', error));
      } else {
        await setDoc(inventoryRef, data);
        syncSavedItem();
        clearDraft(inventoryDraftKey);
        setShowModal(false);
        resetForm();
        void logSystemEvent({
          type: 'inventory_created',
          title: 'Item de estoque cadastrado',
          description: `${data.materialName} - ${data.code}`,
          entityType: 'inventory',
          entityId: inventoryRef.id,
          materialId,
          materialName: data.materialName,
          userUid: appUid || '',
          userName: currentUserName,
          metadata: {area, cost: totalCost, minimumSalePrice: minimumSale, status},
        }).catch((error) => console.error('Erro ao registrar histórico do estoque:', error));
      }
    } catch (error) {
      console.error('Erro ao salvar item de estoque:', error);
      window.alert('Não foi possível salvar este item do estoque agora. Confira os dados e tente novamente.');
    }
  };

  const handleEdit = (item: InventoryItem) => {
    if (!hasPermission('estoque', 'editar')) return;
    setEditingItem(item);
    setSelectedMaterialId(item.materialId || '');
    setMaterialName(item.materialName);
    setCode(item.code);
    setProvider(item.provider);
    setRackId(item.rackId || '');
    setCategory(item.category || materials.find((material) => material.id === item.materialId)?.category || '');
    setMaterialLine(item.materialLine || item.category || '');
    setMaterialType(item.materialType || 'Chapa');
    setThicknessLabel(item.thicknessLabel || (item.thickness ? String(item.thickness) : ''));
    setTexture(item.texture || '');
    setLength(item.length.toString());
    setWidth(item.width.toString());
    setThickness(item.thickness.toString());
    setCost(item.cost.toString());
    setMinimumSalePrice(String(item.minimumSalePrice ?? item.cost ?? ''));
    setStatus(item.status);
    setNotes(item.notes);
    setPhotoFile(null);
    setPhotoPreview(item.photoUrl || '');
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission('estoque', 'excluir')) {
      alert('Você não tem permissão para excluir itens do estoque. Fale com o administrador.');
      return;
    }
    const confirmed = window.confirm('Tem certeza que deseja excluir este item do estoque?');
    if (!confirmed) return;

    const deletedItem = items.find((item) => item.id === id);
    const ok = await deleteFirestoreDoc('inventory', id);
    if (!ok) return;

    if (deletedItem) {
      await logSystemEvent({
        type: 'inventory_deleted',
        title: 'Item de estoque excluído',
        description: `${deletedItem.materialName} - ${deletedItem.code}`,
        entityType: 'inventory',
        entityId: id,
        materialId: deletedItem.materialId,
        materialName: deletedItem.materialName,
        userUid: appUid || '',
        userName: currentUserName,
        metadata: {area: deletedItem.area, cost: deletedItem.cost},
      });
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const openPurchaseModal = (item: {materialId: string; materialName: string; missing: number}) => {
    if (!hasPermission('estoque', 'adicionar')) return;
    const inventoryItem = items.find((stockItem) => stockItem.materialId === item.materialId);
    const material = materials.find((stockMaterial) => stockMaterial.id === item.materialId);
    setPurchaseMaterialId(item.materialId);
    setPurchaseMaterialName(item.materialName);
    setPurchaseProvider(inventoryItem?.provider || material?.provider || '');
    setPurchaseCategory(inventoryItem?.category || material?.category || '');
    setPurchaseMaterialLine(inventoryItem?.materialLine || inventoryItem?.category || material?.materialLine || material?.category || '');
    setPurchaseMaterialType(inventoryItem?.materialType || material?.materialType || 'Chapa');
    setPurchaseThicknessLabel(inventoryItem?.thicknessLabel || (inventoryItem?.thickness ? String(inventoryItem.thickness) : ''));
    setPurchaseTexture(inventoryItem?.texture || material?.texture || '');
    updatePurchaseQuantity('1');
    setPurchaseMeasureMode('same');
    setPurchaseLength('');
    setPurchaseWidth('');
    setPurchaseThickness(inventoryItem?.thickness ?String(inventoryItem.thickness) : '');
    setPurchaseCost('');
    setPurchaseMinimumSalePrice('');
    setPurchaseCode('');
    setPurchaseNotes(`Compra pendente sugerida: ${formatNumber(item.missing)} m²`);
    setShowPurchaseModal(true);
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseMaterialId) {
      alert('Selecione uma pedra cadastrada no Admin.');
      return;
    }
    const selectedMaterial = materials.find((material) => material.id === purchaseMaterialId);
    const selectedMaterialName = selectedMaterial?.name || purchaseMaterialName.trim();
    const quantity = Math.max(1, Number(purchaseQuantity) || 1);
    const slabs = purchaseMeasureMode === 'same'
      ? Array.from({length: quantity}, (_, index) => ({
        code: quantity > 1 && purchaseCode.trim() ?`${purchaseCode.trim()}-${index + 1}` : purchaseCode.trim(),
        length: purchaseLength,
        width: purchaseWidth,
        thickness: purchaseThickness,
        cost: purchaseCost,
        minimumSalePrice: purchaseMinimumSalePrice || purchaseCost,
      }))
      : purchaseSlabs.slice(0, quantity).map((slab, index) => ({
        ...slab,
        code: slab.code.trim() || (purchaseCode.trim() ?`${purchaseCode.trim()}-${index + 1}` : ''),
      }));

    const slabValidationError = validatePurchaseSlabs(slabs);
    if (slabValidationError) {
      alert(slabValidationError);
      return;
    }

    const expectedDeliveryDate = parseInputDate(purchaseExpectedDeliveryDate);
    if (!expectedDeliveryDate) {
      alert('Defina a previsão de entrega para integrar o pedido ao calendário.');
      return;
    }

    const purchaseGroupId = doc(collection(db, 'inventoryPurchases')).id;
    const createdPurchases = await Promise.all(slabs.map((slab, index) => {
      const area = (Number(slab.length) * Number(slab.width)) / 10000;
      return addDoc(collection(db, 'inventoryPurchases'), {
        materialId: purchaseMaterialId,
        materialName: selectedMaterialName,
        provider: purchaseProvider.trim(),
        code: slab.code,
        category: purchaseCategory.trim(),
        materialLine: purchaseMaterialLine.trim(),
        materialType: purchaseMaterialType.trim(),
        thicknessLabel: purchaseThicknessLabel.trim() || slab.thickness,
        texture: purchaseTexture.trim(),
        length: Number(slab.length),
        width: Number(slab.width),
        thickness: parseThicknessValue(purchaseThicknessLabel || slab.thickness) || Number(slab.thickness),
        area,
        cost: Number(slab.cost),
        minimumSalePrice: Number(slab.minimumSalePrice || slab.cost),
        photoUrl: selectedMaterial?.imageUrl || '',
        purchaseGroupId,
        purchaseIndex: index + 1,
        purchaseQuantity: quantity,
        status: 'Pedido',
        notes: purchaseNotes,
        expectedDeliveryDate: Timestamp.fromDate(expectedDeliveryDate),
        expectedDeliveryDateKey: keyOf(expectedDeliveryDate),
        purchasedByUid: appUid || '',
        purchasedByName: currentUserName,
        purchasedAt: serverTimestamp(),
      });
    }));
    const totalArea = slabs.reduce((acc, slab) => acc + (Number(slab.length) * Number(slab.width)) / 10000, 0);
    const totalCost = slabs.reduce((acc, slab) => acc + Number(slab.cost), 0);
    const totalMinimumSale = slabs.reduce((acc, slab) => acc + Number(slab.minimumSalePrice || slab.cost), 0);
    await upsertPurchaseCalendarEvent(purchaseGroupId, {
      supplier: purchaseProvider.trim(),
      materialName: selectedMaterialName,
      quantity,
      totalArea,
      expectedDeliveryDate,
      notes: purchaseNotes.trim(),
    });
    await logSystemEvent({
      type: 'purchase_ordered',
      title: 'Compra de material lançada',
      description: `${quantity} chapa(s) de ${selectedMaterialName} - ${formatNumber(totalArea)} m²`,
      entityType: 'purchase',
      entityId: createdPurchases[0]?.id || purchaseGroupId,
      materialId: purchaseMaterialId,
      materialName: selectedMaterialName,
      userUid: appUid || '',
      userName: currentUserName,
      metadata: {area: totalArea, cost: totalCost, minimumSalePrice: totalMinimumSale, quantity, status: 'Pedido'},
    });
    clearDraft(purchaseDraftKey);
    setShowPurchaseModal(false);
    resetPurchaseForm();
  };

  const receivePurchase = async (purchase: InventoryPurchase) => {
    if (!hasPermission('estoque', 'movimentar')) {
      alert('Você não tem permissão para movimentar o estoque. Fale com o administrador.');
      return;
    }
    if (purchase.status === 'Entregue') return;
    const inventoryRef = doc(collection(db, 'inventory'));
    await setDoc(inventoryRef, {
      materialId: purchase.materialId,
      materialName: purchase.materialName,
      code: purchase.code,
      provider: purchase.provider || '',
      category: purchase.category || '',
      materialLine: purchase.materialLine || purchase.category || '',
      materialType: purchase.materialType || 'Chapa',
      thicknessLabel: purchase.thicknessLabel || (purchase.thickness ? String(purchase.thickness) : ''),
      texture: purchase.texture || '',
      length: purchase.length,
      width: purchase.width,
      thickness: purchase.thickness,
      area: purchase.area,
      cost: purchase.cost,
      minimumSalePrice: purchase.minimumSalePrice ?? purchase.cost,
      status: 'Disponível',
      notes: purchase.notes || '',
      photoUrl: purchase.photoUrl || materials.find((material) => material.id === purchase.materialId)?.imageUrl || '',
    });
    await updateDoc(doc(db, 'inventoryPurchases', purchase.id), {
      status: 'Entregue',
      receivedByUid: appUid || '',
      receivedByName: currentUserName,
      receivedAt: serverTimestamp(),
      inventoryItemId: inventoryRef.id,
    });
    await logSystemEvent({
      type: 'purchase_received',
      title: 'Compra de material recebida',
      description: `${purchase.materialName} - ${formatNumber(purchase.area)} m²`,
      entityType: 'purchase',
      entityId: purchase.id,
      materialId: purchase.materialId,
      materialName: purchase.materialName,
      userUid: appUid || '',
      userName: currentUserName,
      metadata: {area: purchase.area, cost: purchase.cost, minimumSalePrice: purchase.minimumSalePrice ?? purchase.cost, inventoryItemId: inventoryRef.id, status: 'Entregue'},
    });

    const groupId = purchase.purchaseGroupId || purchase.id;
    const hasOtherPendingPurchases = purchases.some((item) =>
      (item.purchaseGroupId || item.id) === groupId &&
      item.id !== purchase.id &&
      item.status === 'Pedido',
    );
    if (!hasOtherPendingPurchases) {
      await removePurchaseCalendarEvent(groupId);
    }
  };

  const selectedLossQuote = quotes.find((quote) => quote.id === lossQuoteId);
  const selectedLossPiece = selectedLossQuote?.pieces?.find((piece) => piece.id === lossPieceId);
  const lossInventoryOptions = items.filter((item) => {
    const usable = !['usada', 'descarte'].includes(normalizeStatus(item.status));
    if (!usable) return false;
    if (!selectedLossPiece?.materialId) return true;
    return item.materialId === selectedLossPiece.materialId;
  });

  const handleLossSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('estoque', 'movimentar')) {
      alert('Você não tem permissão para registrar perdas. Fale com o administrador.');
      return;
    }
    const quote = selectedLossQuote;
    const piece = selectedLossPiece;
    const inventoryItem = items.find((item) => item.id === lossInventoryId);
    if (!quote || !piece || !inventoryItem) {
      alert('Selecione o cliente/projeto, a peça perdida e a chapa do estoque.');
      return;
    }

    await updateDoc(doc(db, 'inventory', inventoryItem.id), {
      status: 'Descarte',
      lossReason,
      lossNotes,
      lossQuoteId: quote.id,
      lossClientId: quote.clientId,
      lossClientName: quote.clientName,
      lossPieceId: piece.id,
      lossPieceName: piece.name,
      lostByUid: appUid || '',
      lostByName: currentUserName,
      lostAt: serverTimestamp(),
      notes: [inventoryItem.notes, `Perda registrada: ${lossReason} - ${quote.clientName} / ${piece.name}${lossNotes ?` - ${lossNotes}` : ''}`].filter(Boolean).join('\n'),
    });

    await logSystemEvent({
      type: 'inventory_updated',
      title: 'Perda de peça registrada',
      description: `${quote.clientName} - ${piece.name} (${lossReason})`,
      entityType: 'inventory',
      entityId: inventoryItem.id,
      quoteId: quote.id,
      quoteStatus: quote.status,
      clientId: quote.clientId,
      clientName: quote.clientName,
      materialId: inventoryItem.materialId,
      materialName: inventoryItem.materialName,
      userUid: appUid || '',
      userName: currentUserName,
      metadata: {reason: lossReason, notes: lossNotes, area: inventoryItem.area, pieceId: piece.id, pieceName: piece.name},
    });

    setShowLossModal(false);
    resetLossForm();
  };

  const openEditLossModal = async (item: InventoryItem) => {
    if (!hasPermission('estoque', 'movimentar')) return;
    await ensureQuotesLoaded();
    setLossQuoteId(item.lossQuoteId || '');
    setLossPieceId(item.lossPieceId || '');
    setLossInventoryId(item.id);
    setLossReason(item.lossReason || 'Quebra');
    setLossNotes(item.lossNotes || '');
    setShowLossModal(true);
  };

  const restoreLoss = async (item: InventoryItem) => {
    if (!hasPermission('estoque', 'movimentar')) {
      alert('Você não tem permissão para movimentar o estoque. Fale com o administrador.');
      return;
    }
    const confirmed = window.confirm('Retirar esta perda e voltar a chapa para Disponível?');
    if (!confirmed) return;
    await updateDoc(doc(db, 'inventory', item.id), {
      status: 'Disponível',
      lossReason: '',
      lossNotes: '',
      lossQuoteId: '',
      lossClientId: '',
      lossClientName: '',
      lossPieceId: '',
      lossPieceName: '',
      lostByUid: '',
      lostByName: '',
      lostAt: null,
      notes: item.notes || '',
    });
    await logSystemEvent({
      type: 'inventory_updated',
      title: 'Perda retirada',
      description: `${item.materialName} - ${item.code || 'Sem lote'}`,
      entityType: 'inventory',
      entityId: item.id,
      materialId: item.materialId,
      materialName: item.materialName,
      userUid: appUid || '',
      userName: currentUserName,
      metadata: {area: item.area, status: 'Disponível'},
    });
  };

  const filteredItems = items.filter((item) => {
    const searchText = `${item.materialName} ${item.code} ${item.provider} ${item.rackId || ''} ${item.category || ''} ${item.materialLine || ''} ${item.materialType || ''} ${item.texture || ''} ${item.thicknessLabel || ''}`.toLowerCase();
    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesStatus = !statusFilter || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const activePatioItems = items.filter((item) => !['usada', 'descarte'].includes(normalizeStatus(item.status)));
  const rackItemsMap = useMemo(() => patioRacks.reduce((map, rack) => {
    map.set(rack, activePatioItems.filter((item) => item.rackId === rack));
    return map;
  }, new Map<string, InventoryItem[]>()), [activePatioItems]);
  const unassignedPatioItems = activePatioItems.filter((item) => !item.rackId);
  const rackArea = (rack: string) => activePatioItems
    .filter((item) => item.rackId === rack)
    .reduce((acc, item) => acc + (item.area || 0), 0);
  const selectedRackItems = selectedPatioPanel === UNASSIGNED_PANEL_ID
    ? unassignedPatioItems
    : (rackItemsMap.get(selectedPatioPanel) || []);
  const selectedTimelineItem = items.find((item) => item.id === focusedInventoryId) || selectedRackItems[0] || null;
  const rackAreaMap = useMemo(() => patioRacks.reduce((map, rack) => {
    map.set(rack, rackArea(rack));
    return map;
  }, new Map<string, number>()), [activePatioItems]);
  const maxRackArea = Math.max(0, ...Array.from(rackAreaMap.values()));
  const selectedRackArea = selectedPatioPanel === UNASSIGNED_PANEL_ID ? 0 : (rackAreaMap.get(selectedPatioPanel) || 0);
  const selectedTimelineEvents = useMemo(() => {
    if (!selectedTimelineItem) return [];
    return systemEvents
      .filter((event) =>
        event.entityId === selectedTimelineItem.id ||
        (event.materialId && event.materialId === selectedTimelineItem.materialId),
      )
      .slice(0, 8);
  }, [selectedTimelineItem, systemEvents]);
  const rackOccupancyPercent = (rack: string) => {
    const area = rackAreaMap.get(rack) || 0;
    if (!maxRackArea) return 0;
    return Math.round((area / maxRackArea) * 100);
  };
  const statusCountForRack = (rack: string) => {
    const rackItems = rackItemsMap.get(rack) || [];
    return {
      available: rackItems.filter((item) => normalizeStatus(item.status) === 'disponivel').length,
      reserved: rackItems.filter((item) => normalizeStatus(item.status) === 'reservada').length,
      scraps: rackItems.filter((item) => normalizeStatus(item.status) === 'retalho').length,
    };
  };
  const locateInventoryItem = (item: InventoryItem) => {
    const nextRack = item.rackId || '';
    if (nextRack) {
      setSelectedRackId(nextRack);
      setSelectedPatioPanel(nextRack);
    } else {
      setSelectedPatioPanel(UNASSIGNED_PANEL_ID);
    }
    setFocusedInventoryId(item.id);
    patioMapRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
  };

  const quoteReservedArea = reservations
    .filter((reservation) => isActiveReservation(reservation))
    .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const quoteSoldArea = reservations
    .filter((reservation) => isSoldReservation(reservation))
    .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const manualReservedArea = items
    .filter((item) => normalizeStatus(item.status) === 'reservada')
    .reduce((acc, item) => acc + item.area, 0);
  const totalReservedArea = manualReservedArea + quoteReservedArea;
  const totalPhysicalArea = items
    .filter((item) => !['usada', 'descarte'].includes(normalizeStatus(item.status)))
    .reduce((acc, item) => acc + item.area, 0);
  const totalAvailableArea = Math.max(0, totalPhysicalArea - totalReservedArea - quoteSoldArea);

  const totalInventoryCost = items.reduce((acc, item) => acc + item.cost, 0);
  const reservedAreaByMaterial = (materialId: string) =>
    reservations
      .filter((reservation) => reservation.materialId === materialId && isActiveReservation(reservation))
      .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const soldAreaByMaterial = (materialId: string) =>
    reservations
      .filter((reservation) => reservation.materialId === materialId && isSoldReservation(reservation))
      .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const activeReservationsByMaterial = (materialId: string) =>
    reservations.filter((reservation) => reservation.materialId === materialId && isActiveReservation(reservation));
  const activeReservedAreaByMaterial = (materialId: string) =>
    reservations
      .filter((reservation) => reservation.materialId === materialId && isActiveReservation(reservation))
      .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const approvedReservedAreaByMaterial = (materialId: string) =>
    reservations
      .filter((reservation) => reservation.materialId === materialId && isApprovedReservation(reservation))
      .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const physicalAreaByMaterial = (materialId: string) =>
    items
      .filter((item) => item.materialId === materialId && !['usada', 'descarte'].includes(normalizeStatus(item.status)))
      .reduce((acc, item) => acc + item.area, 0);
  const orderedAreaByMaterial = (materialId: string) =>
    purchases
      .filter((purchase) => purchase.materialId === materialId && purchase.status === 'Pedido')
      .reduce((acc, purchase) => acc + (purchase.area || 0), 0);
  const pendingPurchases = Array.from(new Set([
    ...items.map((item) => item.materialId),
    ...reservations.map((reservation) => reservation.materialId),
    ...purchases.map((purchase) => purchase.materialId),
  ])).map((materialId) => {
    const reserved = activeReservedAreaByMaterial(materialId);
    const sold = approvedReservedAreaByMaterial(materialId);
    const preReserved = Math.max(0, reserved - sold);
    const finalizedSold = soldAreaByMaterial(materialId);
    const available = Math.max(0, physicalAreaByMaterial(materialId) - finalizedSold);
    const ordered = orderedAreaByMaterial(materialId);
    const missing = Math.max(0, reserved - available - ordered);
    const inventoryItem = items.find((item) => item.materialId === materialId);
    const material = materials.find((item) => item.id === materialId);
    return {
      materialId,
      materialName: inventoryItem?.materialName || material?.name || reservations.find((reservation) => reservation.materialId === materialId)?.materialName || materialId,
      reserved,
      preReserved,
      sold,
      available,
      ordered,
      missing,
    };
  }).filter((item) => item.missing > 0);
  const totalPendingPurchaseArea = pendingPurchases.reduce((acc, item) => acc + item.missing, 0);
  const activePurchases = purchases.filter((purchase) => purchase.status === 'Pedido');
  const activePurchaseGroups = Array.from(
    activePurchases.reduce((map, purchase) => {
      const groupId = purchase.purchaseGroupId || purchase.id;
      const current = map.get(groupId) || [];
      current.push(purchase);
      map.set(groupId, current);
      return map;
    }, new Map<string, InventoryPurchase[]>()),
  ).map(([groupId, groupedPurchases]) => ({
    groupId,
    purchases: groupedPurchases.sort((a, b) => (a.purchaseIndex || 0) - (b.purchaseIndex || 0)),
    supplier: groupedPurchases[0]?.provider || '',
    materialName: groupedPurchases[0]?.materialName || '',
    purchasedByName: groupedPurchases[0]?.purchasedByName || '',
    totalArea: groupedPurchases.reduce((sum, item) => sum + (item.area || 0), 0),
  }));
  const materialImageById = (materialId: string) => materials.find((material) => material.id === materialId)?.imageUrl || '';
  const selectedReservationMaterial = reservationMaterialId
    ? materials.find((material) => material.id === reservationMaterialId) || items.find((item) => item.materialId === reservationMaterialId)
    : null;
  const selectedReservationMaterialName = selectedReservationMaterial
    ? 'name' in selectedReservationMaterial
      ? selectedReservationMaterial.name
      : selectedReservationMaterial.materialName
    : '';
  const selectedReservations = reservationMaterialId ? activeReservationsByMaterial(reservationMaterialId) : [];
  const quoteById = (quoteId: string) => quotes.find((quote) => quote.id === quoteId);
  const selectedPurchaseMaterial = materials.find((material) => material.id === purchaseMaterialId);
  const selectedPurchaseSupplier = findSupplier(purchaseProvider);
  const selectedInventoryMaterial = materials.find((material) => material.id === selectedMaterialId);
  const selectedInventorySupplier = findSupplier(provider);
  const purchaseQuantityNumber = Math.max(1, Number(purchaseQuantity) || 1);
  const purchaseSlabRows = purchaseSlabs.slice(0, purchaseQuantityNumber);
  const purchasePreviewSlabs = purchaseMeasureMode === 'same'
    ? Array.from({length: purchaseQuantityNumber}, () => ({length: purchaseLength, width: purchaseWidth, cost: purchaseCost, minimumSalePrice: purchaseMinimumSalePrice || purchaseCost}))
    : purchaseSlabRows;
  const purchaseTotalArea = purchasePreviewSlabs.reduce((acc, slab) => acc + ((Number(slab.length) * Number(slab.width)) / 10000), 0);
  const purchaseTotalCost = purchasePreviewSlabs.reduce((acc, slab) => acc + Number(slab.cost || 0), 0);
  const purchaseTotalMinimumSale = purchasePreviewSlabs.reduce((acc, slab) => acc + Number(slab.minimumSalePrice || slab.cost || 0), 0);

  const downloadPurchaseOrder = async (groupId: string) => {
    const group = activePurchaseGroups.find((item) => item.groupId === groupId);
    if (!group) return;
    await generatePurchaseOrderPdf({
      groupId: group.groupId,
      supplier: group.supplier,
      purchases: group.purchases,
    }, settings);
  };

  const openPurchaseWhatsApp = (groupId: string) => {
    const group = activePurchaseGroups.find((item) => item.groupId === groupId);
    if (!group) return;

    const supplier = findSupplier(group.supplier);
    const whatsapp = normalizeWhatsApp(supplier?.whatsapp);

    if (!whatsapp) {
      alert('Esse fornecedor ainda não tem WhatsApp cadastrado no Admin.');
      return;
    }

    const lines = [
      `Olá${supplier?.contactName ? `, ${supplier.contactName}` : ''}. Segue pedido de compra da ${settings.companyName || 'marmoraria'}:`,
      '',
      `Fornecedor: ${group.supplier || 'Não informado'}`,
      `Material: ${group.materialName}`,
      `Especificações: ${formatMaterialSpecsWithProvider(group.purchases[0]) || 'Sem especificações'}`,
      `Quantidade: ${group.purchases.length} chapa(s)`,
      `Área total: ${formatNumber(group.totalArea)} m²`,
      '',
      'Itens do pedido:',
      ...group.purchases.map((purchase, index) => (
        `${index + 1}. ${purchase.code || `Chapa ${purchase.purchaseIndex || index + 1}`} - ${purchase.length} x ${purchase.width} cm - ${purchase.thicknessLabel || 'Sem espessura'} - ${formatNumber(purchase.area)} m²`
      )),
    ];

    const firstNote = group.purchases.map((purchase) => purchase.notes).find(Boolean);
    if (firstNote) {
      lines.push('', `Observações: ${firstNote}`);
    }

    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  };

  const cancelPurchaseGroup = async (groupId: string) => {
    if (!hasPermission('estoque', 'movimentar')) {
      alert('Você não tem permissão para cancelar compras. Fale com o administrador.');
      return;
    }
    const group = activePurchaseGroups.find((item) => item.groupId === groupId);
    if (!group) return;
    const confirmed = window.confirm('Cancelar esta compra pendente? Ela sairá da lista de pedidos, mas continuará no histórico.');
    if (!confirmed) return;

    await Promise.all(group.purchases.map((purchase) =>
      updateDoc(doc(db, 'inventoryPurchases', purchase.id), {status: 'Cancelado'}),
    ));
    await removePurchaseCalendarEvent(group.groupId);

    await logSystemEvent({
      type: 'purchase_cancelled',
      title: 'Compra cancelada',
      description: `${group.purchases.length} chapa(s) de ${group.materialName}`,
      entityType: 'purchase',
      entityId: group.purchases[0]?.id || group.groupId,
      materialId: group.purchases[0]?.materialId,
      materialName: group.materialName,
      userUid: appUid || '',
      userName: currentUserName,
      metadata: {groupId: group.groupId, quantity: group.purchases.length, status: 'Cancelado'},
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Estoque</h1>
          <p className="text-slate-500 mt-1">Entrada, compra e controle das pedras cadastradas no Admin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('estoque', 'adicionar') && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-bold text-white hover:bg-brand-primary/90 transition-all"
            >
              <Plus className="h-4 w-4" />
              Adicionar chapa
            </button>
          )}
          {hasPermission('estoque', 'movimentar') && (
            <button
              type="button"
              onClick={async () => {
                await ensureQuotesLoaded();
                resetLossForm();
                setShowLossModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 transition-all"
            >
              <AlertTriangle className="h-4 w-4" />
              Adicionar perda
            </button>
          )}
          {hasPermission('estoque', 'adicionar') && (
            <button
              type="button"
              onClick={() => {
                resetPurchaseForm();
                setShowPurchaseModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-700 transition-all"
            >
              <ShoppingCart className="h-4 w-4" />
              Comprar chapa
            </button>
          )}
        </div>
      </header>

      {loadError && (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total de Itens</div>
          <div className="text-3xl font-display font-bold text-slate-900">{items.length}</div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Área Disponível</div>
          <div className="text-3xl font-display font-bold text-brand-primary">{formatNumber(totalAvailableArea)} m²</div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Área Reservada</div>
          <div className="text-3xl font-display font-bold text-amber-600">{formatNumber(totalReservedArea)} m²</div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Área Vendida</div>
          <div className="text-3xl font-display font-bold text-green-700">{formatNumber(quoteSoldArea)} m²</div>
        </div>
        <div className={cn(
          'p-6 rounded-[32px] border shadow-sm',
          pendingPurchases.length > 0 ?'bg-amber-50 border-amber-100' : 'bg-white border-slate-100',
        )}>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Compra Pendente</div>
          <div className={cn('text-3xl font-display font-bold', pendingPurchases.length > 0 ?'text-amber-700' : 'text-slate-900')}>
            {formatNumber(totalPendingPurchaseArea)} m²
          </div>
        </div>
      </div>

      {pendingPurchases.length > 0 && (
        <div className="rounded-[28px] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl bg-amber-100 p-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold text-amber-900">Compra pendente para orçamento aprovado</h2>
              <p className="mt-1 text-sm text-amber-700">As pedras abaixo têm mais m² vendidos/reservados em orçamentos aprovados do que área disponível no estoque.</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pendingPurchases.map((item) => (
                  <div key={item.materialId} className="rounded-2xl border border-amber-100 bg-white/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold text-slate-900">{item.materialName}</div>
                      {hasPermission('estoque', 'adicionar') && (
                        <button
                          type="button"
                          onClick={() => openPurchaseModal(item)}
                          className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-amber-700 transition-all"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          Comprar
                        </button>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-slate-400">Disponível</span>
                        <strong className="text-slate-700">{formatNumber(item.available)} m²</strong>
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-slate-400">Vendido</span>
                        <strong className="text-amber-700">{formatNumber(item.reserved)} m²</strong>
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-slate-400">Pedido</span>
                        <strong className="text-blue-700">{formatNumber(item.ordered)} m²</strong>
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-slate-400">Comprar</span>
                        <strong className="text-red-600">{formatNumber(item.missing)} m²</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activePurchaseGroups.length > 0 && (
        <div className="rounded-[28px] border border-blue-100 bg-blue-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl bg-blue-100 p-2 text-blue-700">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold text-blue-950">Compras em pedido</h2>
              <p className="mt-1 text-sm text-blue-700">Quando a pedra chegar, marque como entregue para entrar no estoque e registrar quem recebeu.</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {activePurchaseGroups.map((group) => (
                  <div key={group.groupId} className="rounded-2xl border border-blue-100 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">{group.materialName}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatMaterialSpecsWithProvider(group.purchases[0]) || 'Sem especificações'}</div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                      <div><strong>{group.purchases.length}</strong> chapa(s) · <strong>{formatNumber(group.totalArea)} m²</strong></div>
                      <div className="mt-1">Fornecedor: <strong>{group.supplier || 'Não informado'}</strong></div>
                      <div className="mt-1">Previsão de entrega: <strong>{group.purchases[0]?.expectedDeliveryDateKey ? group.purchases[0].expectedDeliveryDateKey.split('-').reverse().join('/') : 'Não definida'}</strong></div>
                      <div className="mt-1">Comprado por <strong>{group.purchasedByName}</strong></div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {group.purchases.map((purchase) => (
                        <div key={purchase.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{purchase.code || `Chapa ${purchase.purchaseIndex || 1}`}</div>
                              <div className="mt-1 text-xs text-slate-400">
                                {purchase.length} x {purchase.width} cm · {purchase.thicknessLabel || 'Sem espessura'} · {formatNumber(purchase.area)} m²
                              </div>
                            </div>
                            {hasPermission('estoque', 'movimentar') && (
                              <button
                                type="button"
                                onClick={() => receivePurchase(purchase)}
                                className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-green-700 transition-all"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Receber
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => downloadPurchaseOrder(group.groupId)}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-blue-700 transition-all"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        PDF do pedido
                      </button>
                      {findSupplier(group.supplier)?.whatsapp && (
                        <button
                          type="button"
                          onClick={() => openPurchaseWhatsApp(group.groupId)}
                          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-green-700 transition-all"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </button>
                      )}
                      {hasPermission('estoque', 'movimentar') && (
                        <button
                          type="button"
                          onClick={() => cancelPurchaseGroup(group.groupId)}
                          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-700 transition-all"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancelar compra
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={patioMapRef} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-6 space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">Pátio de chapas</h2>
            <p className="mt-1 text-sm text-slate-400">Esquema do pátio visto de cima, com 9 cavaletes organizados por fileiras.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unassignedPatioItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPatioPanel(UNASSIGNED_PANEL_ID);
                  setFocusedInventoryId('');
                }}
                className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-all"
              >
                {unassignedPatioItems.length} chapa(s) sem cavalete
              </button>
            )}
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              {activePatioItems.length} chapa(s) no pátio
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="rounded-[28px] border border-slate-100 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(248,250,252,0.9)_55%,_rgba(241,245,249,0.9))] p-5">
            <div className="rounded-[24px] border border-slate-200/80 bg-white/70 p-4 shadow-inner shadow-slate-100/80">
              <div className="space-y-4">
                {patioRackRows.map((row, rowIndex) => (
                  <div
                    key={`row-${rowIndex}`}
                    className={cn(
                      'grid gap-4',
                      row.length === 1 ? 'grid-cols-1 justify-items-center' : 'grid-cols-1 md:grid-cols-2',
                    )}
                  >
                    {row.map((rack) => {
                      const rackItems = rackItemsMap.get(rack) || [];
                      const isSelected = selectedPatioPanel === rack;
                      const hasFocusedItem = rackItems.some((item) => item.id === focusedInventoryId);
                      const area = rackAreaMap.get(rack) || 0;
                      const occupancy = rackOccupancyPercent(rack);
                      const counts = statusCountForRack(rack);
                      const hasReserved = counts.reserved > 0;
                      const hasScraps = counts.scraps > 0;

                      return (
                        <button
                          key={rack}
                          type="button"
                          onClick={() => {
                            setSelectedRackId(rack);
                            setSelectedPatioPanel(rack);
                            setFocusedInventoryId('');
                          }}
                          className={cn(
                            'group relative w-full max-w-[480px] rounded-[30px] border bg-white/95 px-5 py-4 text-left transition-all',
                            isSelected ? 'border-brand-primary shadow-[0_18px_50px_-28px_rgba(155,112,69,0.65)]' : 'border-slate-200 hover:border-brand-primary/35 hover:bg-white',
                            hasFocusedItem && 'ring-2 ring-brand-primary ring-offset-2 ring-offset-slate-50',
                          )}
                        >
                          <div className="relative overflow-hidden rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-4 py-4">
                            <div className="pointer-events-none absolute inset-y-4 left-4 w-6 rounded-full border border-slate-300 bg-slate-100/80" />
                            <div className="pointer-events-none absolute inset-y-4 right-4 w-6 rounded-full border border-slate-300 bg-slate-100/80" />
                            <div className="pointer-events-none absolute left-[calc(1rem+1.5rem)] right-[calc(1rem+1.5rem)] top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200" />
                            <div className="pointer-events-none absolute left-[calc(1rem+1.5rem)] right-[calc(1rem+1.5rem)] top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand-primary/15" style={{width: `${Math.max(14, occupancy)}%`}} />

                            <div className="relative z-10 flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">Cavalete</div>
                                <div className="mt-1 font-display text-2xl font-bold text-slate-900">{rack.replace('Cavalete ', '')}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Ocupação</div>
                                <div className="mt-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{occupancy}%</div>
                              </div>
                            </div>

                            <div className="relative z-10 mt-14 grid grid-cols-2 gap-2 text-xs font-semibold">
                              <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">{rackItems.length} chapa(s)</div>
                              <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">{formatNumber(area)} m²</div>
                            </div>

                            <div className="relative z-10 mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                                {counts.available} disponível
                              </span>
                              <span className={cn(
                                'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
                                hasReserved ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500',
                              )}>
                                {counts.reserved} reservada
                              </span>
                              <span className={cn(
                                'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
                                hasScraps ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500',
                              )}>
                                {counts.scraps} retalho
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-100 bg-white p-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-50 pb-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Selecionado</div>
                <div className="font-display text-lg font-bold text-slate-900">
                  {selectedPatioPanel === UNASSIGNED_PANEL_ID ? 'Sem cavalete' : selectedPatioPanel}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {selectedPatioPanel === UNASSIGNED_PANEL_ID ? 'Pendentes' : 'Área'}
                </div>
                <div className="font-mono text-sm font-bold text-slate-700">
                  {selectedPatioPanel === UNASSIGNED_PANEL_ID ? `${unassignedPatioItems.length} chapa(s)` : `${formatNumber(selectedRackArea)} m²`}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Itens</div>
                <div className="mt-1 font-mono text-lg font-bold text-slate-900">{selectedRackItems.length}</div>
              </div>
              <div className="rounded-2xl bg-amber-50 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Reservadas</div>
                <div className="mt-1 font-mono text-lg font-bold text-amber-800">
                  {selectedRackItems.filter((item) => normalizeStatus(item.status) === 'reservada').length}
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Disponíveis</div>
                <div className="mt-1 font-mono text-lg font-bold text-emerald-800">
                  {selectedRackItems.filter((item) => normalizeStatus(item.status) === 'disponivel').length}
                </div>
              </div>
            </div>

            <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {selectedRackItems.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">
                  {selectedPatioPanel === UNASSIGNED_PANEL_ID ? 'Nenhuma chapa está sem cavalete.' : 'Nenhuma chapa neste cavalete.'}
                </div>
              ) : (
                selectedRackItems.map((item) => (
                  (() => {
                    const reservation = activeReservationsByMaterial(item.materialId)[0];
                    const linkedQuote = reservation ? quoteById(reservation.quoteId) : null;
                    const statusTone = normalizeStatus(item.status) === 'reservada'
                      ? 'bg-amber-50 text-amber-700'
                      : normalizeStatus(item.status) === 'retalho'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-emerald-50 text-emerald-700';
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'w-full rounded-2xl border p-3 text-left transition-all',
                          focusedInventoryId === item.id ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-100 bg-slate-50 hover:border-brand-primary/30',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900">{item.materialName}</div>
                            <div className="mt-1 text-xs font-mono text-brand-primary">{item.code || 'Sem lote'}</div>
                            <div className="mt-1 text-xs text-slate-500">{formatMaterialSpecsWithProvider(item) || `${item.provider || 'Sem fornecedor'} · ${item.thicknessLabel || 'Sem espessura'}`}</div>
                          </div>
                          <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest', statusTone)}>
                            {item.status}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
                          <div>{item.length} x {item.width} cm</div>
                          <div className="text-right">{formatNumber(item.area)} m²</div>
                          <div>{formatCurrency(item.cost)}</div>
                          <div className="text-right">Mín. {formatCurrency(item.minimumSalePrice ?? item.cost)}</div>
                        </div>

                        {linkedQuote && (
                          <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                            <span className="font-bold text-slate-800">Reserva ativa:</span> {linkedQuote.clientName || reservation?.clientName || 'Cliente não informado'}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setFocusedInventoryId(item.id)}
                            className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all"
                          >
                            Destacar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-brand-primary hover:bg-brand-primary/5 transition-all"
                          >
                            Mover / editar
                          </button>
                          {linkedQuote && (
                            <button
                              type="button"
                              onClick={() => navigate(`/quotes/edit/${linkedQuote.id}`)}
                              className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-700 hover:bg-amber-50 transition-all"
                            >
                              Ver orçamento
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ))
              )}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Linha do tempo</div>
              <div className="mt-1 font-semibold text-slate-800">
                {selectedTimelineItem ? `${selectedTimelineItem.materialName} · ${selectedTimelineItem.code || 'Sem lote'}` : 'Selecione uma chapa'}
              </div>
              <div className="mt-3 space-y-2">
                {!selectedTimelineItem ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">
                    Destaque uma chapa para acompanhar aqui as alterações de estoque, reserva, compra e perda.
                  </div>
                ) : selectedTimelineEvents.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">
                    Ainda não há movimentações registradas para esta chapa.
                  </div>
                ) : (
                  selectedTimelineEvents.map((event) => {
                    const createdAt = toDate(event.createdAt);
                    return (
                      <div key={event.id} className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-sm font-bold text-slate-900">{event.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{event.description || event.quoteStatus || 'Movimentação registrada'}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-400">
                          <span>{createdAt ? createdAt.toLocaleDateString('pt-BR') : 'Sem data'}</span>
                          {event.userName && <span>{event.userName}</span>}
                          {event.quoteStatus && <span>{event.quoteStatus}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por pedra, lote, fornecedor, linha ou textura..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all text-sm font-medium"
            >
              <option value="">Todos os Status</option>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Pedra / Lote</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Dimensões (cm)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Área</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Compra / mínimo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ?(
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Carregando estoque...</td></tr>
              ) : filteredItems.length === 0 ?(
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Nenhuma pedra encontrada.</td></tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className={cn('transition-colors group', focusedInventoryId === item.id ?'bg-brand-primary/5' : 'hover:bg-slate-50/50')}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-full border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                          {item.photoUrl || materialImageById(item.materialId) ?(
                            <img src={item.photoUrl || materialImageById(item.materialId)} alt={item.materialName} className="h-full w-full object-cover" />
                          ) : (
                            <PackageCheck className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{item.materialName}</div>
                          <div className="text-xs text-brand-primary font-mono">{item.code}</div>
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <MapPin className="h-3 w-3" />
                            {item.rackId || 'Sem cavalete'}
                          </div>
                          <div className="text-xs text-slate-400">{formatMaterialSpecsWithProvider(item) || `${item.category || 'Sem categoria'} · ${item.provider || 'Sem fornecedor'}`}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {item.length} x {item.width}
                      <div className="text-xs text-slate-400">{item.thicknessLabel || (item.thickness ? `${item.thickness}` : 'Sem espessura')}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">{formatNumber(item.area)} m²</td>
                    <td className="px-6 py-4 font-mono text-sm">
                      <div>{formatCurrency(item.cost)}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-green-700">Mín. {formatCurrency(item.minimumSalePrice ?? item.cost)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase',
                        item.status === 'Disponível' ?'bg-green-50 text-green-600' :
                        item.status === 'Reservada' ?'bg-amber-50 text-amber-600' :
                        item.status === 'Retalho' ?'bg-blue-50 text-blue-600' :
                        'bg-slate-100 text-slate-500',
                      )}>
                        {item.status}
                      </span>
                      {reservedAreaByMaterial(item.materialId) > 0 && (
                        <button
                          type="button"
                          onClick={() => setReservationMaterialId(item.materialId)}
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 transition-all"
                        >
                          <Eye className="h-3 w-3" />
                          {formatNumber(reservedAreaByMaterial(item.materialId))} m² em orçamentos
                        </button>
                      )}
                      {soldAreaByMaterial(item.materialId) > 0 && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700">
                          {formatNumber(soldAreaByMaterial(item.materialId))} m² vendido/finalizado
                        </div>
                      )}
                      {item.lossReason && (
                        <div className="mt-1 max-w-[220px] rounded-lg bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">
                          Perda: {item.lossReason}
                          {item.lossClientName ?` · ${item.lossClientName}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => locateInventoryItem(item)} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all" title="Localizar no pátio">
                          <LocateFixed className="w-4 h-4" />
                        </button>
                        {item.lossReason && hasPermission('estoque', 'movimentar') && (
                          <>
                            <button type="button" onClick={() => openEditLossModal(item)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Editar perda">
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => restoreLoss(item)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all" title="Retirar perda">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {hasPermission('estoque', 'editar') && (
                          <button type="button" onClick={() => handleEdit(item)} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('estoque', 'excluir') && (
                          <button type="button" aria-label="Excluir" title="Excluir" onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {purchases.length > 0 && (
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
          <div className="p-5 border-b border-slate-50">
            <h2 className="font-display text-xl font-bold text-slate-900">Histórico de compras</h2>
            <p className="mt-1 text-sm text-slate-400">Controle de pedidos, entregas e responsáveis.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Pedra</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Área</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Comprou</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Recebeu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{purchase.materialName}</div>
                      <div className="text-xs text-brand-primary font-mono">{purchase.code || 'Sem lote'}</div>
                      <div className="text-xs text-slate-400">{formatMaterialSpecsWithProvider(purchase) || `${purchase.category || 'Sem categoria'} · ${purchase.provider || 'Sem fornecedor'}`}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">{formatNumber(purchase.area)} m²</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase',
                        purchase.status === 'Entregue' ?'bg-green-50 text-green-600' :
                        purchase.status === 'Cancelado' ?'bg-red-50 text-red-600' :
                        'bg-blue-50 text-blue-600',
                      )}>
                        {purchase.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{purchase.purchasedByName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{purchase.receivedByName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reservationMaterialId && selectedReservationMaterial && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">Reservas em orçamento</h2>
                <p className="text-sm text-slate-500 mt-1">{selectedReservationMaterialName}</p>
              </div>
              <button type="button" onClick={() => setReservationMaterialId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {selectedReservations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum orçamento reservando este material.</div>
              ) : (
                selectedReservations.map((reservation) => {
                  const quote = quoteById(reservation.quoteId);
                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => navigate(`/quotes/edit/${reservation.quoteId}`)}
                      className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-all"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900">{reservation.clientName || quote?.clientName || 'Cliente não informado'}</div>
                          <div className="mt-1 text-xs text-slate-400">Orçamento #{reservation.quoteId.slice(0, 8)} · {reservation.quoteStatus}</div>
                          {quote?.environment && <div className="mt-1 text-xs text-slate-500">Ambiente: {quote.environment}</div>}
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2 text-right">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Usando</div>
                          <div className="font-mono font-bold text-amber-700">{formatNumber(reservation.area || 0)} m²</div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showLossModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">Registrar perda</h2>
                <p className="mt-1 text-sm text-slate-400">Informe qual peça de qual cliente foi perdida e o motivo.</p>
              </div>
              <button type="button" onClick={() => { setShowLossModal(false); resetLossForm(); }} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleLossSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-500 font-medium text-sm">Cliente / orçamento</label>
                  <select
                    required
                    value={lossQuoteId}
                    onChange={(e) => {
                      setLossQuoteId(e.target.value);
                      setLossPieceId('');
                      setLossInventoryId('');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  >
                    <option value="">Selecionar cliente e orçamento</option>
                    {quotes.map((quote) => (
                      <option key={quote.id} value={quote.id}>
                        {quote.clientName} · {quote.environment || 'Sem ambiente'} · {formatCurrency(quote.totalPrice || 0)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Peça perdida</label>
                  <select
                    required
                    value={lossPieceId}
                    onChange={(e) => {
                      setLossPieceId(e.target.value);
                      setLossInventoryId('');
                    }}
                    disabled={!selectedLossQuote}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium disabled:opacity-60"
                  >
                    <option value="">Selecionar peça</option>
                    {(selectedLossQuote?.pieces || []).map((piece) => (
                      <option key={piece.id} value={piece.id}>
                        {piece.name} · {(piece.totalArea || piece.manualArea || piece.area || 0).toFixed(4)} m²
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Chapa afetada</label>
                  <select
                    required
                    value={lossInventoryId}
                    onChange={(e) => setLossInventoryId(e.target.value)}
                    disabled={!selectedLossPiece}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium disabled:opacity-60"
                  >
                    <option value="">Selecionar chapa do estoque</option>
                    {lossInventoryOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.materialName} · {item.code || 'Sem lote'} · {formatNumber(item.area)} m²
                      </option>
                    ))}
                  </select>
                  {selectedLossPiece && lossInventoryOptions.length === 0 && (
                    <p className="text-xs font-semibold text-red-600">Nenhuma chapa disponível para o material desta peça.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Motivo da perda</label>
                  <select
                    value={lossReason}
                    onChange={(e) => setLossReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  >
                    <option value="Quebra">Quebra</option>
                    <option value="Erro na medida">Erro na medida</option>
                    <option value="Erro de material">Erro de material</option>
                    <option value="Defeito da chapa">Defeito da chapa</option>
                    <option value="Erro de corte">Erro de corte</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-500 font-medium text-sm">Observações</label>
                  <textarea
                    value={lossNotes}
                    onChange={(e) => setLossNotes(e.target.value)}
                    placeholder="Ex: peça quebrou durante transporte, medida errada na pia, material trincado..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[90px]"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                Ao salvar, a chapa selecionada será marcada como <strong>Descarte</strong> e deixará de contar como área disponível no estoque.
              </div>

              <button type="submit" className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all active:scale-95">
                Registrar perda
              </button>
            </form>
          </div>
        </div>
      )}

      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">Registrar compra</h2>
                <p className="mt-1 text-sm text-slate-400">Escolha a pedra, quantidade de chapas e medidas. Comprado por {currentUserName}</p>
              </div>
              <button type="button" onClick={() => { setShowPurchaseModal(false); resetPurchaseForm(); }} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handlePurchaseSubmit} className="space-y-6">
              {purchaseDraftRecovered && (
                <DraftNotice
                  message="O último rascunho desta compra foi restaurado. Você pode revisar ou limpar antes de continuar."
                  savedAt={purchaseDraftSavedAt}
                  onClear={clearPurchaseDraftState}
                />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Pedra cadastrada (Admin)</label>
                  <select
                    required
                    value={purchaseMaterialId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const selected = materials.find((material) => material.id === nextId);
                      setPurchaseMaterialId(nextId);
                      setPurchaseMaterialName(selected?.name || '');
                      setPurchaseProvider(selected?.provider || '');
                      setPurchaseCategory(selected?.category || '');
                      setPurchaseMaterialLine(selected?.materialLine || selected?.category || '');
                      setPurchaseMaterialType(selected?.materialType || 'Chapa');
                      setPurchaseThicknessLabel(selected?.thicknessLabel || '');
                      setPurchaseTexture(selected?.texture || '');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  >
                    <option value="">Selecione uma pedra</option>
                    {materials.filter((material) => material.active !== false).map((material) => (
                      <option key={material.id} value={material.id}>{material.name}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white flex items-center justify-center">
                    {selectedPurchaseMaterial?.imageUrl ?(
                      <img src={selectedPurchaseMaterial.imageUrl} alt={selectedPurchaseMaterial.name} className="h-full w-full object-cover" />
                    ) : (
                      <PackageCheck className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Imagem da pedra</div>
                    <div className="font-semibold text-slate-900">{selectedPurchaseMaterial?.name || 'Selecione uma pedra'}</div>
                    <div className="text-sm text-slate-500">
                      {selectedPurchaseMaterial ? formatMaterialSpecsWithProvider(selectedPurchaseMaterial) || 'Sem especificações cadastradas' : 'Imagem e informações aparecem aqui'}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Código / Lote base</label>
                  <input type="text" required value={purchaseCode} onChange={(e) => setPurchaseCode(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Quantidade de chapas</label>
                  <input type="number" min="1" required value={purchaseQuantity} onChange={(e) => updatePurchaseQuantity(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Fornecedor</label>
                  <select value={purchaseProvider} onChange={(e) => setPurchaseProvider(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Selecionar fornecedor</option>
                    {supplierOptions.map((supplier) => <option key={supplier.name} value={supplier.name}>{supplier.name}</option>)}
                  </select>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Dados do fornecedor</div>
                  <div className="font-semibold text-slate-900">{selectedPurchaseSupplier?.name || 'Selecione um fornecedor'}</div>
                  <div className="text-sm text-slate-500">{selectedPurchaseSupplier?.contactName ? `Contato: ${selectedPurchaseSupplier.contactName}` : 'Contato não cadastrado'}</div>
                  <div className="text-sm text-slate-500">{selectedPurchaseSupplier?.whatsapp ? `WhatsApp: ${selectedPurchaseSupplier.whatsapp}` : 'WhatsApp não cadastrado'}</div>
                  <div className="text-sm text-slate-500">{selectedPurchaseSupplier?.city ? `Cidade: ${selectedPurchaseSupplier.city}` : 'Cidade não cadastrada'}</div>
                  {selectedPurchaseSupplier?.notes ? <div className="text-sm text-slate-500">{selectedPurchaseSupplier.notes}</div> : null}
                </div>
                <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Informações da pedra selecionada</div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-[140px,1fr] gap-4">
                    <div className="h-28 overflow-hidden rounded-2xl border border-slate-200 bg-white flex items-center justify-center">
                      {selectedPurchaseMaterial?.imageUrl ?(
                        <img src={selectedPurchaseMaterial.imageUrl} alt={selectedPurchaseMaterial.name} className="h-full w-full object-cover" />
                      ) : (
                        <PackageCheck className="h-6 w-6 text-slate-400" />
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div><span className="font-semibold text-slate-700">Nome:</span> <span className="text-slate-600">{selectedPurchaseMaterial?.name || '-'}</span></div>
                      <div><span className="font-semibold text-slate-700">Fornecedor:</span> <span className="text-slate-600">{selectedPurchaseMaterial?.provider || '-'}</span></div>
                      <div><span className="font-semibold text-slate-700">Categoria:</span> <span className="text-slate-600">{selectedPurchaseMaterial?.category || '-'}</span></div>
                      <div><span className="font-semibold text-slate-700">Linha:</span> <span className="text-slate-600">{selectedPurchaseMaterial?.materialLine || '-'}</span></div>
                      <div><span className="font-semibold text-slate-700">Tipo:</span> <span className="text-slate-600">{selectedPurchaseMaterial?.materialType || '-'}</span></div>
                      <div><span className="font-semibold text-slate-700">Textura:</span> <span className="text-slate-600">{selectedPurchaseMaterial?.texture || '-'}</span></div>
                      <div><span className="font-semibold text-slate-700">Espessura:</span> <span className="text-slate-600">{selectedPurchaseMaterial?.thicknessLabel || '-'}</span></div>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Categoria</label>
                  <select value={purchaseCategory} onChange={(e) => setPurchaseCategory(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Selecionar categoria</option>
                    {materialCatalog.materialCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Linha do material</label>
                  <select value={purchaseMaterialLine} onChange={(e) => { setPurchaseMaterialLine(e.target.value); }} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Selecionar linha</option>
                    {materialCatalog.materialLines.map((line) => <option key={line} value={line}>{line}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Tipo do material</label>
                  <select value={purchaseMaterialType} onChange={(e) => { setPurchaseMaterialType(e.target.value); setPurchaseThicknessLabel(''); }} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    {materialCatalog.materialTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Textura</label>
                  <select value={purchaseTexture} onChange={(e) => setPurchaseTexture(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Selecionar textura</option>
                    {materialCatalog.textures.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Previsão de entrega</label>
                  <input
                    type="date"
                    required
                    value={purchaseExpectedDeliveryDate}
                    onChange={(e) => setPurchaseExpectedDeliveryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  />
                </div>

                <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-2 flex gap-2">
                  <button type="button" onClick={() => setPurchaseMeasureMode('same')} className={cn('flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all', purchaseMeasureMode === 'same' ?'bg-brand-primary text-white shadow-sm' : 'bg-white text-slate-500 hover:text-slate-900')}>
                    Mesma medida
                  </button>
                  <button type="button" onClick={() => setPurchaseMeasureMode('different')} className={cn('flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all', purchaseMeasureMode === 'different' ?'bg-brand-primary text-white shadow-sm' : 'bg-white text-slate-500 hover:text-slate-900')}>
                    Medida diferente
                  </button>
                </div>

                {purchaseMeasureMode === 'same' ? (
                  <div className="md:col-span-2 rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Medida usada em todas as chapas</div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      <input type="number" required value={purchaseLength} onChange={(e) => setPurchaseLength(e.target.value)} placeholder="Comprimento (cm)" className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                      <input type="number" required value={purchaseWidth} onChange={(e) => setPurchaseWidth(e.target.value)} placeholder="Largura (cm)" className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                      <select value={purchaseThicknessLabel} onChange={(e) => { setPurchaseThicknessLabel(e.target.value); setPurchaseThickness(String(parseThicknessValue(e.target.value))); }} className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                        <option value="">Espessura</option>
                        {purchaseThicknessOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <input type="number" step="0.01" required value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="Compra por chapa" className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                      <input type="number" step="0.01" required value={purchaseMinimumSalePrice} onChange={(e) => setPurchaseMinimumSalePrice(e.target.value)} placeholder="Mínimo de venda" className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                    </div>
                  </div>
                ) : (
                  <div className="md:col-span-2 space-y-3">
                    {purchaseSlabRows.map((slab, index) => (
                      <div key={index} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                        <div className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Chapa {index + 1}</div>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                          <input type="text" value={slab.code} onChange={(e) => updatePurchaseSlab(index, 'code', e.target.value)} placeholder={`Lote ${index + 1}`} className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                          <input type="number" required value={slab.length} onChange={(e) => updatePurchaseSlab(index, 'length', e.target.value)} placeholder="Comprimento" className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                          <input type="number" required value={slab.width} onChange={(e) => updatePurchaseSlab(index, 'width', e.target.value)} placeholder="Largura" className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                          <input type="number" value={slab.thickness} onChange={(e) => updatePurchaseSlab(index, 'thickness', e.target.value)} placeholder="Espessura" className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                          <input type="number" step="0.01" required value={slab.cost} onChange={(e) => updatePurchaseSlab(index, 'cost', e.target.value)} placeholder="Compra" className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                          <input type="number" step="0.01" required value={slab.minimumSalePrice} onChange={(e) => updatePurchaseSlab(index, 'minimumSalePrice', e.target.value)} placeholder="Venda mín." className="bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-slate-100 border border-slate-200 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Área total calculada</div>
                    <div className="mt-1 font-mono text-xl font-bold text-slate-800">{formatNumber(purchaseTotalArea)} m²</div>
                  </div>
                  <div className="rounded-2xl bg-slate-100 border border-slate-200 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Compra total calculada</div>
                    <div className="mt-1 font-mono text-xl font-bold text-slate-800">{formatCurrency(purchaseTotalCost)}</div>
                  </div>
                  <div className="rounded-2xl bg-green-50 border border-green-100 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-green-700">Mínimo total de venda</div>
                    <div className="mt-1 font-mono text-xl font-bold text-green-800">{formatCurrency(purchaseTotalMinimumSale)}</div>
                  </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-500 font-medium text-sm">Observações</label>
                  <textarea value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[60px]" />
                </div>
              </div>

              <button type="submit" className="w-full bg-amber-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition-all active:scale-95">
                Registrar {purchaseQuantityNumber} chapa(s)
              </button>
              <DraftAutosaveStatus savedAt={purchaseDraftSavedAt} className="text-center" />
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-slate-900">
                {editingItem ?'Editar Pedra' : 'Nova Pedra no Estoque'}
              </h2>
              <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {!editingItem && inventoryDraftRecovered && (
                <DraftNotice
                  message="O último preenchimento desta pedra foi recuperado para você continuar sem perder dados."
                  savedAt={inventoryDraftSavedAt}
                  onClear={clearInventoryDraftState}
                />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Pedra cadastrada (Admin)</label>
                  <select
                    required
                    value={selectedMaterialId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const selected = materials.find((material) => material.id === nextId);
                      setSelectedMaterialId(nextId);
                      setMaterialName(selected?.name || '');
                      setPhotoPreview(selected?.imageUrl || '');
                      if (!editingItem) {
                        setProvider(selected?.provider || '');
                        setCategory(selected?.category || '');
                        setMaterialLine(selected?.materialLine || selected?.category || '');
                        setMaterialType(selected?.materialType || 'Chapa');
                        setThicknessLabel(selected?.thicknessLabel || '');
                        setTexture(selected?.texture || '');
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  >
                    <option value="">Selecione uma pedra</option>
                    {materials.filter((material) => material.active !== false).map((material) => (
                      <option key={material.id} value={material.id}>{material.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Código / Lote</label>
                  <input type="text" required value={code} onChange={(e) => setCode(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Fornecedor</label>
                  <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Selecionar fornecedor</option>
                    {supplierOptions.map((supplier) => <option key={supplier.name} value={supplier.name}>{supplier.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Cavalete no pátio</label>
                  <select value={rackId} onChange={(e) => setRackId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Sem cavalete</option>
                    {patioRacks.map((rack) => <option key={rack} value={rack}>{rack}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Categoria</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Selecionar categoria</option>
                    {materialCatalog.materialCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Linha do material</label>
                  <select value={materialLine} onChange={(e) => { setMaterialLine(e.target.value); }} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Selecionar linha</option>
                    {materialCatalog.materialLines.map((line) => <option key={line} value={line}>{line}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Tipo do material</label>
                  <select value={materialType} onChange={(e) => { setMaterialType(e.target.value); setThicknessLabel(''); }} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    {materialCatalog.materialTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Textura</label>
                  <select value={texture} onChange={(e) => setTexture(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    <option value="">Selecionar textura</option>
                    {materialCatalog.textures.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as InventoryItem['status'])} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2 md:col-span-2">
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Comprimento (cm)</label>
                    <input type="number" required value={length} onChange={(e) => setLength(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Largura (cm)</label>
                    <input type="number" required value={width} onChange={(e) => setWidth(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Espessura</label>
                    <select value={thicknessLabel} onChange={(e) => { setThicknessLabel(e.target.value); setThickness(String(parseThicknessValue(e.target.value))); }} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                      <option value="">Selecionar</option>
                      {thicknessOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Valor de compra da chapa</label>
                  <input type="number" step="0.01" required value={cost} onChange={(e) => setCost(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Valor mínimo de venda</label>
                  <input type="number" step="0.01" required value={minimumSalePrice} onChange={(e) => setMinimumSalePrice(e.target.value)} placeholder="Mínimo para vender esta chapa" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-500 font-medium text-sm">Imagem da pedra</label>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 shrink-0 rounded-full border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                        {photoPreview ?(
                          <img src={photoPreview} alt="Prévia da pedra" className="h-full w-full object-cover" />
                        ) : (
                          <ImagePlus className="w-6 h-6 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setPhotoFile(file);
                            if (file) {
                              setPhotoPreview(URL.createObjectURL(file));
                            } else {
                              setPhotoPreview(editingItem?.photoUrl || '');
                            }
                          }}
                          className="w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-primary file:px-3 file:py-2 file:text-white file:font-semibold hover:file:bg-brand-primary/90"
                        />
                        <p className="mt-1 text-xs text-slate-400">A imagem será salva e exibida em círculo na lista.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-500 font-medium text-sm">Observações</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[60px]" />
                </div>
              </div>

              <button type="submit" className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95">
                {editingItem ?'Salvar Alterações' : 'Adicionar ao Estoque'}
              </button>
              {!editingItem && (
                <DraftAutosaveStatus savedAt={inventoryDraftSavedAt} className="text-center" />
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

