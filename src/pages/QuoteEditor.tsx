import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, Timestamp, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSettings } from '../hooks/useSettings';
import { Client, CondominiumRule, EmployeeAssignment, FixtureCatalogItem, FixtureCategory, InventoryItem, InventoryReservation, Material, PieceSide, Quote, QuotePiece, QuoteStatus, QuoteStatusHistory, UserMaterialPrice } from '../types';
import { useQuoteCalculator } from '../hooks/useQuoteCalculator';
import {
  ArrowLeft, Save, Plus, Trash2, Pencil,
  ChevronDown, ChevronUp, Calculator,
  MapPin, Phone, User,
  Layers, PenTool
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { DrawingCanvas } from '../components/DrawingCanvas';
import {applyQuoteInventoryByStatusTransition} from '../lib/inventoryReservations';
import {logSystemEvent} from '../lib/systemEvents';
import {normalizeQuoteStatus} from '../lib/quoteStatus';

type QuoteCutoutState = { cooktop: number; sinkUnder: number; sinkOver: number; faucetHole: number; trashBinCutout: number; popUpTowerCutout: number; wetAreaAmericanRecess: number; wetAreaItalianRecess: number };

const normalizeStockStatus = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const QuoteEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [userMaterialPrices, setUserMaterialPrices] = useState<UserMaterialPrice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [environment, setEnvironment] = useState('');
  const [responsible, setResponsible] = useState(user?.displayName || '');
  const [materialId, setMaterialId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [deliveryDays, setDeliveryDays] = useState(15);
  const [measurementDate, setMeasurementDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [validityDays, setValidityDays] = useState(15);
  const [commercialNotes, setCommercialNotes] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('Orçamento');
  const [originalStatus, setOriginalStatus] = useState<QuoteStatus>('Orçamento');
  const [pieces, setPieces] = useState<QuotePiece[]>([]);
  const [cutouts, setCutouts] = useState<QuoteCutoutState>({ cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0, trashBinCutout: 0, popUpTowerCutout: 0, wetAreaAmericanRecess: 0, wetAreaItalianRecess: 0 });
  const [showDrawing, setShowDrawing] = useState<string | null>(null);
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignment[]>([]);
  const [statusHistory, setStatusHistory] = useState<QuoteStatusHistory[]>([]);
  const [fixtureCatalog, setFixtureCatalog] = useState<FixtureCatalogItem[]>([]);

  const selectedBaseMaterial = materials.find(m => m.id === materialId);
  const selectedUserPrice = userMaterialPrices.find((price) => price.materialId === materialId);
  const selectedMaterial = selectedBaseMaterial && selectedUserPrice
    ?{...selectedBaseMaterial, marginPercentage: selectedUserPrice.marginPercentage, pricePerM2: selectedUserPrice.pricePerM2}
    : selectedBaseMaterial;
  const selectedClient = clients.find(c => c.id === clientId);
  const { calculatePieceArea, calculateTotal, calculateSculptedSink } = useQuoteCalculator(settings, selectedMaterial);
  const currentUserName = profile?.name || user?.displayName || user?.email || 'Usuário';
  
  const selectedPaymentAdjustment = settings.paymentMethods.find(m => m.name === paymentMethod)?.adjustment || 0;
  const totalPrice = calculateTotal(pieces, cutouts, selectedPaymentAdjustment);
  const totalArea = pieces.reduce((acc, p) => acc + calculatePieceArea(p).totalArea, 0);
  const materialStock = (materialIdToCheck: string) => {
    const stockItems = inventory.filter((item) => item.materialId === materialIdToCheck);
    const physicalTotal = stockItems
      .filter((item) => !['usada', 'descarte'].includes(normalizeStockStatus(item.status)))
      .reduce((sum, item) => sum + (item.area || 0), 0);
    const manualReserved = stockItems
      .filter((item) => normalizeStockStatus(item.status) === 'reservada')
      .reduce((sum, item) => sum + (item.area || 0), 0);
    const quoteReserved = reservations
      .filter((reservation) => reservation.materialId === materialIdToCheck && reservation.quoteId !== id)
      .reduce((sum, reservation) => sum + (reservation.area || 0), 0);
    const reserved = manualReserved + quoteReserved;
    return {total: physicalTotal, reserved, available: Math.max(0, physicalTotal - reserved)};
  };
  const filteredClients = clients.filter((client) => {
    const searchText = `${client.name} ${client.phone} ${client.email || ''} ${client.cpf || ''} ${client.rg || ''} ${client.address}`.toLowerCase();
    return searchText.includes(clientSearch.toLowerCase());
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
    // Listen for clients
    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    });

    const unsubCondominiums = onSnapshot(collection(db, 'condominiums'), (snap) => {
      setCondominiums(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CondominiumRule)));
    });

    // Listen for materials
    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snap) => {
      setMaterials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
    });

    const unsubUserPrices = user?.uid
      ?onSnapshot(query(collection(db, 'userMaterialPrices'), where('userId', '==', user.uid)), (snap) => {
        setUserMaterialPrices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserMaterialPrice)));
      })
      : undefined;

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snap) => {
      setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    });

    const unsubReservations = onSnapshot(collection(db, 'inventoryReservations'), (snap) => {
      setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryReservation)));
    });
    const unsubFixtureCatalog = onSnapshot(collection(db, 'fixtureCatalog'), (snap) => {
      setFixtureCatalog(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FixtureCatalogItem)));
    });

    // If editing, fetch initial quote
    const fetchQuote = async () => {
      if (id) {
        const docRef = doc(db, 'quotes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Quote;
          setClientId(data.clientId);
          setClientSearch(data.clientName || '');
          setEnvironment(data.environment);
          setResponsible(data.responsible);
          setMaterialId(data.materialId);
          setPaymentMethod(data.paymentMethod);
          setDeliveryDays(data.deliveryDays);
          setMeasurementDate(formatDateInput(data.measurementDate));
          setDeliveryDate(formatDateInput(data.deliveryDate));
          setValidityDays(15); // Adjust if needed
          setCommercialNotes(data.commercialNotes || '');
          setStatus(normalizeQuoteStatus(data.status));
          setOriginalStatus(normalizeQuoteStatus(data.status));
          setPieces(data.pieces || []);
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
      setLoading(false);
    };

    fetchQuote();

    return () => {
      unsubClients();
      unsubCondominiums();
      unsubMaterials();
      unsubUserPrices?.();
      unsubInventory();
      unsubReservations();
      unsubFixtureCatalog();
    };
  }, [id, user?.uid]);

  useEffect(() => {
    if (!id && !responsible && currentUserName !== 'Usuário') {
      setResponsible(currentUserName);
    }
  }, [currentUserName, id, responsible]);

  const addPiece = () => {
    const newPiece: QuotePiece = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Peça ${pieces.length + 1}`,
      materialId: materialId,
      unit: 'cm',
      width: 0,
      length: 0,
      area: 0,
      sides: [],
      notes: '',
      sculptedSink: {
        active: false,
        type: 'Simples',
        quantity: 1,
        width: 0,
        depth: 0,
        height: 0,
        unit: 'cm',
        calculatedArea: 0,
        calculatedValue: 0
      }
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
  };

  const updatePiece = (id: string, data: Partial<QuotePiece>) => {
    setPieces(pieces.map(p => p.id === id ?{ ...p, ...data } : p));
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

  const selectCatalogFixtureForFirstPiece = (
    fixtureKey: 'cooktop' | 'sink' | 'faucet' | 'popUpTower' | 'trashBin',
    fixtureId: string,
  ) => {
    if (!pieces.length) return;
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
    { value: 'top', label: `Comprimento superior (${piece.length || 0} cm)`, length: piece.length },
    { value: 'bottom', label: `Comprimento inferior (${piece.length || 0} cm)`, length: piece.length },
    { value: 'left', label: `Largura esquerda (${piece.width || 0} cm)`, length: piece.width },
    { value: 'right', label: `Largura direita (${piece.width || 0} cm)`, length: piece.width },
  ];

  const addSide = (pieceId: string, type: PieceSide['type']) => {
    setPieces(pieces.map(p => {
      if (p.id !== pieceId) return p;
      const firstSide = sideOptionsForPiece(p)[0];
      const defaultHeight =
        type === 'frontao' ? settings.defaultFrontonHeight :
        type === 'saia' ? settings.defaultSkirtHeight :
        type === 'rebaixo_americano' ? 2 :
        type === 'rebaixo_italiano' ? 3 :
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
    if (!clientId || !materialId) {
      alert('Por favor, selecione um cliente e um material.');
      return;
    }
    setSaving(true);
    const firstAssigned = employeeAssignments.find((item) => item.employeeId);
    
    const quoteData: Partial<Quote> = {
      clientId,
      clientName: selectedClient?.name || '',
      phone: selectedClient?.phone || '',
      address: selectedClient?.address || '',
      environment,
      responsible,
      responsibleUserUid: user?.uid || '',
      responsibleUserName: currentUserName,
      materialId,
      materialName: selectedMaterial?.name || '',
      paymentMethod,
      deliveryDays,
      validityDate: Timestamp.fromDate(new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)),
      commercialNotes,
      status,
      totalArea,
      totalPrice,
      pieces,
      cutouts,
      employeeAssignments,
      statusHistory: [...statusHistory, {
        status,
        changedAt: Timestamp.now(),
        changedByUid: user?.uid || '',
        changedByName: currentUserName,
        responsibleEmployeeId: firstAssigned?.employeeId || '',
        responsibleEmployeeName: firstAssigned?.employeeName || '',
      }],
      ...(id ?{} : {createdAt: Timestamp.now()}),
      createdBy: user?.uid || '',
    };

    try {
      if (id) {
        await setDoc(doc(db, 'quotes', id), quoteData, { merge: true });
        await applyQuoteInventoryByStatusTransition(id, originalStatus, status, quoteData);
        await logSystemEvent({
          type: 'quote_updated',
          title: 'Orçamento atualizado',
          description: `${selectedClient?.name || 'Cliente'} - ${environment || 'Sem ambiente'}`,
          entityType: 'quote',
          entityId: id,
          quoteId: id,
          quoteStatus: status,
          clientId,
          clientName: selectedClient?.name || '',
          materialId,
          materialName: selectedMaterial?.name || '',
          userUid: user?.uid || '',
          userName: currentUserName,
          metadata: {totalArea, totalPrice, pieces: pieces.length},
        });
      } else {
        const createdRef = await addDoc(collection(db, 'quotes'), quoteData);
        await applyQuoteInventoryByStatusTransition(createdRef.id, 'Orçamento', status, quoteData);
        await logSystemEvent({
          type: 'quote_created',
          title: 'Orçamento criado',
          description: `${selectedClient?.name || 'Cliente'} - ${environment || 'Sem ambiente'}`,
          entityType: 'quote',
          entityId: createdRef.id,
          quoteId: createdRef.id,
          quoteStatus: status,
          clientId,
          clientName: selectedClient?.name || '',
          materialId,
          materialName: selectedMaterial?.name || '',
          userUid: user?.uid || '',
          userName: currentUserName,
          metadata: {totalArea, totalPrice, pieces: pieces.length},
        });
      }
      setOriginalStatus(status);
      navigate('/quotes');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (settingsLoading) return <div>Carregando...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/quotes')} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
              {id ?'Editar Orçamento' : 'Novo Orçamento'}
            </h1>
            <p className="text-slate-500 mt-1">Configure as peças, materiais e condiçóes.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-brand-primary text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95 disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {saving ?'Salvando...' : 'Salvar Orçamento'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
            <div className="text-sm opacity-60 font-medium">
              Ajuste de pagamento: {selectedPaymentAdjustment}%
            </div>
          </section>

          <section className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <h2 className="font-display font-bold text-xl text-slate-800">Dados do orçamento</h2>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cliente</label>
              <select
                value={clientId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setClientId(nextId);
                  const found = clients.find((c) => c.id === nextId);
                  setClientSearch(found?.name || '');
                }}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="">Selecionar cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Material</label>
              <select
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="">Selecionar material</option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>{material.name}</option>
                ))}
              </select>
              {materialId && (
                <div className="text-[11px] text-slate-500">
                  Estoque disponível: {materialStock(materialId).available.toFixed(2)} m²
                </div>
              )}
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

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="">Selecionar forma de pagamento</option>
                {settings.paymentMethods.map((method) => (
                  <option key={method.name} value={method.name}>{method.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(normalizeQuoteStatus(e.target.value) as QuoteStatus)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="Orçamento">Orçamento</option>
                <option value="Medição">Medição</option>
                <option value="Projeto">Projeto</option>
                <option value="Aprovado">Aprovado</option>
                <option value="Produção">Produção</option>
                <option value="Acabamento">Acabamento</option>
                <option value="Entrega">Entrega</option>
                <option value="Finalizado">Finalizado</option>
              </select>
            </div>
          </section>
        </div>

        {/* Right Column: Pieces */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-display font-bold text-slate-900">Peças do Orçamento</h2>
            <button 
              onClick={addPiece}
              className="flex items-center gap-2 text-brand-primary font-bold hover:underline"
            >
              <Plus className="w-5 h-5" /> Adicionar Peça
            </button>
          </div>

          <div className="space-y-6">
            {pieces.length === 0 && (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[32px] text-center space-y-4">
                <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                <div className="text-slate-500 font-medium tracking-tight">Nenhuma peça adicionada ainda.</div>
                <button onClick={addPiece} className="text-brand-primary font-bold">Clique aqui para começar</button>
              </div>
            )}

            {pieces.map((piece, pIdx) => (
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
                  </div>
                  <button 
                    type="button"
                    aria-label="Remover peça"
                    title="Remover peça"
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
                          <div className="absolute bottom-2 right-2 bg-green-500 w-3 h-3 rounded-full border-2 border-white shadow-sm" title="Desenho t?cnico dispon?vel" />
                        </div>
                      ) : (
                        <button 
                          onClick={() => setShowDrawing(piece.id)}
                          className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-brand-primary hover:border-brand-primary/20 hover:bg-white transition-all"
                        >
                          <Pencil className="w-8 h-8 opacity-50" />
                          <span className="text-[10px] uppercase font-bold tracking-widest">Desenhar Peça</span>
                        </button>
                      )}
                    </div>

                    <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Comp. (cm)</label>
                        <input 
                          type="number" 
                          value={piece.length}
                          onChange={(e) => updatePiece(piece.id, { length: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Largura (cm)</label>
                        <input 
                          type="number" 
                          value={piece.width}
                          onChange={(e) => updatePiece(piece.id, { width: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">área Total (m²)</label>
                        <div className="px-4 py-2.5 bg-slate-100 rounded-xl font-mono text-slate-600 flex flex-col items-end">
                          <div className="flex justify-between w-full items-center">
                            <span className="text-[9px] uppercase font-bold text-slate-400">Total:</span>
                            <span className="font-bold text-slate-900">{calculatePieceArea(piece).totalArea.toFixed(4)}</span>
                          </div>
                          {piece.sculptedSink?.active && (
                            <div className="text-[8px] text-slate-400 flex flex-col w-full">
                              <div className="flex justify-between">
                                <span>Peça:</span>
                                <span>{calculatePieceArea(piece).mainArea.toFixed(4)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Cuba:</span>
                                <span>{calculatePieceArea(piece).sinkArea.toFixed(4)}</span>
                              </div>
                            </div>
                          )}
                          {piece.manualArea && (
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-1" title="Calculado via desenho" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-1 md:col-span-3">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Imagem da proposta premium</label>
                        <input
                          type="url"
                          value={piece.proposalImageUrl || ''}
                          onChange={(e) => updatePiece(piece.id, { proposalImageUrl: e.target.value })}
                          placeholder="Cole aqui o link da imagem, render ou planta desta peça"
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all"
                        />
                        <p className="text-[11px] text-slate-400">Essa imagem aparece na proposta premium. Se ficar vazio, o sistema usa o desenho t?cnico salvo.</p>
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
                              type: 'Simples', quantity: 1, width: 0, depth: 0, height: 0, unit: 'cm'
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
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tipo de Cuba</label>
                            <select 
                              value={piece.sculptedSink.type}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, type: e.target.value as any } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none"
                            >
                              <option value="Simples">Simples</option>
                              <option value="Com rampa">Com rampa</option>
                              <option value="V?lvula oculta">V?lvula oculta</option>
                              <option value="Cuba dupla">Cuba dupla</option>
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
                              const calc = calculateSculptedSink(piece.sculptedSink);
                              return (
                                <>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">área Cuba (m²)</span>
                                    <div className="text-slate-900 font-mono font-bold">{calc.area.toFixed(4)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">M?o de Obra</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatCurrency(calc.laborValue + calc.extraSinkValue)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Risco/Perda</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatCurrency(calc.lossValue)}</div>
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

                  {/* Adicionais - Frontão, Saia, etc */}
                  <div className="space-y-4 pt-4 border-t border-slate-50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Adicionais (Frontao/Saia/Virada/Pe)</h3>
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
                          + P?de bancada
                        </button>
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'guarnicao')}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                          + Guarni?o
                        </button>
                        <button 
                          type="button"
                          onClick={() => addSide(piece.id, 'rebaixo_americano')}
                          className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-bold transition-colors"
                        >
                          + Rebaixo americano
                        </button>
                        <button 
                          type="button"
                          onClick={() => addSide(piece.id, 'rebaixo_italiano')}
                          className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-bold transition-colors"
                        >
                          + Rebaixo italiano
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {piece.sides.map((side, sIdx) => (
                        <div key={sIdx} className="bg-slate-50 border border-slate-100 rounded-[20px] p-4 grid grid-cols-[minmax(0,1fr)_72px_36px] gap-3 items-end">
                          <div className="min-w-0 space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Tipo / Medida</span>
                            <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                              <select 
                                value={side.type}
                                onChange={(e) => {
                                  const newSides = [...piece.sides];
                                  newSides[sIdx].type = e.target.value as any;
                                  newSides[sIdx].height =
                                    e.target.value === 'frontao' ? settings.defaultFrontonHeight :
                                    e.target.value === 'saia' ? settings.defaultSkirtHeight :
                                    e.target.value === 'rebaixo_americano' ? 2 :
                                    e.target.value === 'rebaixo_italiano' ? 3 :
                                    settings.defaultTurnHeight;
                                  updatePiece(piece.id, { sides: newSides });
                                }}
                                className="min-w-0 bg-white border border-slate-200 rounded-lg text-xs p-1"
                              >
                                <option value="frontao">Frontão</option>
                                <option value="saia">Saia</option>
                                <option value="virada">Virada</option>
                                <option value="pe">P?de bancada</option>
                                <option value="guarnicao">Guarni?o</option>
                                <option value="rebaixo_americano">Rebaixo americano</option>
                                <option value="rebaixo_italiano">Rebaixo italiano</option>
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
                          <div className="w-16 space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Altura</span>
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
            ))}
          </div>

          <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <h2 className="font-display font-bold text-xl text-slate-800">Recortes e Acabamentos Especiais</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cooktop (Qtd)</label>
                <input 
                  type="number" 
                  value={cutouts.cooktop}
                  onChange={(e) => setCutouts({ ...cutouts, cooktop: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cuba Emb. (Qtd)</label>
                <input 
                  type="number" 
                  value={cutouts.sinkUnder}
                  onChange={(e) => setCutouts({ ...cutouts, sinkUnder: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cuba Sobr. (Qtd)</label>
                <input 
                  type="number" 
                  value={cutouts.sinkOver}
                  onChange={(e) => setCutouts({ ...cutouts, sinkOver: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Furação Torneira (Qtd)</label>
                <input
                  type="number"
                  value={cutouts.faucetHole}
                  onChange={(e) => setCutouts({ ...cutouts, faucetHole: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lixeira Emb. (Qtd)</label>
                <input
                  type="number"
                  value={cutouts.trashBinCutout}
                  onChange={(e) => setCutouts({ ...cutouts, trashBinCutout: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Torre Tomada (Qtd)</label>
                <input
                  type="number"
                  value={cutouts.popUpTowerCutout}
                  onChange={(e) => setCutouts({ ...cutouts, popUpTowerCutout: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Rebaixo Amer. (Qtd)</label>
                <input
                  type="number"
                  value={cutouts.wetAreaAmericanRecess}
                  onChange={(e) => setCutouts({ ...cutouts, wetAreaAmericanRecess: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Rebaixo Ital. (Qtd)</label>
                <input
                  type="number"
                  value={cutouts.wetAreaItalianRecess}
                  onChange={(e) => setCutouts({ ...cutouts, wetAreaItalianRecess: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
            </div>
          </section>

          <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <h2 className="font-display font-bold text-xl text-slate-800">Especificaçóes do cliente</h2>
            <p className="text-xs text-slate-400">No card do cliente s?o exibidas somente peças previamente cadastradas no Admin.</p>
            {!pieces.length ?(
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Adicione ao menos uma peça para vincular os itens do catélogo.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {([
                  { key: 'cooktop', label: 'Cooktop', category: 'cooktop' },
                  { key: 'sink', label: 'Cuba', category: 'sink' },
                  { key: 'faucet', label: 'Torneira', category: 'faucet' },
                  { key: 'trashBin', label: 'Lixeira de embutir', category: 'trashBin' },
                  { key: 'popUpTower', label: 'Torre de tomada', category: 'popUpTower' },
                ] as const).map((fixtureConfig) => {
                  const options = fixturesByCategory(fixtureConfig.category);
                  const selectedId = pieces[0]?.selectedFixtureIds?.[fixtureConfig.key] || '';
                  const selectedItem = options.find((item) => item.id === selectedId);
                  return (
                    <div key={fixtureConfig.key} className="space-y-2 rounded-2xl bg-slate-50 p-4 border border-slate-100">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{fixtureConfig.label}</div>
                      <select
                        value={selectedId}
                        onChange={(e) => selectCatalogFixtureForFirstPiece(fixtureConfig.key, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Selecionar peça cadastrada</option>
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
                          <div><span className="font-semibold text-slate-600">Imagem:</span> {selectedItem.imageUrl || '-'}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-xs text-slate-400">
              Se não encontrar um item aqui, cadastre primeiro na aba Admin em Catélogo de peças.
            </div>
          </section>

          <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <h2 className="font-display font-bold text-xl text-slate-800">Observaçóes Comerciais</h2>
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-white rounded-[40px] shadow-2xl flex flex-col h-[90vh]">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Desenho Técnico</h3>
                <p className="text-slate-400 text-sm">Peça: {pieces.find(p => p.id === showDrawing)?.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  id={`save-drawing-${showDrawing}`}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all"
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
            <div className="flex-1 overflow-hidden p-8">
              <DrawingCanvas 
                initialJson={pieces.find(p => p.id === showDrawing)?.drawingJson}
                initialSides={pieces.find(p => p.id === showDrawing)?.sides}
                initialCutouts={pieces.find(p => p.id === showDrawing)?.cutouts}
                saveButtonId={`save-drawing-${showDrawing}`}
                settings={settings}
                onSave={({ json, area, previewUrl, sides, largestSide, cutouts: drawingCutouts }) => {
                  const currentPiece = pieces.find((piece) => piece.id === showDrawing);
                  applyCutoutDiff(currentPiece?.cutouts, drawingCutouts);
                  updatePiece(showDrawing, { 
                    drawingJson: json, 
                    manualArea: area, 
                    previewUrl, 
                    sides, 
                    largestSide, 
                    cutouts: drawingCutouts 
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



