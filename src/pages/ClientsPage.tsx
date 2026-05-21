import React, {useEffect, useMemo, useRef, useState} from 'react';
import {addDoc, collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc} from 'firebase/firestore';
import {Banknote, CheckCircle2, ClipboardList, Edit2, FileText, FileUp, Info, MapPin, Phone, Plus, Search, Trash2, User, Users, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {Client, CondominiumRule, Employee, EmployeeAssignment, EmployeeEvaluation, FixtureCatalogItem, FixtureCategory, FixtureInfo, InventoryItem, LegacyClientPiece, LegacyPaymentInstallment, LegacyPaymentStatus, Material, ProductionStep, Quote, QuotePiece, QuoteStatus} from '../types';
import {cn, formatCurrency, formatCurrencyInput, parseCurrencyInput} from '../lib/utils';
import {applyQuoteInventoryByStatusTransition, isApprovedOrBeyond, syncQuoteReservation} from '../lib/inventoryReservations';
import {useAuth} from '../contexts/AuthContext';
import {logSystemEvent} from '../lib/systemEvents';
import {logAuditEvent} from '../lib/auditLogs';
import {QUOTE_STATUSES, normalizeQuoteStatus, quoteStatusColor, quoteStatusDotColor} from '../lib/quoteStatus';
import {getHolidayInfo} from '../lib/holidays';
import {formatMaterialSpecs} from '../lib/materialSpecs';
import {parseClientContractPdf, parseLegacyQuotePdf} from '../lib/contractParser';

type ClientStage = 'pre' | 'approved' | 'production' | 'ready' | 'done' | 'none';

const productionSteps: Array<{key: ProductionStep; label: string}> = [
  {key: 'medicao', label: 'Medição'},
  {key: 'corte', label: 'Corte'},
  {key: 'acabamento', label: 'Acabamento'},
  {key: 'instalacao', label: 'Instalação'},
  {key: 'entrega', label: 'Entrega'},
];

const quoteStatuses: QuoteStatus[] = QUOTE_STATUSES;

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const stageMeta: Record<ClientStage, {label: string; dot: string; chip: string}> = {
  pre: {label: 'Orçamento', dot: 'bg-[#B0BEC5]', chip: 'bg-[#B0BEC5]/20 text-[#455A64]'},
  approved: {label: 'Orçamento Aprovado', dot: 'bg-[#66BB6A]', chip: 'bg-[#66BB6A]/20 text-[#2E7D32]'},
  production: {label: 'Produção', dot: 'bg-[#E53935]', chip: 'bg-[#E53935]/15 text-[#B71C1C]'},
  ready: {label: 'Conferência/Entrega', dot: 'bg-[#00838F]', chip: 'bg-[#00838F]/15 text-[#006064]'},
  done: {label: 'Finalizado', dot: 'bg-[#0B3D0B]', chip: 'bg-[#0B3D0B] text-white'},
  none: {label: 'Sem projeto', dot: 'bg-zinc-300', chip: 'bg-zinc-100 text-zinc-500'},
};

const legacyStageToQuoteStatus = (stage?: Client['manualStage']): QuoteStatus | 'Sem projeto' => {
  switch (stage) {
    case 'approved':
      return 'Orçamento Aprovado';
    case 'production':
      return 'Produção Finalizada';
    case 'ready':
      return 'Conferência Final';
    case 'done':
      return 'Finalizado';
    case 'pre':
      return 'Orçamento';
    default:
      return 'Sem projeto';
  }
};

const deriveLegacyProjectStatus = (client: Client): QuoteStatus | 'Sem projeto' => {
  const pieces = client.legacyManualQuote?.pieces || [];
  if (pieces.length > 0) {
    return pieces
      .map((piece) => normalizeQuoteStatus(piece.status || 'Orçamento'))
      .sort((a, b) => QUOTE_STATUSES.indexOf(b) - QUOTE_STATUSES.indexOf(a))[0] || 'Orçamento';
  }
  if (client.legacyProjectMode === 'orcamento_existente') return 'Orçamento Aprovado';
  if (client.legacyProjectMode === 'orcamento') return 'Orçamento';
  return 'Sem projeto';
};

const getClientDisplayStatus = (client: Client, quote?: Quote): QuoteStatus | 'Sem projeto' => {
  if (quote) return normalizeQuoteStatus(quote.status);
  return client.manualQuoteStatus || deriveLegacyProjectStatus(client) || legacyStageToQuoteStatus(client.manualStage);
};

const statusToStage = (status: QuoteStatus | 'Sem projeto'): ClientStage => {
  if (status === 'Sem projeto') return 'none';
  if (status === 'Finalizado') return 'done';
  if (status === 'Conferência Final' || status === 'Entrega') return 'ready';
  if (['Projeto Aprovado', 'Corte', 'Acabamento', 'Montagem', 'Produção Finalizada'].includes(status)) return 'production';
  if (['Orçamento Aprovado', 'Medição', 'Projeto'].includes(status)) return 'approved';
  return 'pre';
};

const quoteStage = (quote?: Quote): ClientStage => {
  if (!quote) return 'none';
  const status = normalizeQuoteStatus(quote.status);
  if (status === 'Finalizado') return 'done';
  if (['Conferência Final', 'Entrega'].includes(status)) return 'ready';
  if (['Projeto Aprovado', 'Corte', 'Acabamento', 'Montagem', 'Produção Finalizada'].includes(status)) return 'production';
  if (['Orçamento Aprovado', 'Medição', 'Projeto'].includes(status)) return 'approved';
  return 'pre';
};

const getPieceDisplayStatus = (piece: QuotePiece, quote?: Quote): QuoteStatus =>
  normalizeQuoteStatus(piece.pieceStatus || quote?.status || 'Orçamento');

const getPieceAreaValue = (piece: QuotePiece) =>
  piece.totalArea || piece.manualArea || piece.area || 0;

const summarizeQuotePieces = (quote?: Quote) => {
  const pieces = quote?.pieces || [];
  const total = pieces.length;
  const delivered = pieces.filter((piece) => ['Entrega', 'Finalizado'].includes(getPieceDisplayStatus(piece, quote))).length;
  const pending = Math.max(0, total - delivered);
  return {total, delivered, pending};
};

const clientStage = (client: Client, quote?: Quote): ClientStage => {
  if (quote) return quoteStage(quote);
  return client.manualStage || 'none';
};

const quoteTime = (quote?: Quote) => {
  const raw = quote?.createdAt;
  if (raw?.toDate) return raw.toDate().getTime();
  if (raw instanceof Date) return raw.getTime();
  return 0;
};

const stepDate = (value: any) => {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ?value.toDate() : value;
  if (!(date instanceof Date)) return '';
  return date.toLocaleDateString('pt-BR');
};

type StepAssignment = EmployeeAssignment & {slotIndex: number};

const orderedAssignmentsForStep = (assignments: EmployeeAssignment[] | undefined, step: ProductionStep): StepAssignment[] =>
  (assignments || [])
    .filter((item) => item.step === step)
    .map((item, index) => ({...item, slotIndex: item.slotIndex ?? index}))
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));

const formatDateInput = (value: any) => {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ?value.toDate() : value;
  if (!(date instanceof Date)) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateStringToInput = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const brazilianMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilianMatch) {
    const [, day, month, year] = brazilianMatch;
    return `${year}-${month}-${day}`;
  }

  return '';
};

const normalizeInputDateToDisplay = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return text;
  const [, year, month, day] = isoMatch;
  return `${day}/${month}/${year}`;
};

const fixCorruptedText = (value: unknown) => {
  const text = String(value || '');
  if (!text) return '';

  return text
    .replace(/Ã§/g, 'ç')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã¢/g, 'â')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã´/g, 'ô')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã/g, 'Á')
    .replace(/Ã‡/g, 'Ç')
    .replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‰/g, 'É')
    .replace(/ÃŠ/g, 'Ê')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ã”/g, 'Ô')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã­/g, 'í')
    .replace(/Ã±/g, 'ñ')
    .replace(/Â·/g, '·')
    .replace(/Âº/g, 'º')
    .replace(/Âª/g, 'ª')
    .replace(/Â/g, '');
};

const deriveStreetAddress = (client: Client) => {
  if (client.streetAddress?.trim()) return client.streetAddress.trim();

  const rawAddress = String(client.address || '').trim();
  if (!rawAddress) return '';

  const separators = [' · ', ' · '];
  for (const separator of separators) {
    if (rawAddress.includes(separator)) {
      const [street] = rawAddress.split(separator);
      return street.trim();
    }
  }

  return rawAddress;
};

const addDaysToInputDate = (value: string, days: number) => {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Math.max(0, days));
  return date;
};

const buildLegacyPiece = (): LegacyClientPiece => ({
  id: Math.random().toString(36).slice(2, 11),
  name: '',
  status: 'Orçamento',
  value: 0,
  items: [],
});

const legacyPaymentStatuses: LegacyPaymentStatus[] = ['Pendente', 'Pago', 'Vencido'];

const buildLegacyPayment = (): LegacyPaymentInstallment => ({
  id: Math.random().toString(36).slice(2, 11),
  label: '',
  amount: 0,
  dueDate: '',
  paidDate: '',
  paymentMethod: '',
  status: 'Pendente',
  notes: '',
});

const legacyPiecesTotal = (pieces: LegacyClientPiece[]) =>
  pieces.reduce((sum, piece) => sum + Number(piece.value || 0), 0);

const summarizeLegacyPayments = (payments: LegacyPaymentInstallment[] = [], totalPrice = 0) => {
  const paid = payments
    .filter((payment) => payment.status === 'Pago')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pendingInstallments = payments
    .filter((payment) => payment.status !== 'Pago')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalRegistered = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pending = payments.length > 0 ? pendingInstallments : Math.max(0, totalPrice - paid);
  const difference = totalPrice - totalRegistered;
  return {paid, pending, totalRegistered, difference};
};

export const ClientsPage: React.FC = () => {
  const {user, profile, canEvaluateEmployees, hasPermission} = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fixtureCatalog, setFixtureCatalog] = useState<FixtureCatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStage | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [detailModal, setDetailModal] = useState<'client' | 'quote' | 'values' | 'team' | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [statusMenuClientId, setStatusMenuClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importingContract, setImportingContract] = useState(false);
  const [importingLegacyQuotePdf, setImportingLegacyQuotePdf] = useState(false);
  const contractInputRef = useRef<HTMLInputElement | null>(null);
  const legacyQuoteInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [googleDriveUrl, setGoogleDriveUrl] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [addressType, setAddressType] = useState<Client['addressType']>('casa');
  const [condominiumId, setCondominiumId] = useState('');
  const [block, setBlock] = useState('');
  const [lot, setLot] = useState('');
  const [tower, setTower] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [legacyProjectMode, setLegacyProjectMode] = useState<Client['legacyProjectMode']>('sem_projeto');
  const [legacyTotalPrice, setLegacyTotalPrice] = useState(formatCurrency(0));
  const [legacyPieces, setLegacyPieces] = useState<LegacyClientPiece[]>([]);
  const [legacyPayments, setLegacyPayments] = useState<LegacyPaymentInstallment[]>([]);

  useEffect(() => {
    const qClients = query(collection(db, 'clients'), orderBy('name', 'asc'));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Client)));
      setLoading(false);
    });

    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snapshot) => {
      setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
    });

    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      setEmployees(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Employee)));
    });

    const unsubFixtures = onSnapshot(collection(db, 'fixtureCatalog'), (snapshot) => {
      setFixtureCatalog(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as FixtureCatalogItem)));
    });

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      setInventory(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryItem)));
    });

    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material)));
    });

    const unsubCondominiums = onSnapshot(collection(db, 'condominiums'), (snapshot) => {
      setCondominiums(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as CondominiumRule)));
    });

    return () => {
      unsubClients();
      unsubQuotes();
      unsubEmployees();
      unsubFixtures();
      unsubInventory();
      unsubMaterials();
      unsubCondominiums();
    };
  }, []);

  const latestQuoteByClient = useMemo(() => {
    const map = new Map<string, Quote>();
    quotes.forEach((quote) => {
      const current = map.get(quote.clientId);
      if (!current || quoteTime(quote) > quoteTime(current)) map.set(quote.clientId, quote);
    });
    return map;
  }, [quotes]);

  const selectedClientQuotes = useMemo(() => {
    if (!selectedClient) return [];
    return quotes
      .filter((quote) => quote.clientId === selectedClient.id)
      .sort((a, b) => quoteTime(b) - quoteTime(a));
  }, [quotes, selectedClient]);

  const selectedQuote = selectedClientQuotes.find((quote) => quote.id === selectedQuoteId) || selectedClientQuotes[0];
  const selectedLegacyQuote = selectedClient?.legacyManualQuote;
  const currentUserName = profile?.name || user?.displayName || user?.email || 'Usuário';
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.active !== false),
    [employees],
  );
  const fixtureById = (id?: string) => fixtureCatalog.find((item) => item.id === id);
  const materialById = (id?: string) => materials.find((item) => item.id === id);
  const pieceFixtureCards = (piece: QuotePiece) => {
    const config: Array<{key: FixtureCategory; label: string; legacyKey: 'sink' | 'faucet' | 'cooktop' | 'trashBin' | 'popUpTower'}> = [
      {key: 'sink', label: 'Cuba', legacyKey: 'sink'},
      {key: 'faucet', label: 'Torneira', legacyKey: 'faucet'},
      {key: 'cooktop', label: 'Cooktop', legacyKey: 'cooktop'},
      {key: 'trashBin', label: 'Lixeira de embutir', legacyKey: 'trashBin'},
      {key: 'popUpTower', label: 'Torre de tomada', legacyKey: 'popUpTower'},
    ];
    return config.map((item) => {
      const catalogItem = fixtureById(piece.selectedFixtureIds?.[item.key]);
      const fixture = piece.purchasedFixtures?.[item.legacyKey] || {};
      const name = catalogItem?.name || fixture.name || fixture.model || item.label;
      const imageUrl = catalogItem?.imageUrl || fixture.imageUrl || '';
      const brand = catalogItem?.brand || fixture.brand || '';
      const model = catalogItem?.model || fixture.model || '';
      const width = catalogItem?.width ?? fixture.width;
      const depth = catalogItem?.depth ?? fixture.depth;
      const height = catalogItem?.height ?? fixture.height;
      const diameter = catalogItem?.diameter ?? fixture.diameter;
      const notes = catalogItem?.notes || fixture.notes || '';
      const manualUrl = catalogItem?.manualUrl || '';
      const manualFileName = catalogItem?.manualFileName || '';
      const hasInfo = catalogItem || brand || model || width || depth || height || diameter || notes || manualUrl;
      return {...item, name, imageUrl, brand, model, width, depth, height, diameter, notes, manualUrl, manualFileName, hasInfo};
    }).filter((item) => item.hasInfo);
  };
  const selectedQuoteMaterialUsage = (selectedQuote?.pieces || []).reduce((map, piece) => {
    if (!piece.materialId) return map;
    const area = piece.totalArea || piece.manualArea || piece.area || 0;
    const current = map.get(piece.materialId) || {area: 0, pieces: 0};
    map.set(piece.materialId, {area: current.area + area, pieces: current.pieces + 1});
    return map;
  }, new Map<string, {area: number; pieces: number}>());
  const selectedQuoteSlabRows = Array.from(selectedQuoteMaterialUsage.entries()).map(([materialId, usage]) => {
    const material = materialById(materialId);
    const stockItems = inventory.filter((item) => item.materialId === materialId && !['Usada', 'Descarte'].includes(item.status));
    const stockArea = stockItems.reduce((sum, item) => sum + (item.area || 0), 0);
    return {
      materialId,
      materialName: material?.name || stockItems[0]?.materialName || materialId,
      imageUrl: material?.imageUrl || stockItems.find((item) => item.photoUrl)?.photoUrl || '',
      category: material?.category || stockItems[0]?.category || 'Sem categoria',
      materialLine: material?.materialLine || stockItems[0]?.materialLine || stockItems[0]?.category || '',
      thicknessLabel: material?.thicknessLabel || stockItems[0]?.thicknessLabel || '',
      texture: material?.texture || stockItems[0]?.texture || '',
      materialType: material?.materialType || stockItems[0]?.materialType || '',
      neededArea: usage.area,
      pieces: usage.pieces,
      slabCount: stockItems.length,
      stockArea,
      stockItems,
    };
  });
  const selectedQuoteCutoutRows = [
    {label: 'Cooktop', count: selectedQuote?.cutouts?.cooktop || 0},
    {label: 'Cuba embutida', count: selectedQuote?.cutouts?.sinkUnder || 0},
    {label: 'Cuba sobreposta', count: selectedQuote?.cutouts?.sinkOver || 0},
    {label: 'Furo de torneira', count: selectedQuote?.cutouts?.faucetHole || 0},
    {label: 'Lixeira de embutir', count: selectedQuote?.cutouts?.trashBinCutout || 0},
    {label: 'Torre de tomada', count: selectedQuote?.cutouts?.popUpTowerCutout || 0},
    {label: 'Rebaixo americano', count: selectedQuote?.cutouts?.wetAreaAmericanRecess || 0},
    {label: 'Rebaixo italiano', count: selectedQuote?.cutouts?.wetAreaItalianRecess || 0},
  ].filter((item) => item.count > 0);
  const selectedLegacyPieces = selectedLegacyQuote?.pieces || [];
  const selectedLegacyPayments = selectedLegacyQuote?.payments || [];
  const selectedLegacySummary = {
    total: selectedLegacyPieces.length,
    delivered: selectedLegacyPieces.filter((piece) => ['Entrega', 'Finalizado'].includes(normalizeQuoteStatus(piece.status || 'Orçamento'))).length,
    pending: selectedLegacyPieces.filter((piece) => !['Entrega', 'Finalizado'].includes(normalizeQuoteStatus(piece.status || 'Orçamento'))).length,
  };
  const selectedLegacyPaymentsSummary = summarizeLegacyPayments(selectedLegacyPayments, selectedLegacyQuote?.totalPrice || 0);
  const legacyPiecesTotalValue = useMemo(() => legacyPiecesTotal(legacyPieces), [legacyPieces]);
  const legacyPaymentsSummary = useMemo(
    () => summarizeLegacyPayments(legacyPayments, legacyPiecesTotalValue),
    [legacyPayments, legacyPiecesTotalValue],
  );
  const canViewClientValues = hasPermission('cliente', 'verValores');
  const hiddenClientValueLabel = 'Valor oculto';

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setGoogleDriveUrl('');
    setCpf('');
    setRg('');
    setBirthDate('');
    setAddress('');
    setCity('');
    setZipCode('');
    setNeighborhood('');
    setAddressType('casa');
    setCondominiumId('');
    setBlock('');
    setLot('');
    setTower('');
    setApartmentNumber('');
    setNotes('');
    setLegacyProjectMode('sem_projeto');
    setLegacyTotalPrice(formatCurrency(0));
    setLegacyPieces([]);
    setLegacyPayments([]);
    setEditingClient(null);
  };

  const openClientDetail = (client: Client, view: 'client' | 'quote' | 'values' | 'team') => {
    const latest = latestQuoteByClient.get(client.id);
    setSelectedClient(client);
    setSelectedQuoteId(latest?.id || '');
    setDetailModal(view);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedCondominium = condominiums.find((item) => item.id === condominiumId);
    const selectedCondoAddressMode = selectedCondominium?.addressMode || 'street';
    const includeStreet = addressType !== 'condominio' || selectedCondoAddressMode === 'street';
    const includeLot = addressType === 'condominio' && selectedCondoAddressMode === 'lot';
    const fullAddress = [
      includeStreet ?address : '',
      neighborhood  ? `Bairro ${neighborhood}` : '',
      city,
      zipCode  ? `CEP ${zipCode}` : '',
      selectedCondominium?.name  ? `Condomínio ${selectedCondominium.name}` : '',
      includeLot && block  ? `Quadra ${block}` : '',
      includeLot && lot  ? `Lote ${lot}` : '',
      tower  ? `Torre ${tower}` : '',
      apartmentNumber  ? `Apto ${apartmentNumber}` : '',
    ].filter(Boolean).join(' · ');
    const data = {
      name,
      phone,
      email: email.trim(),
      googleDriveUrl: googleDriveUrl.trim(),
      cpf: cpf.trim(),
      rg: rg.trim(),
      birthDate: normalizeInputDateToDisplay(birthDate),
      address: fullAddress,
      streetAddress: address.trim(),
      notes,
      city: city.trim(),
      zipCode: zipCode.trim(),
      neighborhood: neighborhood.trim(),
      addressType,
      condominiumId: selectedCondominium?.id || '',
      condominiumName: selectedCondominium?.name || '',
      block: block.trim(),
      lot: lot.trim(),
      tower: tower.trim(),
      apartmentNumber: apartmentNumber.trim(),
      legacyProjectMode,
      legacyManualQuote: legacyProjectMode === 'sem_projeto'
        ? null
        : {
            totalPrice: legacyPiecesTotalValue,
            updatedAt: Timestamp.now(),
            pieces: legacyPieces
              .filter((piece) => piece.name.trim())
              .map((piece) => ({
                ...piece,
                name: piece.name.trim(),
                status: normalizeQuoteStatus(piece.status || 'Orçamento'),
                value: Number(piece.value || 0),
                items: (piece.items || []).map((item) => item.trim()).filter(Boolean),
              })),
            payments: legacyPayments
              .filter((payment) => payment.label.trim() || Number(payment.amount || 0) > 0)
              .map((payment) => ({
                ...payment,
                label: payment.label.trim(),
                amount: Number(payment.amount || 0),
                dueDate: payment.dueDate || '',
                paidDate: payment.status === 'Pago' ? payment.paidDate || '' : '',
                paymentMethod: payment.paymentMethod?.trim() || '',
                status: payment.status || 'Pendente',
                notes: payment.notes?.trim() || '',
              })),
          },
    };

    if (editingClient) {
      await updateDoc(doc(db, 'clients', editingClient.id), data);
      await logSystemEvent({
        type: 'client_updated',
        title: 'Cliente atualizado',
        description: name,
        entityType: 'client',
        entityId: editingClient.id,
        clientId: editingClient.id,
        clientName: name,
        userUid: user?.uid || '',
        userName: currentUserName,
      });
    } else {
      const createdRef = await addDoc(collection(db, 'clients'), data);
      await logSystemEvent({
        type: 'client_created',
        title: 'Cliente criado',
        description: name,
        entityType: 'client',
        entityId: createdRef.id,
        clientId: createdRef.id,
        clientName: name,
        userUid: user?.uid || '',
        userName: currentUserName,
      });
    }

    setShowModal(false);
    resetForm();
  };

  const handleImportContract = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportingContract(true);

    try {
      const parsed = await parseClientContractPdf(file);
      const fullAddress = [
        parsed.currentAddress,
        parsed.currentNeighborhood ? `Bairro ${parsed.currentNeighborhood}` : '',
        parsed.currentCity,
        parsed.currentUf,
        parsed.currentCep ? `CEP ${parsed.currentCep}` : '',
      ].filter(Boolean).join(' · ');

      const deliveryAddressLine = [
        parsed.deliveryAddress,
        parsed.deliveryNeighborhood ? `Bairro ${parsed.deliveryNeighborhood}` : '',
        parsed.deliveryCity,
        parsed.deliveryUf,
        parsed.deliveryCep ? `CEP ${parsed.deliveryCep}` : '',
      ].filter(Boolean).join(' · ');

      const importedNotes = [
        'Contrato importado por PDF.',
        parsed.contractNumber ? `Contrato: ${parsed.contractNumber}` : '',
        parsed.contractDate ? `Data do contrato: ${parsed.contractDate}` : '',
        parsed.contractType ? `Tipo de contrato: ${parsed.contractType}` : '',
        parsed.sellerName ? `Responsável pela venda: ${parsed.sellerName}` : '',
        parsed.storeName ? `Loja: ${parsed.storeName}` : '',
        parsed.profession ? `Profissão: ${parsed.profession}` : '',
        deliveryAddressLine ? `Endereço de entrega: ${deliveryAddressLine}` : '',
        parsed.deliveryDeadline ? `Prazo de entrega: ${parsed.deliveryDeadline}` : '',
      ].filter(Boolean).join('\n');

      const data = {
        name: parsed.clientName,
        phone: parsed.phone,
        email: parsed.email,
        googleDriveUrl: '',
        cpf: parsed.cpfCnpj,
        rg: parsed.rgIe,
        birthDate: normalizeInputDateToDisplay(normalizeDateStringToInput(parsed.birthDate)),
        address: fullAddress,
        streetAddress: parsed.currentAddress,
        notes: importedNotes,
        city: parsed.currentCity,
        zipCode: parsed.currentCep,
        neighborhood: parsed.currentNeighborhood,
        addressType: 'casa' as Client['addressType'],
        condominiumId: '',
        condominiumName: '',
        block: '',
        lot: '',
        tower: '',
        apartmentNumber: '',
      };

      const createdRef = await addDoc(collection(db, 'clients'), data);
      await logSystemEvent({
        type: 'client_created',
        title: 'Cliente importado por contrato',
        description: parsed.clientName,
        entityType: 'client',
        entityId: createdRef.id,
        clientId: createdRef.id,
        clientName: parsed.clientName,
        userUid: user?.uid || '',
        userName: currentUserName,
        metadata: {
          importedFrom: 'pdf-contract',
          contractNumber: parsed.contractNumber,
          contractDate: parsed.contractDate,
          contractType: parsed.contractType,
        },
      });

      await logAuditEvent({
        userId: user?.uid || '',
        userEmail: user?.email || '',
        userName: currentUserName,
        action: 'import_contract_pdf',
        module: 'clientes',
        targetId: createdRef.id,
        newValue: {
          clientName: parsed.clientName,
          contractNumber: parsed.contractNumber,
          contractDate: parsed.contractDate,
        },
      });
    } catch (error) {
      console.error(error);
      const code = error instanceof Error ? error.message : '';
      if (code === 'GEMINI_API_KEY_NAO_CONFIGURADA') {
        window.alert('O PDF precisa de leitura por IA, mas a chave GEMINI_API_KEY não está configurada no deploy. Sem essa chave, esse tipo de contrato não pode ser importado automaticamente.');
      } else if (code === 'PDF_SEM_TEXTO_UTIL') {
        window.alert('Não consegui ler esse PDF porque ele parece estar sem texto selecionável. Se for um PDF escaneado ou uma imagem, preciso que ele venha com texto real para importar automaticamente.');
      } else {
        window.alert('Não consegui ler esse contrato automaticamente. Confira se o PDF segue o modelo padrão e tente novamente.');
      }
    } finally {
      setImportingContract(false);
    }
  };

  const handleImportLegacyQuotePdf = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportingLegacyQuotePdf(true);

    try {
      const parsedPieces = await parseLegacyQuotePdf(file);
      setLegacyProjectMode('orcamento_existente');
      setLegacyPieces(parsedPieces.map((piece) => ({
        id: Math.random().toString(36).slice(2, 11),
        name: piece.name,
        status: 'Orçamento Aprovado',
        value: piece.value,
        items: [],
      })));
      setLegacyPayments([]);
    } catch (error) {
      console.error(error);
      const code = error instanceof Error ? error.message : '';
      if (code === 'GEMINI_API_KEY_NAO_CONFIGURADA') {
        window.alert('Esse PDF precisa de leitura por IA, mas a chave GEMINI_API_KEY não está configurada no deploy.');
      } else if (code === 'GEMINI_QUOTA_EXCEDIDA') {
        window.alert('Não consegui importar esse PDF porque a cota da Gemini está esgotada no momento. A leitura local já foi tentada antes disso.');
      } else if (code === 'GEMINI_TEMPORARIAMENTE_INDISPONIVEL') {
        window.alert('A leitura por IA está temporariamente indisponível. Tente novamente em alguns instantes.');
      } else {
        window.alert('Não consegui importar esse orçamento existente. Verifique se o PDF tem a tabela com "DESCRIÇÃO AMBIENTE/PRODUTO", "VALOR" e a linha "GRANITOS E MARMORES".');
      }
    } finally {
      setImportingLegacyQuotePdf(false);
    }
  };

  const addLegacyPiece = () => {
    setLegacyPieces((current) => [...current, buildLegacyPiece()]);
  };

  const updateLegacyPiece = (pieceId: string, data: Partial<LegacyClientPiece>) => {
    setLegacyPieces((current) => current.map((piece) => (
      piece.id === pieceId
        ? {
            ...piece,
            ...data,
            status: normalizeQuoteStatus((data.status || piece.status || 'Orçamento') as string),
          }
        : piece
    )));
  };

  const removeLegacyPiece = (pieceId: string) => {
    setLegacyPieces((current) => current.filter((piece) => piece.id !== pieceId));
  };

  const addLegacyPayment = () => {
    setLegacyPayments((current) => [...current, buildLegacyPayment()]);
  };

  const updateLegacyPayment = (paymentId: string, data: Partial<LegacyPaymentInstallment>) => {
    setLegacyPayments((current) => current.map((payment) => (
      payment.id === paymentId
        ? {
            ...payment,
            ...data,
            status: (data.status || payment.status || 'Pendente') as LegacyPaymentStatus,
          }
        : payment
    )));
  };

  const removeLegacyPayment = (paymentId: string) => {
    setLegacyPayments((current) => current.filter((payment) => payment.id !== paymentId));
  };

  useEffect(() => {
    if (legacyProjectMode === 'sem_projeto') {
      const zeroValue = formatCurrency(0);
      if (legacyTotalPrice !== zeroValue) setLegacyTotalPrice(zeroValue);
      return;
    }

    const formattedTotal = formatCurrency(legacyPiecesTotalValue);
    if (legacyTotalPrice !== formattedTotal) setLegacyTotalPrice(formattedTotal);
  }, [legacyPiecesTotalValue, legacyProjectMode, legacyTotalPrice]);

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setPhone(client.phone);
    setEmail(client.email || '');
    setGoogleDriveUrl(client.googleDriveUrl || '');
    setCpf(client.cpf || '');
    setRg(client.rg || '');
    setBirthDate(normalizeDateStringToInput(client.birthDate || ''));
    setAddress(deriveStreetAddress(client));
    setCity(client.city || '');
    setZipCode(client.zipCode || '');
    setNeighborhood(client.neighborhood || '');
    setAddressType(client.addressType || 'casa');
    setCondominiumId(client.condominiumId || '');
    setBlock(client.block || '');
    setLot(client.lot || '');
    setTower(client.tower || '');
    setApartmentNumber(client.apartmentNumber || '');
    setNotes(client.notes);
    setLegacyProjectMode(client.legacyProjectMode || (client.legacyManualQuote ? 'orcamento_existente' : 'sem_projeto'));
    setLegacyTotalPrice(formatCurrency(client.legacyManualQuote?.totalPrice || 0));
    setLegacyPieces((client.legacyManualQuote?.pieces || []).map((piece) => ({
      ...piece,
      status: normalizeQuoteStatus(piece.status || 'Orçamento'),
      value: Number(piece.value || 0),
      items: piece.items || [],
    })));
    setLegacyPayments((client.legacyManualQuote?.payments || []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount || 0),
      dueDate: payment.dueDate || '',
      paidDate: payment.paidDate || '',
      paymentMethod: payment.paymentMethod || '',
      status: payment.status || 'Pendente',
      notes: payment.notes || '',
    })));
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este cliente?');
    if (!confirmed) return;

    const deletedClient = clients.find((client) => client.id === id);
    const ok = await deleteFirestoreDoc('clients', id);
    if (!ok) return;

    if (deletedClient) {
      await logSystemEvent({
        type: 'client_deleted',
        title: 'Cliente excluído',
        description: deletedClient.name,
        entityType: 'client',
        entityId: id,
        clientId: id,
        clientName: deletedClient.name,
        userUid: user?.uid || '',
        userName: currentUserName,
      });
    }
    setClients((prev) => prev.filter((client) => client.id !== id));
  };

  const updateQuoteStatus = async (quote: Quote, status: QuoteStatus) => {
    try {
      if (!isApprovedOrBeyond(quote.status) && isApprovedOrBeyond(status)) {
        await applyQuoteInventoryByStatusTransition(quote.id, quote.status, status, quote);
      }

      await updateDoc(doc(db, 'quotes', quote.id), {
        status,
        statusHistory: [
          ...(quote.statusHistory || []),
          {
            status,
            changedAt: Timestamp.now(),
            changedByUid: user?.uid || '',
            changedByName: currentUserName,
            note: `Status alterado para ${status}`,
          },
        ],
      });

      if (isApprovedOrBeyond(quote.status) || !isApprovedOrBeyond(status)) {
        await syncQuoteReservation(quote.id, {...quote, status});
      }

      await logSystemEvent({
        type: 'quote_status_changed',
        title: 'Status alterado no cliente',
        description: `${quote.clientName}: ${quote.status} -> ${status}`,
        entityType: 'quote',
        entityId: quote.id,
        quoteId: quote.id,
        quoteStatus: status,
        clientId: quote.clientId,
        clientName: quote.clientName,
        materialId: quote.materialId,
        materialName: quote.materialName,
        userUid: user?.uid || '',
        userName: currentUserName,
      });
    } catch (error: any) {
      alert(error?.message || 'Não foi possível alterar o status do orçamento.');
    }
  };

  const getCondominiumScheduleBlock = (quote: Quote, dates: Array<{label: string; date: Date | null}>) => {
    const client = clients.find((item) => item.id === quote.clientId);
    const condominium = client?.condominiumId ?condominiums.find((item) => item.id === client.condominiumId) : null;
    if (!condominium) return '';

    for (const item of dates) {
      if (!item.date) continue;
      const weekday = (item.date.getDay() + 6) % 7;
      const holiday = getHolidayInfo(item.date, condominium.city);
      const dayBlocked = !condominium.allowedWeekdays.includes(weekday);
      const holidayBlocked = (holiday.national && condominium.blockNationalHolidays) || (holiday.city && condominium.blockCityHolidays);
      if (dayBlocked) return `${item.label}: ${condominium.name} não permite agendamento em ${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][weekday]}.`;
      if (holidayBlocked) return `${item.label}: ${holiday.national || holiday.city} em ${condominium.city}.`;
    }

    return '';
  };

  const updateQuoteMeasurementDate = async (quote: Quote, value: string) => {
    const measurement = value ?new Date(`${value}T12:00:00`) : null;
    const delivery = value ?addDaysToInputDate(value, quote.deliveryDays || 0) : null;
    const blockedReason = getCondominiumScheduleBlock(quote, [
      {label: 'Medição', date: measurement},
      {label: 'Entrega', date: delivery},
    ]);
    if (blockedReason) {
      alert(`Não é possível agendar nessa data. ${blockedReason}`);
      return;
    }
    await updateDoc(doc(db, 'quotes', quote.id), {
      measurementDate: measurement ?Timestamp.fromDate(measurement) : null,
      deliveryDate: delivery ?Timestamp.fromDate(delivery) : null,
      statusHistory: [
        ...(quote.statusHistory || []),
        {
          status: quote.status,
          changedAt: Timestamp.now(),
          changedByUid: user?.uid || '',
          changedByName: currentUserName,
          note: value
            ? `Medição agendada para ${value.split('-').reverse().join('/')} e entrega calculada pelo prazo de ${quote.deliveryDays || 0} dia(s)`
            : 'Medição e entrega removidas',
        },
      ],
    });
  };

  const updateQuoteDeliveryDays = async (quote: Quote, value: string) => {
    const deliveryDays = Math.max(0, Number(value) || 0);
    const measurementInput = formatDateInput(quote.measurementDate);
    const delivery = measurementInput ?addDaysToInputDate(measurementInput, deliveryDays) : null;
    const blockedReason = getCondominiumScheduleBlock(quote, [{label: 'Entrega', date: delivery}]);
    if (blockedReason) {
      alert(`Não é possível usar esse prazo. ${blockedReason}`);
      return;
    }
    await updateDoc(doc(db, 'quotes', quote.id), {
      deliveryDays,
      deliveryDate: delivery ?Timestamp.fromDate(delivery) : null,
      statusHistory: [
        ...(quote.statusHistory || []),
        {
          status: quote.status,
          changedAt: Timestamp.now(),
          changedByUid: user?.uid || '',
          changedByName: currentUserName,
          note: `Prazo alterado para ${deliveryDays} dia(s)${delivery ?` e entrega recalculada para ${delivery.toLocaleDateString('pt-BR')}` : ''}`,
        },
      ],
    });
  };

  const updateTeamCount = async (quote: Quote, step: ProductionStep, countValue: string) => {
    const count = Math.max(1, Number(countValue) || 1);
    const stepAssignments = orderedAssignmentsForStep(quote.employeeAssignments, step)
      .slice(0, count)
      .map((item, index) => ({...item, slotIndex: index}));
    const nextAssignments = [
      ...(quote.employeeAssignments || []).filter((item) => item.step !== step),
      ...stepAssignments,
    ];
    await updateDoc(doc(db, 'quotes', quote.id), {
      teamCounts: {...(quote.teamCounts || {}), [step]: count},
      employeeAssignments: nextAssignments,
    });
  };

  const updateAssignment = async (quote: Quote, step: ProductionStep, employeeId: string, slotIndex = 0) => {
    const employee = employees.find((item) => item.id === employeeId);
    const otherAssignments = (quote.employeeAssignments || []).filter((item) => item.step !== step);
    const stepAssignments = orderedAssignmentsForStep(quote.employeeAssignments, step);
    const previousAssignment = stepAssignments.find((item) => item.slotIndex === slotIndex);
    const nextStepAssignments = stepAssignments.filter((item) => item.slotIndex !== slotIndex);
    if (employee) {
      const nextAssignment: StepAssignment = {
        step,
        employeeId: employee.id,
        employeeName: employee.name,
        slotIndex,
        startedAt: previousAssignment?.startedAt || Timestamp.now(),
      };
      if (previousAssignment?.finishedAt) nextAssignment.finishedAt = previousAssignment.finishedAt;
      nextStepAssignments.push(nextAssignment);
    }
    const orderedStepAssignments = nextStepAssignments
      .filter((item) => item?.employeeId)
      .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    const nextAssignments = [...otherAssignments, ...orderedStepAssignments];
    const nextTeamCount = Math.max(Number(quote.teamCounts?.[step] || 1), slotIndex + 1, nextAssignments.filter((item) => item.step === step).length || 1);

    const nextStatusHistory = [
      ...(quote.statusHistory || []),
      {
        status: quote.status,
        changedAt: Timestamp.now(),
        changedByUid: user?.uid || '',
        changedByName: currentUserName,
        responsibleEmployeeId: employee?.id || '',
        responsibleEmployeeName: employee?.name || '',
        step,
        note: employee  ? `${employee.name} assumiu ${productionSteps.find((item) => item.key === step)?.label}` : `Responsável removido de ${step}`,
      },
    ];
    const updatePayload = {
      teamCounts: {...(quote.teamCounts || {}), [step]: nextTeamCount},
      employeeAssignments: nextAssignments,
      statusHistory: nextStatusHistory,
    };

    setQuotes((current) => current.map((item) => item.id === quote.id ?{...item, ...updatePayload} : item));

    await updateDoc(doc(db, 'quotes', quote.id), updatePayload);
    await logSystemEvent({
      type: 'production_assignment_changed',
      title: employee ?'Responsável de produção definido' : 'Responsável de produção removido',
      description: employee  ? `${employee.name} em ${productionSteps.find((item) => item.key === step)?.label}` : `Etapa ${step}`,
      entityType: 'production',
      entityId: quote.id,
      quoteId: quote.id,
      quoteStatus: quote.status,
      clientId: quote.clientId,
      clientName: quote.clientName,
      employeeId: employee?.id || '',
      employeeName: employee?.name || '',
      userUid: user?.uid || '',
      userName: currentUserName,
      metadata: {step},
    });
  };

  const toggleStepDone = async (quote: Quote, assignment: EmployeeAssignment) => {
    const finished = Boolean(assignment.finishedAt);
    const nextAssignments = (quote.employeeAssignments || []).map((item) => (
      item.step === assignment.step && item.employeeId === assignment.employeeId && (item.slotIndex ?? 0) === (assignment.slotIndex ?? 0)
        ? {...item, finishedAt: finished ? null : Timestamp.now()}
        : item
    ));

    await updateDoc(doc(db, 'quotes', quote.id), {
      employeeAssignments: nextAssignments,
      statusHistory: [
        ...(quote.statusHistory || []),
        {
          status: quote.status,
          changedAt: Timestamp.now(),
          changedByUid: user?.uid || '',
          changedByName: currentUserName,
          responsibleEmployeeId: assignment.employeeId,
          responsibleEmployeeName: assignment.employeeName,
          step: assignment.step,
          note: `${productionSteps.find((item) => item.key === assignment.step)?.label} ${finished  ? 'reaberta' : 'finalizada'} por ${assignment.employeeName}`,
        },
      ],
    });
    await logSystemEvent({
      type: 'production_step_changed',
      title: finished ?'Etapa de produção reaberta' : 'Etapa de produção finalizada',
      description: `${productionSteps.find((item) => item.key === assignment.step)?.label} - ${assignment.employeeName}`,
      entityType: 'production',
      entityId: quote.id,
      quoteId: quote.id,
      quoteStatus: quote.status,
      clientId: quote.clientId,
      clientName: quote.clientName,
      employeeId: assignment.employeeId,
      employeeName: assignment.employeeName,
      userUid: user?.uid || '',
      userName: currentUserName,
      metadata: {step: assignment.step, finished: !finished},
    });
  };

  const updateEvaluation = async (quote: Quote, assignment: EmployeeAssignment, rating: number, notes?: string) => {
    if (!canEvaluateEmployees) {
      alert('Você não tem permissão para avaliar funcionários. Fale com o administrador.');
      return;
    }
    const currentEvaluation = quote.employeeEvaluations?.find((item) => item.step === assignment.step && item.employeeId === assignment.employeeId);
    const nextEvaluation: EmployeeEvaluation = {
      step: assignment.step,
      employeeId: assignment.employeeId,
      employeeName: assignment.employeeName,
      rating,
      notes: notes || currentEvaluation?.notes || '',
      createdAt: Timestamp.now(),
      evaluatedByUid: user?.uid || '',
      evaluatedByName: currentUserName,
    };
    const nextEvaluations = (quote.employeeEvaluations || [])
      .filter((item) => item.step !== assignment.step || item.employeeId !== assignment.employeeId)
      .concat(nextEvaluation);

    await updateDoc(doc(db, 'quotes', quote.id), {
      employeeEvaluations: nextEvaluations,
      statusHistory: [
        ...(quote.statusHistory || []),
        {
          status: quote.status,
          changedAt: Timestamp.now(),
          changedByUid: user?.uid || '',
          changedByName: currentUserName,
          responsibleEmployeeId: assignment.employeeId,
          responsibleEmployeeName: assignment.employeeName,
          step: assignment.step,
          note: `${assignment.employeeName} avaliado com ${rating} ponto(s) em ${productionSteps.find((item) => item.key === assignment.step)?.label}`,
        },
      ],
    });
    await logSystemEvent({
      type: 'employee_evaluated',
      title: 'Funcionário avaliado',
      description: `${assignment.employeeName} recebeu ${rating}/5 em ${productionSteps.find((item) => item.key === assignment.step)?.label}`,
      entityType: 'employee',
      entityId: assignment.employeeId,
      quoteId: quote.id,
      quoteStatus: quote.status,
      clientId: quote.clientId,
      clientName: quote.clientName,
      employeeId: assignment.employeeId,
      employeeName: assignment.employeeName,
      userUid: user?.uid || '',
      userName: currentUserName,
      metadata: {step: assignment.step, rating, notes: notes || currentEvaluation?.notes || ''},
    });
    await logAuditEvent({
      user: user || null,
      action: 'update_employee_evaluation',
      module: 'cliente',
      targetId: quote.id,
      oldValue: currentEvaluation || null,
      newValue: nextEvaluation,
    });
  };

  const updatePieceFixture = async (
    quote: Quote,
    pieceId: string,
    fixtureType: FixtureCategory,
    field: keyof FixtureInfo,
    value: string,
  ) => {
    const numericFields: Array<keyof FixtureInfo> = ['width', 'depth', 'height', 'diameter'];
    const nextPieces = (quote.pieces || []).map((piece) => {
      if (piece.id !== pieceId) return piece;
      const currentFixture = piece.purchasedFixtures?.[fixtureType] || {};
      const nextFixture = {
        ...currentFixture,
        [field]: numericFields.includes(field) ?Number(value || 0) : value,
      };
      return {
        ...piece,
        purchasedFixtures: {
          ...(piece.purchasedFixtures || {}),
          [fixtureType]: nextFixture,
        },
      };
    });

    await updateDoc(doc(db, 'quotes', quote.id), {
      pieces: nextPieces,
      statusHistory: [
        ...(quote.statusHistory || []),
        {
          status: quote.status,
          changedAt: Timestamp.now(),
          changedByUid: user?.uid || '',
          changedByName: currentUserName,
          note: `Dados de ${fixtureType === 'sink' ?'cuba' : fixtureType === 'faucet' ?'torneira' : 'cooktop'} atualizados`,
        },
      ],
    });
    await logSystemEvent({
      type: 'fixture_updated',
      title: 'Item comprado pelo cliente atualizado',
      description: `${fixtureType === 'sink' ?'Cuba' : fixtureType === 'faucet' ?'Torneira' : 'Cooktop'} em ${quote.clientName}`,
      entityType: 'quote',
      entityId: quote.id,
      quoteId: quote.id,
      quoteStatus: quote.status,
      clientId: quote.clientId,
      clientName: quote.clientName,
      userUid: user?.uid || '',
      userName: currentUserName,
      metadata: {pieceId, fixtureType, field, value},
    });
  };

  const markPieceFixtureReceived = async (
    quote: Quote,
    pieceId: string,
    fixtureType: FixtureCategory,
  ) => {
    const nextPieces = (quote.pieces || []).map((piece) => {
      if (piece.id !== pieceId) return piece;
      const currentFixture = piece.purchasedFixtures?.[fixtureType] || {};
      return {
        ...piece,
        purchasedFixtures: {
          ...(piece.purchasedFixtures || {}),
          [fixtureType]: {
            ...currentFixture,
            received: true,
            receivedByUid: user?.uid || '',
            receivedByName: currentUserName,
            receivedAt: Timestamp.now(),
          },
        },
      };
    });

    const fixtureLabel = fixtureType === 'sink'
      ? 'cuba'
      : fixtureType === 'faucet'
        ? 'torneira'
        : fixtureType === 'cooktop'
          ? 'cooktop'
          : fixtureType === 'trashBin'
            ? 'lixeira'
            : 'torre de tomada';

    await updateDoc(doc(db, 'quotes', quote.id), {
      pieces: nextPieces,
      statusHistory: [
        ...(quote.statusHistory || []),
        {
          status: quote.status,
          changedAt: Timestamp.now(),
          changedByUid: user?.uid || '',
          changedByName: currentUserName,
          note: `${fixtureLabel.charAt(0).toUpperCase()}${fixtureLabel.slice(1)} recebida`,
        },
      ],
    });
    await logSystemEvent({
      type: 'fixture_updated',
      title: 'Item do cliente recebido',
      description: `${fixtureLabel.charAt(0).toUpperCase()} marcada como recebida em ${quote.clientName}`,
      entityType: 'quote',
      entityId: quote.id,
      quoteId: quote.id,
      quoteStatus: quote.status,
      clientId: quote.clientId,
      clientName: quote.clientName,
      userUid: user?.uid || '',
      userName: currentUserName,
      metadata: {pieceId, fixtureType, received: true},
    });
  };

  const filteredClients = clients.filter((client) => {
    const stage = statusToStage(getClientDisplayStatus(client, latestQuoteByClient.get(client.id)));
    const matchesStatus = statusFilter === 'all' || stage === statusFilter;
    const matchesSearch = normalize(`${client.name} ${client.phone} ${client.email || ''} ${client.cpf || ''} ${client.rg || ''} ${client.address}`).includes(normalize(search));
    return matchesStatus && matchesSearch;
  });
  const selectedCondominiumForForm = condominiumId ?condominiums.find((item) => item.id === condominiumId) : null;
  const condominiumAddressMode = selectedCondominiumForForm?.addressMode || 'street';
  const needsStreetAddress = addressType !== 'condominio' || condominiumAddressMode === 'street';
  const needsLotAddress = addressType === 'condominio' && condominiumAddressMode === 'lot';
  const openDriveFolder = (url?: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const toggleStatusMenu = (clientId: string) => {
    setStatusMenuClientId((current) => current === clientId ? null : clientId);
  };
  const handleCardStatusChange = async (quote: Quote, status: QuoteStatus) => {
    await updateQuoteStatus(quote, status);
    setStatusMenuClientId(null);
  };
  const handleLegacyClientStageChange = async (client: Client, stage: ClientStage) => {
    await updateDoc(doc(db, 'clients', client.id), {
      manualStage: stage,
      manualQuoteStatus: legacyStageToQuoteStatus(stage),
    });
    setStatusMenuClientId(null);
  };
  const handleLegacyClientStatusChange = async (client: Client, status: QuoteStatus | 'Sem projeto') => {
    await updateDoc(doc(db, 'clients', client.id), {
      manualStage: statusToStage(status),
      manualQuoteStatus: status,
    });
    setStatusMenuClientId(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Clientes</h1>
          <p className="text-slate-500 mt-1">{fixCorruptedText('Controle interno de qualidade, produção e entrega.')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            ref={contractInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleImportContract}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => contractInputRef.current?.click()}
            disabled={importingContract}
            className="flex items-center justify-center gap-2 rounded-2xl border border-brand-primary/20 bg-white px-6 py-3 font-semibold text-brand-primary shadow-sm transition-all hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileUp className="w-5 h-5" />
            {importingContract ? 'Lendo contrato...' : 'Adicionar contrato'}
          </button>
          <button
            type="button"
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center justify-center gap-2 bg-brand-primary text-white px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Novo Cliente
          </button>
        </div>
      </header>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="p-4 border-b border-slate-50 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder={fixCorruptedText('Buscar clientes por nome, telefone ou endereço...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusFilter label="Todos" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            {(Object.keys(stageMeta) as ClientStage[]).filter((stage) => stage !== 'none').map((stage) => (
              <StatusFilter key={stage} label={stageMeta[stage].label} active={statusFilter === stage} onClick={() => setStatusFilter(stage)} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {loading ?(
            <div className="col-span-full py-20 text-center text-slate-400">Carregando clientes...</div>
          ) : filteredClients.length === 0 ?(
            <div className="col-span-full py-20 text-center text-slate-400">Nenhum cliente encontrado.</div>
          ) : (
            filteredClients.map((client) => {
              const latestQuote = latestQuoteByClient.get(client.id);
              const legacyPieces = client.legacyManualQuote?.pieces || [];
              const legacyDelivered = legacyPieces.filter((piece) => ['Entrega', 'Finalizado'].includes(normalizeQuoteStatus(piece.status || 'Orçamento'))).length;
              const legacyPending = Math.max(0, legacyPieces.length - legacyDelivered);
              const pieceSummary = summarizeQuotePieces(latestQuote);
              const displayStatus = getClientDisplayStatus(client, latestQuote);
              const stage = statusToStage(displayStatus);
              const meta = stageMeta[stage];
              const statusChipClass = displayStatus === 'Sem projeto'
                ? 'bg-zinc-100 text-zinc-500 border-zinc-200'
                : quoteStatusColor(displayStatus);
              const statusDotClass = displayStatus === 'Sem projeto'
                ? 'bg-zinc-300'
                : quoteStatusDotColor(displayStatus);

              return (
                <div
                  key={client.id}
                  onClick={() => toggleStatusMenu(client.id)}
                  className="group relative cursor-pointer rounded-[24px] border border-slate-100 bg-slate-50 p-6 text-left transition-all duration-300 hover:bg-white hover:shadow-xl hover:shadow-slate-200/50">
                  <div className={cn('absolute top-4 right-4 w-3 h-3 rounded-full ring-4 ring-white', statusDotClass)} title={displayStatus} />
                  <div className="mb-4 flex items-start justify-between gap-4 pr-6">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-brand-primary border border-slate-100">
                        <User className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-slate-900 transition-colors group-hover:text-brand-primary truncate">{client.name}</h3>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          <Phone className="w-3 h-3" />
                          {client.phone}
                        </div>
                        {client.email && <div className="mt-0.5 text-xs text-slate-400 truncate">{client.email}</div>}
                      </div>
                    </div>
                    <div className="flex max-w-[52%] shrink-0 flex-wrap justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button type="button" title="Dados do cliente" onClick={() => openClientDetail(client, 'client')} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-brand-primary/5 hover:text-brand-primary">
                        <Info className="h-4 w-4" />
                      </button>
                      <button type="button" title="Informações do orçamento" onClick={() => openClientDetail(client, 'quote')} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-brand-primary/5 hover:text-brand-primary">
                        <ClipboardList className="h-4 w-4" />
                      </button>
                      {canViewClientValues && (
                        <button type="button" title="Valores detalhados" onClick={() => openClientDetail(client, 'values')} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-brand-primary/5 hover:text-brand-primary">
                          <Banknote className="h-4 w-4" />
                        </button>
                      )}
                      <button type="button" title="Funcionários" onClick={() => openClientDetail(client, 'team')} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-brand-primary/5 hover:text-brand-primary">
                        <Users className="h-4 w-4" />
                      </button>
                      {client.googleDriveUrl && (
                        <button type="button" title="Abrir pasta no Google Drive" onClick={() => openDriveFolder(client.googleDriveUrl)} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-brand-primary/5 hover:text-brand-primary">
                          <GoogleDriveIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button type="button" onClick={(event) => { event.stopPropagation(); handleEdit(client); }} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-brand-primary/5 hover:text-brand-primary">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button type="button" aria-label="Excluir" title="Excluir" onClick={(event) => { event.stopPropagation(); handleDelete(client.id); }} className="rounded-lg p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase', statusChipClass)}>
                      {fixCorruptedText(displayStatus)}
                    </span>
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                      <span className="line-clamp-2">{fixCorruptedText(client.address || 'Sem endereço cadastrado')}</span>
                    </div>
                    {latestQuote && (
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-brand-primary">
                          {pieceSummary.total} {fixCorruptedText('peça(s) ·')} {canViewClientValues ? formatCurrency(latestQuote.totalPrice || 0) : hiddenClientValueLabel}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-500">
                          {pieceSummary.delivered} finalizada(s) · {pieceSummary.pending} em andamento
                        </div>
                      </div>
                    )}
                    {!latestQuote && client.legacyProjectMode && client.legacyProjectMode !== 'sem_projeto' && (
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-brand-primary">
                          {legacyPieces.length} peça(s) · {canViewClientValues ? formatCurrency(client.legacyManualQuote?.totalPrice || 0) : hiddenClientValueLabel}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-500">
                          {legacyDelivered} finalizada(s) · {legacyPending} em andamento
                        </div>
                      </div>
                    )}
                  </div>
                  {statusMenuClientId === client.id && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/60" onClick={(event) => event.stopPropagation()}>
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Alterar status</div>
                      {latestQuote ?(
                        <div className="space-y-1.5">
                          {QUOTE_STATUSES.map((status) => {
                            const active = normalizeQuoteStatus(latestQuote.status) === status;
                            return (
                              <button
                                key={status}
                                type="button"
                                onClick={() => handleCardStatusChange(latestQuote, status)}
                                className={cn(
                                  'w-full rounded-xl border px-3 py-2 text-left text-xs font-semibold uppercase transition-all',
                                  active
                                    ? `${quoteStatusColor(status)} ring-2 ring-brand-primary/35`
                                    : `${quoteStatusColor(status)} opacity-85 hover:opacity-100`,
                                )}
                              >
                                {fixCorruptedText(status)}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {[...QUOTE_STATUSES, 'Sem projeto' as const].map((status) => {
                            const active = getClientDisplayStatus(client) === status;
                            const statusClass = status === 'Sem projeto'
                              ? 'bg-zinc-100 text-zinc-500 border-zinc-200'
                              : quoteStatusColor(status);
                            return (
                              <button
                                key={status}
                                type="button"
                                onClick={() => handleLegacyClientStatusChange(client, status)}
                                className={cn(
                                  'w-full rounded-xl border px-3 py-2 text-left text-xs font-semibold uppercase transition-all',
                                  active
                                    ? `${statusClass} ring-2 ring-brand-primary/35`
                                    : `${statusClass} opacity-85 hover:opacity-100`,
                                )}
                              >
                                {fixCorruptedText(status)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {detailModal && selectedClient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-[36px] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">{selectedClient.name}</h2>
                <p className="text-sm text-slate-400">
                  {detailModal === 'client' && 'Dados completos do cliente.'}
                  {detailModal === 'quote' && 'Itens, peças, materiais e informações técnicas do orçamento.'}
                  {detailModal === 'values' && 'Detalhamento financeiro e comercial do orçamento.'}
                  {detailModal === 'team' && 'Controle de produção e responsáveis do contrato fechado.'}
                </p>
                {detailModal !== 'client' && (
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{selectedClient.phone || '-'}</span>
                    {selectedClient.email && <span>{selectedClient.email}</span>}
                    {selectedClient.cpf && <span>CPF: {selectedClient.cpf}</span>}
                    {selectedClient.rg && <span>RG: {selectedClient.rg}</span>}
                    {selectedClient.birthDate && <span>Nascimento: {selectedClient.birthDate}</span>}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setDetailModal(null)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-auto p-6 space-y-6">
              {detailModal === 'client' ?(
                <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-100 p-5">
                    <h3 className="mb-4 font-display text-xl font-bold text-slate-900">Contato</h3>
                    <div className="space-y-3 text-sm text-slate-600">
                      <DetailRow label="Nome" value={selectedClient.name} />
                      <DetailRow label="Telefone" value={selectedClient.phone || '-'} />
                      <DetailRow label="E-mail" value={selectedClient.email || '-'} />
                      <DetailRow label="Google Drive" value={selectedClient.googleDriveUrl || '-'} multiline />
                      <DetailRow label="CPF" value={selectedClient.cpf || '-'} />
                      <DetailRow label="RG" value={selectedClient.rg || '-'} />
                      <DetailRow label="Nascimento" value={selectedClient.birthDate || '-'} />
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-100 p-5">
                    <h3 className="mb-4 font-display text-xl font-bold text-slate-900">Endereço e observações</h3>
                    <div className="space-y-3 text-sm text-slate-600">
                      <DetailRow label="Endereço" value={selectedClient.address || '-'} multiline />
                      <DetailRow label="Cidade" value={selectedClient.city || '-'} />
                      <DetailRow label="Bairro" value={selectedClient.neighborhood || '-'} />
                      <DetailRow label="CEP" value={selectedClient.zipCode || '-'} />
                      <DetailRow label="Condomínio" value={selectedClient.condominiumName || '-'} />
                      <DetailRow label="Bloco / Lote" value={[selectedClient.block, selectedClient.lot].filter(Boolean).join(' · ') || '-'} />
                      <DetailRow label="Torre / Apto" value={[selectedClient.tower, selectedClient.apartmentNumber].filter(Boolean).join(' · ') || '-'} />
                      <DetailRow label="Observações" value={selectedClient.notes || '-'} multiline />
                    </div>
                  </div>
                </section>
              ) : selectedClientQuotes.length > 0 ?(
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-4">
                    <select
                      value={selectedQuote?.id || ''}
                      onChange={(event) => setSelectedQuoteId(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      {selectedClientQuotes.map((quote) => (
                        <option key={quote.id} value={quote.id}>{quote.environment || 'Projeto'} · {canViewClientValues ? formatCurrency(quote.totalPrice || 0) : hiddenClientValueLabel}</option>
                      ))}
                    </select>
                    {selectedQuote && (
                      <select
                        value={normalizeQuoteStatus(selectedQuote.status)}
                        onChange={(event) => updateQuoteStatus(selectedQuote, event.target.value as QuoteStatus)}
                        className={cn('rounded-2xl border px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20', quoteStatusColor(selectedQuote.status))}
                      >
                        {quoteStatuses.map((status) => (
                          <option key={status} value={status} className={quoteStatusColor(status)}>{status}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedQuote && (
                    <>
                      {detailModal === 'team' && isApprovedOrBeyond(selectedQuote.status) && (
                        <section className="rounded-3xl border border-slate-100 p-5">
                          <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Agendamento do projeto</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Data da medição</label>
                              <input
                                type="date"
                                value={formatDateInput(selectedQuote.measurementDate)}
                                onChange={(event) => updateQuoteMeasurementDate(selectedQuote, event.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Prazo dado ao cliente</label>
                              <input
                                type="number"
                                min="0"
                                value={selectedQuote.deliveryDays || 0}
                                onChange={(event) => updateQuoteDeliveryDays(selectedQuote, event.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Entrega calculada</label>
                              <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700">
                                {stepDate(selectedQuote.deliveryDate) || 'Defina a medição'}
                              </div>
                            </div>
                          </div>
                        </section>
                      )}

                      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="rounded-3xl bg-slate-50 p-5">
                          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Valor fechado</div>
                          <div className="mt-2 text-2xl font-display font-bold text-slate-900">{canViewClientValues ? formatCurrency(selectedQuote.totalPrice || 0) : hiddenClientValueLabel}</div>
                        </div>
                        <div className="rounded-3xl bg-slate-50 p-5">
                          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Área total</div>
                          <div className="mt-2 text-2xl font-display font-bold text-slate-900">{(selectedQuote.totalArea || 0).toFixed(4)} m²</div>
                        </div>
                        <div className="rounded-3xl bg-slate-50 p-5">
                          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Status</div>
                          <div className="mt-2 text-2xl font-display font-bold text-brand-primary">{selectedQuote.status}</div>
                        </div>
                      </section>

                      {(detailModal === 'quote' || detailModal === 'values') && (
                        <>
                          <section className="rounded-3xl border border-slate-100 p-5">
                            <h3 className="mb-4 font-display text-xl font-bold text-slate-900">Resumo do orçamento</h3>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <SummaryBox label="Ambiente" value={selectedQuote.environment || '-'} />
                              <SummaryBox label="Pagamento" value={selectedQuote.paymentMethod || '-'} />
                              <SummaryBox label="Prazo" value={`${selectedQuote.deliveryDays || 0} dia(s)`} />
                              <SummaryBox label="Responsável" value={selectedQuote.responsibleUserName || selectedQuote.responsible || '-'} />
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                              <SummaryBox label="Peças no orçamento" value={`${summarizeQuotePieces(selectedQuote).total}`} />
                              <SummaryBox label="Peças finalizadas" value={`${summarizeQuotePieces(selectedQuote).delivered}`} />
                              <SummaryBox label="Peças em andamento" value={`${summarizeQuotePieces(selectedQuote).pending}`} />
                            </div>
                            {selectedQuoteCutoutRows.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {selectedQuoteCutoutRows.map((item) => (
                                  <span key={item.label} className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                                    {item.label}: {item.count}
                                  </span>
                                ))}
                              </div>
                            )}
                          </section>

                          <section className="rounded-3xl border border-slate-100 p-5">
                            <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Peças orçadas</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {(selectedQuote.pieces || []).map((piece) => (
                                <div key={piece.id} className="rounded-2xl bg-slate-50 p-4 flex gap-4">
                                  {piece.previewUrl ?(
                                    <img src={piece.previewUrl} alt={piece.name} className="h-24 w-24 rounded-xl border border-slate-100 bg-white object-contain p-2" />
                                  ) : (
                                    <div className="h-24 w-24 rounded-xl border border-slate-100 bg-white flex items-center justify-center text-slate-300">
                                      <ClipboardList className="w-8 h-8" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="font-bold text-slate-900">{piece.name}</div>
                                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase', quoteStatusColor(getPieceDisplayStatus(piece, selectedQuote)))}>
                                        {getPieceDisplayStatus(piece, selectedQuote)}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-400">{piece.length || 0} x {piece.width || 0} cm</div>
                                    <div className="mt-1 text-xs text-slate-500">{materialById(piece.materialId)?.name || selectedQuote.materialName || 'Sem material'}</div>
                                    <div className="mt-2 text-sm font-bold text-brand-primary">{getPieceAreaValue(piece).toFixed(4)} m²</div>
                                    {piece.sides?.length > 0 && (
                                      <div className="mt-1 text-xs text-slate-500">{piece.sides.length} adicional(is)</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>

                          <section className="rounded-3xl border border-slate-100 p-5">
                            <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Materiais do orçamento</h3>
                            {selectedQuoteSlabRows.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {selectedQuoteSlabRows.map((row) => (
                                  <div key={row.materialId} className="rounded-2xl bg-slate-50 p-4">
                                    <div className="flex gap-4">
                                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white flex items-center justify-center">
                                        {row.imageUrl ? (
                                          <img src={row.imageUrl} alt={row.materialName} className="h-full w-full object-cover" />
                                        ) : (
                                          <ClipboardList className="h-8 w-8 text-slate-300" />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="font-bold text-slate-900">{row.materialName}</div>
                                        <div className="text-xs text-slate-400">
                                          {formatMaterialSpecs(row) || row.category}
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                          <div className="rounded-xl bg-white p-2">
                                            <div className="font-bold text-slate-400 uppercase">Peças</div>
                                            <div className="font-mono font-bold text-slate-900">{row.pieces}</div>
                                          </div>
                                          <div className="rounded-xl bg-white p-2">
                                            <div className="font-bold text-slate-400 uppercase">Usando</div>
                                            <div className="font-mono font-bold text-brand-primary">{row.neededArea.toFixed(4)} m²</div>
                                          </div>
                                          <div className="rounded-xl bg-white p-2">
                                            <div className="font-bold text-slate-400 uppercase">Estoque</div>
                                            <div className="font-mono font-bold text-slate-900">{row.stockArea.toFixed(2)} m²</div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-400">Nenhum material vinculado às peças deste orçamento.</div>
                            )}
                          </section>

                          <section className="rounded-3xl border border-slate-100 p-5">
                            <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Itens selecionados</h3>
                            <div className="space-y-4">
                              {(selectedQuote.pieces || []).map((piece) => (
                                <div key={piece.id} className="rounded-2xl bg-slate-50 p-4">
                                  <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                      <div className="font-bold text-slate-900">{piece.name}</div>
                                      <div className="text-xs text-slate-400">Cooktop, cuba, torneira e itens complementares vinculados a esta peça.</div>
                                    </div>
                                  </div>
                                  {pieceFixtureCards(piece).length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                      {pieceFixtureCards(piece).map((fixture) => (
                                        <div key={`${piece.id}-${fixture.key}`} className="rounded-2xl border border-slate-100 bg-white p-4">
                                          <div className="font-bold text-slate-900">{fixture.label}</div>
                                          <div className="mt-1 text-sm text-slate-600">{fixture.name}</div>
                                          <div className="mt-1 text-xs text-slate-400">{[fixture.brand, fixture.model].filter(Boolean).join(' · ') || 'Sem marca/modelo'}</div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-400">Nenhum item cadastrado para esta peça.</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </section>
                        </>
                      )}

                      {detailModal === 'values' && (
                        <>
                          <section className="rounded-3xl border border-slate-100 p-5">
                            <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Valores detalhados</h3>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <SummaryBox label="Valor total" value={canViewClientValues ? formatCurrency(selectedQuote.totalPrice || 0) : hiddenClientValueLabel} highlight />
                              <SummaryBox label="Área total" value={`${(selectedQuote.totalArea || 0).toFixed(4)} m²`} />
                              <SummaryBox label="Valor médio por m²" value={canViewClientValues ? (selectedQuote.totalArea ? formatCurrency((selectedQuote.totalPrice || 0) / selectedQuote.totalArea) : '-') : hiddenClientValueLabel} />
                              <SummaryBox label="Qtd. de peças" value={`${selectedQuote.pieces?.length || 0}`} />
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                              <SummaryBox label="Forma de pagamento" value={selectedQuote.paymentMethod || '-'} />
                              <SummaryBox label="Prazo informado" value={`${selectedQuote.deliveryDays || 0} dia(s)`} />
                            </div>
                            {selectedQuote.commercialNotes && (
                              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Observações comerciais</div>
                                {selectedQuote.commercialNotes}
                              </div>
                            )}
                          </section>

                          <section className="rounded-3xl border border-slate-100 p-5">
                            <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Composição por peça</h3>
                            <div className="space-y-3">
                              {(selectedQuote.pieces || []).map((piece) => {
                                const area = getPieceAreaValue(piece);
                                const averageValue = selectedQuote.totalArea ? ((selectedQuote.totalPrice || 0) * area) / selectedQuote.totalArea : 0;
                                return (
                                  <div key={piece.id} className="rounded-2xl bg-slate-50 p-4 flex items-center justify-between gap-4">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-bold text-slate-900">{piece.name}</div>
                                        <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase', quoteStatusColor(getPieceDisplayStatus(piece, selectedQuote)))}>
                                          {getPieceDisplayStatus(piece, selectedQuote)}
                                        </span>
                                      </div>
                                      <div className="text-xs text-slate-400">{materialById(piece.materialId)?.name || selectedQuote.materialName || 'Sem material'}</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-mono text-sm font-bold text-brand-primary">{area.toFixed(4)} m²</div>
                                      <div className="text-xs text-slate-500">{canViewClientValues ? formatCurrency(averageValue) : hiddenClientValueLabel}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        </>
                      )}

                      {detailModal === 'team' && (
                        <>
                          <section className="rounded-3xl border border-slate-100 p-5">
                        <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Etapas e responsáveis</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {productionSteps.map((step) => {
                            const stepAssignments = orderedAssignmentsForStep(selectedQuote.employeeAssignments, step.key);
                            const teamCount = Math.max(1, Number(selectedQuote.teamCounts?.[step.key] || stepAssignments.length || 1));
                            return (
                              <div key={step.key} className="rounded-2xl bg-slate-50 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="font-bold text-slate-900">{step.label}</div>
                                    <div className="text-xs text-slate-400">
                                      {stepAssignments.length > 0 ? `${stepAssignments.length} colaborador(es) definido(s)` : 'Sem responsáveis registrados'}
                                    </div>
                                  </div>
                                  {stepAssignments.length > 0 && stepAssignments.every((assignment) => assignment.finishedAt) && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                                </div>
                                <label className="block space-y-1">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Quantos colaboradores nesta etapa?</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={teamCount}
                                    onChange={(event) => updateTeamCount(selectedQuote, step.key, event.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                                  />
                                </label>
                                {Array.from({length: teamCount}, (_, index) => {
                                  const assignment = stepAssignments.find((item) => item.slotIndex === index);
                                  const evaluation = assignment
                                    ?selectedQuote.employeeEvaluations?.find((item) => item.step === step.key && item.employeeId === assignment.employeeId)
                                    : undefined;
                                  return (
                                    <div key={`${step.key}-${index}`} className="rounded-xl bg-white p-3 space-y-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-slate-500">Colaborador {index + 1}</span>
                                        {assignment?.startedAt && <span className="text-[10px] font-semibold text-slate-400">Iniciado em {stepDate(assignment.startedAt)}</span>}
                                      </div>
                                      <select
                                        value={assignment?.employeeId || ''}
                                        onChange={(event) => updateAssignment(selectedQuote, step.key, event.target.value, index)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                                      >
                                        <option value="">Selecionar profissional</option>
                                        {activeEmployees.map((employee) => (
                                          <option key={employee.id} value={employee.id}>{employee.name} · {employee.role}</option>
                                        ))}
                                      </select>
                                      {assignment && (
                                        <>
                                          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                                            <input
                                              type="checkbox"
                                              checked={Boolean(assignment.finishedAt)}
                                              onChange={() => toggleStepDone(selectedQuote, assignment)}
                                              className="h-4 w-4 accent-brand-primary"
                                            />
                                            {assignment.finishedAt  ? `Finalizado em ${stepDate(assignment.finishedAt)}` : 'Marcar etapa finalizada'}
                                          </label>

                                          <div className="rounded-xl bg-slate-50 p-3 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Avaliação</span>
                                              {canEvaluateEmployees ? (
                                                <div className="flex gap-1">
                                                  {[1, 2, 3, 4, 5].map((rating) => (
                                                    <button
                                                      key={rating}
                                                      type="button"
                                                      onClick={() => updateEvaluation(selectedQuote, assignment, rating)}
                                                      className={cn(
                                                        'h-8 w-8 rounded-full text-sm transition-all',
                                                        (evaluation?.rating || 0) >= rating  ? 'bg-green-500 text-white shadow-sm' : 'bg-white text-slate-300 hover:text-brand-primary',
                                                      )}
                                                      title={`${rating} ponto(s)`}
                                                    >
                                                      {rating <= 2 ?'☹' : rating === 3 ?'◯' : '☺'}
                                                    </button>
                                                  ))}
                                                </div>
                                              ) : (
                                                <span className="text-[10px] font-bold uppercase text-slate-400">
                                                  Somente coordenador
                                                </span>
                                              )}
                                            </div>
                                            {canEvaluateEmployees ? (
                                              <input
                                                value={evaluation?.notes || ''}
                                                onChange={(event) => updateEvaluation(selectedQuote, assignment, evaluation?.rating || 3, event.target.value)}
                                                placeholder="Observação da etapa"
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-primary/20"
                                              />
                                            ) : (
                                              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500">
                                                {evaluation ?`${evaluation.rating}/5 - ${evaluation.notes || 'Sem observação'}` : 'Sem avaliação registrada.'}
                                              </div>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className="rounded-3xl border border-slate-100 p-5">
                        <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Histórico automático</h3>
                        <div className="space-y-2">
                          {(selectedQuote.statusHistory || []).slice().reverse().slice(0, 8).map((item, index) => (
                            <div key={`${item.changedAt}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                              <div className="text-sm font-bold text-slate-800">{(item as any).note || item.status}</div>
                              <div className="text-xs text-slate-400">
                                {stepDate(item.changedAt)}{item.responsibleEmployeeName  ? ` · ${item.responsibleEmployeeName}` : ''}
                              </div>
                            </div>
                          ))}
                          {(!selectedQuote.statusHistory || selectedQuote.statusHistory.length === 0) && (
                            <div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-400">Nenhuma movimentação registrada ainda.</div>
                          )}
                        </div>
                      </section>
                        </>
                      )}
                    </>
                  )}
                </>
              ) : selectedLegacyQuote ? (
                detailModal === 'team' ? (
                  <div className="rounded-3xl bg-slate-50 p-10 text-center">
                    <Users className="mx-auto mb-4 w-10 h-10 text-slate-300" />
                    <div className="font-display text-xl font-bold text-slate-900">Projeto legado sem equipe vinculada</div>
                    <p className="mt-2 text-sm text-slate-400">Esse cliente usa um orçamento existente lançado manualmente. Se precisar, você pode acompanhar as peças e os status individuais no card.</p>
                  </div>
                ) : (
                  <>
                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <div className="rounded-3xl bg-slate-50 p-5">
                        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Valor lançado</div>
                        <div className="mt-2 text-2xl font-display font-bold text-slate-900">{canViewClientValues ? formatCurrency(selectedLegacyQuote.totalPrice || 0) : hiddenClientValueLabel}</div>
                      </div>
                      <div className="rounded-3xl bg-slate-50 p-5">
                        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Peças</div>
                        <div className="mt-2 text-2xl font-display font-bold text-slate-900">{selectedLegacySummary.total}</div>
                      </div>
                      <div className="rounded-3xl bg-slate-50 p-5">
                        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Status geral</div>
                        <div className="mt-2 text-2xl font-display font-bold text-brand-primary">{getClientDisplayStatus(selectedClient)}</div>
                      </div>
                    </section>

                    {canViewClientValues && (
                      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <SummaryBox label="Recebido" value={formatCurrency(selectedLegacyPaymentsSummary.paid)} highlight />
                        <SummaryBox label="Pendente" value={formatCurrency(selectedLegacyPaymentsSummary.pending)} />
                        <SummaryBox label="Parcelas" value={`${selectedLegacyPayments.length || 0}`} />
                      </section>
                    )}

                    {(detailModal === 'quote' || detailModal === 'values') && (
                      <>
                        <section className="rounded-3xl border border-slate-100 p-5">
                          <h3 className="mb-4 font-display text-xl font-bold text-slate-900">Resumo do orçamento existente</h3>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <SummaryBox label="Tipo" value={selectedClient.legacyProjectMode === 'orcamento_existente' ? 'Orçamento existente' : 'Orçamento'} />
                            <SummaryBox label="Peças finalizadas" value={`${selectedLegacySummary.delivered}`} />
                            <SummaryBox label="Peças em andamento" value={`${selectedLegacySummary.pending}`} />
                          </div>
                        </section>

                        <section className="rounded-3xl border border-slate-100 p-5">
                          <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Peças do projeto</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedLegacyPieces.map((piece) => (
                              <div key={piece.id} className="rounded-2xl bg-slate-50 p-4 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-bold text-slate-900">{piece.name}</div>
                                  <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase', quoteStatusColor(piece.status))}>
                                    {normalizeQuoteStatus(piece.status || 'Orçamento')}
                                  </span>
                                </div>
                                <div className="text-sm font-bold text-brand-primary">{canViewClientValues ? formatCurrency(piece.value || 0) : hiddenClientValueLabel}</div>
                                <div className="text-xs text-slate-500">
                                  {(piece.items || []).length > 0 ? piece.items?.join(' · ') : 'Sem itens vinculados'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        {canViewClientValues && (
                          <section className="rounded-3xl border border-slate-100 p-5">
                            <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Parcelas do pagamento</h3>
                            <div className="space-y-3">
                              {selectedLegacyPayments.length > 0 ? selectedLegacyPayments.map((payment) => (
                                <div key={payment.id} className="rounded-2xl bg-slate-50 p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <div className="font-bold text-slate-900">{payment.label || 'Parcela sem nome'}</div>
                                    <div className="text-xs text-slate-400">
                                      {[payment.paymentMethod, payment.dueDate ? `Vencimento ${normalizeInputDateToDisplay(payment.dueDate)}` : '', payment.paidDate ? `Pago em ${normalizeInputDateToDisplay(payment.paidDate)}` : ''].filter(Boolean).join(' · ')}
                                    </div>
                                    {payment.notes && <div className="mt-1 text-xs text-slate-500">{payment.notes}</div>}
                                  </div>
                                  <div className="text-left md:text-right">
                                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase', payment.status === 'Pago' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : payment.status === 'Vencido' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>
                                      {payment.status}
                                    </span>
                                    <div className="mt-2 font-mono text-sm font-bold text-brand-primary">{formatCurrency(payment.amount || 0)}</div>
                                  </div>
                                </div>
                              )) : (
                                <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">Nenhuma parcela cadastrada ainda.</div>
                              )}
                            </div>
                          </section>
                        )}
                      </>
                    )}

                    {detailModal === 'values' && (
                      <section className="rounded-3xl border border-slate-100 p-5">
                        <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Valores por peça</h3>
                        <div className="space-y-3">
                          {selectedLegacyPieces.map((piece) => (
                            <div key={`${piece.id}-value`} className="rounded-2xl bg-slate-50 p-4 flex items-center justify-between gap-4">
                              <div>
                                <div className="font-bold text-slate-900">{piece.name}</div>
                                <div className="text-xs text-slate-400">{(piece.items || []).join(' · ') || 'Sem itens vinculados'}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono text-sm font-bold text-brand-primary">{canViewClientValues ? formatCurrency(piece.value || 0) : hiddenClientValueLabel}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )
              ) : (
                <div className="rounded-3xl bg-slate-50 p-10 text-center">
                  <ClipboardList className="mx-auto mb-4 w-10 h-10 text-slate-300" />
                  <div className="font-display text-xl font-bold text-slate-900">Nenhum orçamento vinculado</div>
                  <p className="mt-2 text-sm text-slate-400">Quando um orçamento for fechado para este cliente, os detalhes aparecerão nos ícones do card.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-[32px] shadow-2xl p-6 md:p-8 space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-slate-900">{editingClient ?'Editar Cliente' : 'Novo Cliente'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Nome Completo" value={name} onChange={setName} required />
                <FormField label="Telefone" value={phone} onChange={setPhone} required />
                <FormField label="Email" value={email} onChange={setEmail} type="email" />
                <FormField label="Link do Google Drive" value={googleDriveUrl} onChange={setGoogleDriveUrl} />
                <FormField label="Data de nascimento" value={birthDate} onChange={setBirthDate} type="date" />
                <FormField label="CPF" value={cpf} onChange={setCpf} />
                <FormField label="RG" value={rg} onChange={setRg} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {needsStreetAddress && (
                  <div className="md:col-span-2">
                    <FormField label="Endereço (rua e número)" value={address} onChange={setAddress} required={needsStreetAddress} />
                  </div>
                )}
                <FormField label="Bairro" value={neighborhood} onChange={setNeighborhood} />
                <FormField label="CEP" value={zipCode} onChange={setZipCode} />
                <FormField label="Cidade" value={city} onChange={setCity} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Tipo de endereço</label>
                <select
                  value={addressType}
                  onChange={(e) => {
                    const nextType = e.target.value as Client['addressType'];
                    setAddressType(nextType);
                    if (nextType === 'casa') {
                      setCondominiumId('');
                      setBlock('');
                      setLot('');
                      setTower('');
                      setApartmentNumber('');
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                >
                  <option value="casa">Casa</option>
                  <option value="condominio">Condomínio</option>
                  <option value="apartamento">Apartamento</option>
                </select>
              </div>

              {(addressType === 'condominio' || addressType === 'apartamento') && (
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Condomínio cadastrado</label>
                  <select
                    value={condominiumId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const selected = condominiums.find((item) => item.id === nextId);
                      setCondominiumId(nextId);
                      if (selected?.city) setCity(selected.city);
                      if ((selected?.addressMode || 'street') === 'street') {
                        setBlock('');
                        setLot('');
                      } else {
                        setAddress('');
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  >
                    <option value="">Selecione um condomínio</option>
                    {condominiums.map((condominium) => (
                      <option key={condominium.id} value={condominium.id}>{condominium.name} · {condominium.city}</option>
                    ))}
                  </select>
                </div>
              )}

              {needsLotAddress && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Quadra" value={block} onChange={setBlock} required />
                  <FormField label="Lote" value={lot} onChange={setLot} required />
                </div>
              )}

              {addressType === 'apartamento' && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Torre" value={tower} onChange={setTower} />
                  <FormField label="Apartamento" value={apartmentNumber} onChange={setApartmentNumber} />
                </div>
              )}

              <div className="rounded-3xl border border-slate-100 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-900">Projeto do cliente antigo</h3>
                    <p className="text-xs text-slate-400">Use isso quando o cliente já existia antes do sistema.</p>
                  </div>
                  <select
                    value={legacyProjectMode}
                    onChange={(e) => setLegacyProjectMode(e.target.value as Client['legacyProjectMode'])}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                  >
                    <option value="sem_projeto">Sem projeto</option>
                    <option value="orcamento">Orçamento</option>
                    <option value="orcamento_existente">Orçamento existente</option>
                  </select>
                </div>

                {legacyProjectMode !== 'sem_projeto' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-slate-500 font-medium text-sm">Valor total aprovado</label>
                      <input
                        value={canViewClientValues ? legacyTotalPrice : hiddenClientValueLabel}
                        readOnly
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 outline-none font-semibold text-slate-700"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-slate-700">Peças do projeto</div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {legacyProjectMode === 'orcamento_existente' && (
                            <>
                              <input
                                ref={legacyQuoteInputRef}
                                type="file"
                                accept="application/pdf"
                                className="hidden"
                                onChange={handleImportLegacyQuotePdf}
                              />
                              <button
                                type="button"
                                onClick={() => legacyQuoteInputRef.current?.click()}
                                disabled={importingLegacyQuotePdf}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <FileUp className="h-4 w-4" />
                                {importingLegacyQuotePdf ? 'Lendo PDF...' : 'Importar PDF'}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={addLegacyPiece}
                            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white"
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar peça
                          </button>
                        </div>
                      </div>

                      {legacyPieces.length === 0 && (
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">Nenhuma peça adicionada ainda.</div>
                      )}

                      {legacyPieces.map((piece, index) => (
                        <div key={piece.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-bold text-slate-700">Peça {index + 1}</div>
                            <button type="button" onClick={() => removeLegacyPiece(piece.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <FormField label="Nome da peça" value={piece.name} onChange={(value) => updateLegacyPiece(piece.id, {name: value})} />
                            <div className="space-y-1.5">
                              <label className="text-slate-500 font-medium text-sm">Status da peça</label>
                              <select
                                value={normalizeQuoteStatus(piece.status || 'Orçamento')}
                                onChange={(e) => updateLegacyPiece(piece.id, {status: e.target.value as QuoteStatus})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                              >
                                {QUOTE_STATUSES.map((status) => (
                                  <option key={status} value={status}>{status}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-slate-500 font-medium text-sm">Valor da peça</label>
                              <input
                                value={canViewClientValues ? formatCurrencyInput(piece.value || 0) : hiddenClientValueLabel}
                                onChange={(e) => updateLegacyPiece(piece.id, {value: parseCurrencyInput(e.target.value)})}
                                placeholder="R$ 0,00"
                                disabled={!canViewClientValues}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium disabled:cursor-not-allowed disabled:bg-slate-100"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-slate-500 font-medium text-sm">Itens do projeto</label>
                            <input
                              value={(piece.items || []).join(', ')}
                              onChange={(e) => updateLegacyPiece(piece.id, {items: e.target.value.split(',').map((item) => item.trim()).filter(Boolean)})}
                              placeholder="Ex.: Cooktop, cuba, soleira, ilha"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {canViewClientValues && (
                      <div className="space-y-4 rounded-3xl border border-slate-100 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-slate-700">Parcelas do pagamento</div>
                            <div className="text-xs text-slate-400">Controle o que já foi recebido e o que falta cobrar.</div>
                          </div>
                          <button
                            type="button"
                            onClick={addLegacyPayment}
                            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white"
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar parcela
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <SummaryBox label="Recebido" value={formatCurrency(legacyPaymentsSummary.paid)} highlight />
                          <SummaryBox label="Pendente" value={formatCurrency(legacyPaymentsSummary.pending)} />
                          <SummaryBox label="Diferença para o total" value={formatCurrency(legacyPaymentsSummary.difference)} />
                        </div>

                        {legacyPayments.length === 0 && (
                          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">Nenhuma parcela cadastrada ainda.</div>
                        )}

                        {legacyPayments.map((payment, index) => (
                          <div key={payment.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-slate-700">Parcela {index + 1}</div>
                              <button type="button" onClick={() => removeLegacyPayment(payment.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <FormField label="Nome da parcela" value={payment.label} onChange={(value) => updateLegacyPayment(payment.id, {label: value})} />
                              <div className="space-y-1.5">
                                <label className="text-slate-500 font-medium text-sm">Valor</label>
                                <input
                                  value={formatCurrencyInput(payment.amount || 0)}
                                  onChange={(e) => updateLegacyPayment(payment.id, {amount: parseCurrencyInput(e.target.value)})}
                                  placeholder="R$ 0,00"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-slate-500 font-medium text-sm">Status</label>
                                <select
                                  value={payment.status}
                                  onChange={(e) => updateLegacyPayment(payment.id, {status: e.target.value as LegacyPaymentStatus})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                                >
                                  {legacyPaymentStatuses.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <FormField label="Vencimento" value={payment.dueDate || ''} onChange={(value) => updateLegacyPayment(payment.id, {dueDate: value})} type="date" />
                              <FormField label="Data do pagamento" value={payment.paidDate || ''} onChange={(value) => updateLegacyPayment(payment.id, {paidDate: value})} type="date" />
                              <FormField label="Forma de pagamento" value={payment.paymentMethod || ''} onChange={(value) => updateLegacyPayment(payment.id, {paymentMethod: value})} />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-slate-500 font-medium text-sm">Observações da parcela</label>
                              <input
                                value={payment.notes || ''}
                                onChange={(e) => updateLegacyPayment(payment.id, {notes: e.target.value})}
                                placeholder="Ex.: sinal, antes da entrega, saldo final"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Observações</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[60px]" />
              </div>

              <button type="submit" className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95">
                {editingClient ?'Salvar Alterações' : 'Cadastrar Cliente'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const StatusFilter = ({label, active, onClick}: {key?: React.Key; label: string; active: boolean; onClick: () => void}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn('px-3 py-2 rounded-xl text-xs font-bold transition-all', active  ? 'bg-brand-primary text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100')}
  >
    {label}
  </button>
);

const GoogleDriveIcon = ({className = 'h-4 w-4'}: {className?: string}) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M9.4 3 3 14h4.6L14 3H9.4Z" fill="#0F9D58" />
    <path d="M14 3h4.6L25 14h-4.6L14 3Z" transform="translate(-1 0)" fill="#4285F4" />
    <path d="M7.6 14 10 18h11.4L19 14H7.6Z" fill="#F4B400" />
    <path d="M3 14 5.4 18H10l-2.4-4H3Z" fill="#0F9D58" />
  </svg>
);

const DetailRow = ({label, value, multiline = false}: {label: string; value: string; multiline?: boolean}) => (
  <div className="rounded-2xl bg-slate-50 px-4 py-3">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
    <div className={cn('mt-1 text-sm font-semibold text-slate-700', multiline && 'whitespace-pre-wrap leading-relaxed')}>
      {value}
    </div>
  </div>
);

const SummaryBox = ({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) => (
  <div className={cn('rounded-3xl p-5', highlight ?'bg-brand-primary/10' : 'bg-slate-50')}>
    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</div>
    <div className={cn('mt-2 text-lg font-display font-bold', highlight ?'text-brand-primary' : 'text-slate-900')}>
      {value}
    </div>
  </div>
);

const FormField = ({
  label,
  value,
  onChange,
  required,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) => (
  <div className="space-y-1.5">
    <label className="text-slate-500 font-medium text-sm">{label}</label>
    <input
      type={type}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
    />
  </div>
);

const FixtureFields = ({
  quote,
  piece,
  type,
  legacyKey,
  title,
  imageUrl,
  displayName,
  description,
  manualUrl,
  manualFileName,
  onChange,
  onReceive,
}: {
  key?: React.Key;
  quote: Quote;
  piece: QuotePiece;
  type: FixtureCategory;
  legacyKey: 'sink' | 'faucet' | 'cooktop' | 'trashBin' | 'popUpTower';
  title: string;
  imageUrl?: string;
  displayName: string;
  description?: string;
  manualUrl?: string;
  manualFileName?: string;
  onChange: (quote: Quote, pieceId: string, fixtureType: FixtureCategory, field: keyof FixtureInfo, value: string) => void;
  onReceive: (quote: Quote, pieceId: string, fixtureType: FixtureCategory) => Promise<void>;
}) => {
  const fixture = piece.purchasedFixtures?.[legacyKey] || {};
  const showDiameter = type === 'faucet';
  const receivedAt = fixture.receivedAt?.toDate ? fixture.receivedAt.toDate() : fixture.receivedAt ? new Date(fixture.receivedAt) : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <ClipboardList className="h-7 w-7 text-slate-300" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</div>
          <div className="font-bold text-slate-900 line-clamp-2">{displayName}</div>
          {description && <div className="mt-1 text-xs text-slate-500 line-clamp-2">{description}</div>}
          {manualUrl && (
            <a
              href={manualUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-100"
            >
              <FileText className="h-3.5 w-3.5" />
              {manualFileName || 'Abrir manual'}
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onReceive(quote, piece.id, type)}
          disabled={fixture.received === true}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all',
            fixture.received
              ? 'bg-emerald-100 text-emerald-700 cursor-default'
              : 'bg-emerald-600 text-white hover:bg-emerald-700',
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {fixture.received ? 'Recebido' : 'Receber item'}
        </button>
        {fixture.received && (
          <div className="text-[11px] font-semibold text-slate-500">
            {fixture.receivedByName || 'Recebido'}{receivedAt ? ` · ${receivedAt.toLocaleDateString('pt-BR')}` : ''}
          </div>
        )}
      </div>
      <FixtureInput label="Modelo" value={fixture.model || ''} onBlur={(value) => onChange(quote, piece.id, type, 'model', value)} />
      <FixtureInput label="Marca" value={fixture.brand || ''} onBlur={(value) => onChange(quote, piece.id, type, 'brand', value)} />
      {showDiameter ?(
        <FixtureInput label="Diâmetro/furo (cm)" type="number" value={String(fixture.diameter || '')} onBlur={(value) => onChange(quote, piece.id, type, 'diameter', value)} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <FixtureInput label="Largura (cm)" type="number" value={String(fixture.width || '')} onBlur={(value) => onChange(quote, piece.id, type, 'width', value)} />
          <FixtureInput label="Profundidade (cm)" type="number" value={String(fixture.depth || '')} onBlur={(value) => onChange(quote, piece.id, type, 'depth', value)} />
        </div>
      )}
      <FixtureInput label="Altura (cm)" type="number" value={String(fixture.height || '')} onBlur={(value) => onChange(quote, piece.id, type, 'height', value)} />
      <FixtureInput label="Observações" value={fixture.notes || ''} onBlur={(value) => onChange(quote, piece.id, type, 'notes', value)} />
    </div>
  );
};

const FixtureInput = ({label, value, type = 'text', onBlur}: {label: string; value: string; type?: string; onBlur: (value: string) => void}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <input
        type={type}
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => onBlur(localValue)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
      />
    </label>
  );
};
