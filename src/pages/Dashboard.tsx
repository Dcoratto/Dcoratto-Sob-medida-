import React, {useEffect, useMemo, useState} from 'react';
import {addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, Timestamp} from '../lib/firestore';
import {useNavigate} from 'react-router-dom';
import {AlertCircle, CheckCircle2, Clock, Database, FileText, FolderKanban, Package, Plus, StickyNote, Trash2, TrendingUp, Users} from 'lucide-react';
import {db} from '../lib/firestore';
import {Client, InventoryItem, InventoryPurchase, InventoryReservation, Material, Profile, Quote, QuoteStatus} from '../types';
import {cn, formatCurrency} from '../lib/utils';
import {useAuth} from '../contexts/AuthContext';
import {getClientDisplayStatus, normalizeQuoteStatus, quoteStatusColor, shouldAppearInProjects} from '../lib/quoteStatus';

type ClientStage = 'pre' | 'approved' | 'production' | 'ready' | 'done' | 'none';

const statusGroups: Record<ClientStage, {label: string; dot: string; bg: string; statuses: QuoteStatus[]}> = {
  pre: {label: 'Orçamento', dot: 'bg-[#B0BEC5]', bg: 'bg-[#B0BEC5]/20 text-[#455A64]', statuses: ['Orçamento']},
  approved: {label: 'Orçamento Aprovado', dot: 'bg-[#66BB6A]', bg: 'bg-[#66BB6A]/20 text-[#2E7D32]', statuses: ['Orçamento Aprovado', 'Medição', 'Projeto']},
  production: {label: 'Produção', dot: 'bg-[#E53935]', bg: 'bg-[#E53935]/15 text-[#B71C1C]', statuses: ['Projeto Aprovado', 'Corte', 'Acabamento', 'Montagem', 'Produção Finalizada']},
  ready: {label: 'Conferência/Entrega', dot: 'bg-[#00838F]', bg: 'bg-[#00838F]/15 text-[#006064]', statuses: ['Conferência Final', 'Entrega']},
  done: {label: 'Finalizado', dot: 'bg-[#0B3D0B]', bg: 'bg-[#0B3D0B] text-white', statuses: ['Finalizado']},
  none: {label: 'Sem orçamento', dot: 'bg-slate-300', bg: 'bg-slate-50 text-slate-500', statuses: []},
};

const normalizeStatus = normalizeQuoteStatus;

const isClosedSale = (status?: string) => {
  const text = (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (text.includes('pre') || text.includes('orcamento') || text.includes('aguardando') || text.includes('medido') || text.includes('enviado') || text.includes('recusado')) {
    return false;
  }
  return text.includes('aprovado') || text.includes('corte') || text.includes('montagem') || text.includes('producao') || text.includes('acabamento') || text.includes('conferencia') || text.includes('entrega') || text.includes('finalizado') || text.includes('concluido');
};

const quoteStage = (quote?: Quote): ClientStage => {
  if (!quote) return 'none';
  const status = normalizeStatus(quote.status);
  if (status === 'Finalizado') return 'done';
  if (['Conferência Final', 'Entrega'].includes(status)) return 'ready';
  if (['Projeto Aprovado', 'Corte', 'Acabamento', 'Montagem', 'Produção Finalizada'].includes(status)) return 'production';
  if (['Orçamento Aprovado', 'Medição', 'Projeto'].includes(status)) return 'approved';
  return 'pre';
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};
const parseDateKey = (value?: string): Date | null => {
  if (!value || !value.includes('-')) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

interface DashboardNote {
  id: string;
  text: string;
  createdAt?: any;
  userUid?: string;
  userName?: string;
  targetUid?: string;
  targetName?: string;
}

interface ManualCalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: any;
  dateKey?: string;
  clientId?: string;
  clientName?: string;
}

interface DashboardCalendarEvent {
  id: string;
  sourceId?: string;
  quoteId?: string;
  clientId?: string;
  clientName?: string;
  date: Date;
  type: 'Medição' | 'Entrega' | 'Evento';
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const {user, profile, appUid, isAdmin, hasPermission} = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [materialsCount, setMaterialsCount] = useState(0);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
  const [manualEvents, setManualEvents] = useState<ManualCalendarEvent[]>([]);
  const [notes, setNotes] = useState<DashboardNote[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [newNote, setNewNote] = useState('');
  const [noteTargetUid, setNoteTargetUid] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDeadlineEvent, setSelectedDeadlineEvent] = useState<DashboardCalendarEvent | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  useEffect(() => {
    const qQuotesAll = query(collection(db, 'quotes'));
    const unsubQuotesAll = onSnapshot(qQuotesAll, (snap) => {
      setQuotes(snap.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
    });

    const qQuotesRecent = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'), limit(5));
    const unsubQuotesRecent = onSnapshot(qQuotesRecent, (snap) => {
      setRecentQuotes(snap.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map((item) => ({id: item.id, ...item.data()} as Client)));
    });

    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snap) => {
      const materials = snap.docs.map((item) => ({id: item.id, ...item.data()} as Material));
      setMaterialsCount(materials.length);
    });

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snap) => {
      setInventory(snap.docs.map((item) => ({id: item.id, ...item.data()} as InventoryItem)));
      setLoading(false);
    });
    const unsubReservations = onSnapshot(collection(db, 'inventoryReservations'), (snap) => {
      setReservations(snap.docs.map((item) => ({id: item.id, ...item.data()} as InventoryReservation)));
    });
    const unsubPurchases = onSnapshot(collection(db, 'inventoryPurchases'), (snap) => {
      setPurchases(snap.docs.map((item) => ({id: item.id, ...item.data()} as InventoryPurchase)));
    });
    const unsubNotes = onSnapshot(query(collection(db, 'dashboardNotes'), orderBy('createdAt', 'desc'), limit(12)), (snap) => {
      setNotes(snap.docs.map((item) => ({id: item.id, ...item.data()} as DashboardNote)));
    });
    const unsubUsers = onSnapshot(query(collection(db, 'profiles'), orderBy('name', 'asc')), (snap) => {
      setUsers(snap.docs.map((item) => ({uid: item.id, ...item.data()} as Profile)));
    });
    const unsubManualEvents = onSnapshot(collection(db, 'calendarEvents'), (snap) => {
      setManualEvents(snap.docs.map((item) => ({id: item.id, ...item.data()} as ManualCalendarEvent)));
    });

    return () => {
      unsubQuotesAll();
      unsubQuotesRecent();
      unsubClients();
      unsubMaterials();
      unsubInventory();
      unsubReservations();
      unsubPurchases();
      unsubNotes();
      unsubUsers();
      unsubManualEvents();
    };
  }, []);

  const addDashboardNote = async () => {
    const text = newNote.trim();
    if (!text || !appUid) return;

    setSavingNote(true);
    try {
      const targetUser = users.find((item) => item.uid === noteTargetUid);
      await addDoc(collection(db, 'dashboardNotes'), {
        text,
        createdAt: Timestamp.now(),
        userUid: appUid,
        userName: profile?.name || user.user_metadata?.name || user.email || 'Usuário',
        targetUid: targetUser?.uid || '',
        targetName: targetUser?.name || '',
      });
      setNewNote('');
      setNoteTargetUid('');
    } finally {
      setSavingNote(false);
    }
  };

  const deleteDashboardNote = async (note: DashboardNote) => {
    if (!note.id || !appUid) return;
    if (!isAdmin && note.userUid !== appUid) return;
    await deleteDoc(doc(db, 'dashboardNotes', note.id));
  };

  const latestQuoteByClient = useMemo(() => {
    const sorted = [...quotes].sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    return sorted.reduce<Record<string, Quote>>((acc, quote) => {
      if (quote.clientId && !acc[quote.clientId]) acc[quote.clientId] = quote;
      return acc;
    }, {});
  }, [quotes]);
  const projectCount = useMemo(() => {
    const quoteProjects = quotes.filter((quote) => shouldAppearInProjects(quote.status)).length;
    const legacyProjects = clients
      .filter((client) => !latestQuoteByClient[client.id])
      .filter((client) => shouldAppearInProjects(getClientDisplayStatus(client)))
      .length;
    return quoteProjects + legacyProjects;
  }, [clients, latestQuoteByClient, quotes]);
  const visibleNotes = notes.filter((note) => !note.targetUid || note.targetUid === appUid || note.userUid === appUid || isAdmin);

  const stageCounts = useMemo(() => {
    const base: Record<ClientStage, number> = {pre: 0, approved: 0, production: 0, ready: 0, done: 0, none: 0};
    clients.forEach((client) => {
      base[quoteStage(latestQuoteByClient[client.id])] += 1;
    });
    return base;
  }, [clients, latestQuoteByClient]);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const daysLeftFromToday = (date: Date) => {
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return Math.ceil((target - today.getTime()) / 86400000);
  };

  const calendarEvents = useMemo(() => {
    const events: DashboardCalendarEvent[] = [];
    quotes.forEach((quote) => {
      const measurementDate = toDate(quote.measurementDate);
      const deliveryDate = toDate(quote.deliveryDate);
      if (measurementDate) {
        events.push({
          id: `${quote.id}-medicao`,
          quoteId: quote.id,
          clientId: quote.clientId,
          clientName: quote.clientName,
          date: measurementDate,
          type: 'Medição',
        });
      }
      if (deliveryDate) {
        events.push({
          id: `${quote.id}-entrega`,
          quoteId: quote.id,
          clientId: quote.clientId,
          clientName: quote.clientName,
          date: deliveryDate,
          type: 'Entrega',
        });
      }
    });
    manualEvents.forEach((event) => {
      const date = parseDateKey(event.dateKey) || toDate(event.date);
      if (!date) return;
      events.push({
        id: `manual-${event.id}`,
        sourceId: event.id,
        clientId: event.clientId,
        clientName: event.clientName || event.title,
        date,
        type: 'Evento',
      });
    });
    return events;
  }, [manualEvents, quotes]);

  const deadlineAlerts = useMemo(() => {
    return calendarEvents
      .map((event) => ({event, daysLeft: daysLeftFromToday(event.date)}))
      .filter((item) => item.daysLeft >= 0 && item.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        level: (item.daysLeft <= 2 ? 'maximo' : 'alerta') as 'maximo' | 'alerta',
      }));
  }, [calendarEvents, today]);

  const upcomingSchedule = useMemo(() => {
    return calendarEvents
      .map((event) => ({...event, daysLeft: daysLeftFromToday(event.date)}))
      .filter((event) => event.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);
  }, [calendarEvents, daysLeftFromToday]);

  const stats = [
    {label: 'Orçamentos', value: quotes.length, icon: FileText, color: 'text-brand-primary', bg: 'bg-brand-primary/10', path: '/quotes'},
    {label: 'Projetos', value: projectCount, icon: FolderKanban, color: 'text-emerald-600', bg: 'bg-emerald-50', path: '/projects'},
    {label: 'Clientes', value: clients.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', path: '/clients'},
    {label: 'Materiais', value: materialsCount, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50', path: '/materials'},
    {label: 'Itens em Estoque', value: inventory.length, icon: Database, color: 'text-amber-600', bg: 'bg-amber-50', path: '/inventory'},
  ];

  const openQuotes = quotes.filter((quote) => statusGroups.pre.statuses.includes(normalizeStatus(quote.status)));
  const closedQuotes = quotes.filter((quote) => isClosedSale(quote.status));
  const legacyManualSales = clients
    .filter((client) => client.legacyProjectMode === 'orcamento_existente' && (client.legacyManualQuote?.totalPrice || 0) > 0)
    .reduce((acc, client) => acc + (client.legacyManualQuote?.totalPrice || 0), 0);
  const totalValue = closedQuotes.reduce((acc, quote) => acc + (quote.totalPrice || 0), 0) + legacyManualSales;
  const purchaseRelevantReservedAreaByMaterial = (materialId: string) =>
    reservations
      .filter((reservation) => {
        const status = (reservation.quoteStatus || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return reservation.materialId === materialId && !['recusado', 'cancelado', 'finalizado'].includes(status);
      })
      .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const finalizedSoldAreaByMaterial = (materialId: string) =>
    reservations
      .filter((reservation) => {
        const status = (reservation.quoteStatus || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return reservation.materialId === materialId && status === 'finalizado';
      })
      .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const physicalAreaByMaterial = (materialId: string) =>
    inventory
      .filter((item) => item.materialId === materialId && !['usada', 'descarte'].includes((item.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))
      .reduce((acc, item) => acc + (item.area || 0), 0);
  const orderedAreaByMaterial = (materialId: string) =>
    purchases
      .filter((purchase) => purchase.materialId === materialId && purchase.status === 'Pedido')
      .reduce((acc, purchase) => acc + (purchase.area || 0), 0);
  const pendingPurchases = Array.from(new Set([
    ...inventory.map((item) => item.materialId),
    ...reservations.map((reservation) => reservation.materialId),
    ...purchases.map((purchase) => purchase.materialId),
  ])).map((materialId) => {
    const reserved = purchaseRelevantReservedAreaByMaterial(materialId);
    const available = Math.max(0, physicalAreaByMaterial(materialId) - finalizedSoldAreaByMaterial(materialId));
    const ordered = orderedAreaByMaterial(materialId);
    const missing = Math.max(0, reserved - available - ordered);
    const material = inventory.find((item) => item.materialId === materialId)?.materialName || materialId;
    return {materialId, material, missing};
  }).filter((item) => item.missing > 0);
  const totalPendingPurchaseArea = pendingPurchases.reduce((acc, item) => acc + item.missing, 0);

  const getStatusColor = (status: string) => quoteStatusColor(status).replace(/ border-[a-z]+-\d+/g, '');
  const selectedDeadlineClient = selectedDeadlineEvent?.clientId ? clients.find((client) => client.id === selectedDeadlineEvent.clientId) : null;
  const canViewSalesValues = hasPermission('relatorios', 'verFaturamento');
  const hiddenSalesValueLabel = 'Valor oculto';

  const handleDeleteManualEvent = async () => {
    if (!selectedDeadlineEvent?.sourceId) return;
    setDeletingEventId(selectedDeadlineEvent.sourceId);
    try {
      await deleteDoc(doc(db, 'calendarEvents', selectedDeadlineEvent.sourceId));
      setSelectedDeadlineEvent(null);
    } finally {
      setDeletingEventId(null);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header>
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Painel de Controle</h1>
        <p className="text-slate-500 mt-1">Veja um resumo das atividades da D'Coratto.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {stats.map((stat) => (
          <button
            key={stat.path}
            type="button"
            onClick={() => navigate(stat.path)}
            className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 group hover:shadow-xl hover:shadow-slate-200/40 hover:-translate-y-0.5 transition-all duration-300 text-left focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            <div className={`w-14 h-14 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shrink-0`}>
              <stat.icon className="w-7 h-7" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">{stat.label}</div>
              <div className="text-2xl font-display font-bold text-slate-900">{stat.value}</div>
            </div>
          </button>
        ))}
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-800">Alertas de prazo</h3>
              <p className="text-xs text-slate-400">Clientes com prazo vencendo ou vencido.</p>
            </div>
          </div>
          <div className="space-y-3">
            {deadlineAlerts.map(({event, daysLeft, level}) => (
              <button
                key={`${event.id}-dashboard-alert`}
                type="button"
                onClick={() => setSelectedDeadlineEvent(event)}
                className="w-full rounded-2xl bg-slate-50 p-3 text-left hover:bg-slate-100 transition-all"
              >
                <div className="font-bold text-sm text-slate-900">{event.clientName || 'Evento'}</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{event.type}</div>
                <div className={cn('mt-1 text-xs font-bold', level === 'maximo' ? 'text-red-600' : 'text-amber-700')}>
                  {level === 'maximo' ? 'ALERTA MÁXIMO' : 'ALERTA DE PRAZO'}: {daysLeft === 0 ? 'hoje' : `faltam ${daysLeft} dia(s)`}
                </div>
              </button>
            ))}
            {deadlineAlerts.length === 0 && (
              <button
                type="button"
                onClick={() => navigate('/calendar')}
                className="w-full rounded-2xl bg-green-50 p-4 text-left text-sm font-semibold text-green-700 hover:bg-green-100 transition-all"
              >
                Nenhum prazo crítico no momento.
              </button>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-800">Contagem regressiva</h3>
              <p className="text-xs text-slate-400">Próximas medições e entregas do calendário.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingSchedule.map((event) => (
              <button
                key={`${event.id}-${event.date.toISOString()}`}
                type="button"
                onClick={() => navigate('/calendar')}
                className="rounded-2xl bg-slate-50 p-3 text-left hover:bg-slate-100 transition-all"
              >
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{event.type}</div>
                <div className="mt-1 font-bold text-sm text-slate-900">{event.clientName || 'Evento'}</div>
                <div className="mt-1 text-xs font-bold text-brand-primary">
                  {event.daysLeft === 0 ?'É hoje' : `daqui a ${event.daysLeft} dia${event.daysLeft > 1 ?'s' : ''}`}
                </div>
              </button>
            ))}
            {upcomingSchedule.length === 0 && (
              <button
                type="button"
                onClick={() => navigate('/calendar')}
                className="md:col-span-2 rounded-2xl bg-slate-50 p-4 text-left text-sm font-semibold text-slate-400 hover:bg-slate-100 transition-all"
              >
                Nenhuma medição ou entrega futura cadastrada.
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-800 flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-amber-600" />
              Quadro de avisos da equipe
            </h2>
            <p className="text-sm text-slate-400">Anotações compartilhadas ou direcionadas para usuários no dashboard.</p>
          </div>
          <div className="w-full lg:max-w-xl space-y-2">
            <select
              value={noteTargetUid}
              onChange={(event) => setNoteTargetUid(event.target.value)}
              className="w-full rounded-2xl border border-amber-100 bg-amber-50/40 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200"
            >
              <option value="">Aviso para toda a equipe</option>
              {users.filter((item) => !item.blocked).map((item) => (
                <option key={item.uid} value={item.uid}>{item.name || item.email}</option>
              ))}
            </select>
            <textarea
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              placeholder="Escreva um aviso para a equipe..."
              maxLength={280}
              className="w-full min-h-[84px] rounded-2xl border border-amber-100 bg-amber-50/40 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-400">{newNote.length}/280</span>
              <button
                type="button"
                onClick={addDashboardNote}
                disabled={!newNote.trim() || savingNote}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                {savingNote ?'Salvando...' : 'Publicar aviso'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleNotes.map((note, index) => {
            const createdAt = toDate(note.createdAt);
            const canDelete = isAdmin || note.userUid === appUid;
            const palette = [
              'bg-amber-50 border-amber-100',
              'bg-blue-50 border-blue-100',
              'bg-emerald-50 border-emerald-100',
              'bg-rose-50 border-rose-100',
            ];
            return (
              <article key={note.id} className={cn('rounded-2xl border p-4 shadow-sm', palette[index % palette.length])}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{note.userName || 'Usuário'}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {note.targetName ?`Para: ${note.targetName}` : 'Para: toda a equipe'}
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => deleteDashboardNote(note)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-red-600"
                      title="Excluir aviso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap break-words">{note.text}</p>
                <div className="mt-3 text-[11px] font-semibold text-slate-400">
                  {createdAt ?createdAt.toLocaleDateString('pt-BR') : 'Agora'}
                </div>
              </article>
            );
          })}
          {visibleNotes.length === 0 && (
            <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">
              Nenhum aviso publicado ainda.
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-800">Controle de clientes</h2>
            <p className="text-sm text-slate-400">Resumo interno de qualidade, produção e entrega.</p>
          </div>
          <button type="button" onClick={() => navigate('/clients')} className="text-xs font-bold uppercase tracking-widest text-brand-primary hover:underline">
            Abrir clientes
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {(['pre', 'approved', 'production', 'ready', 'done'] as ClientStage[]).map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => navigate('/clients')}
              className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-left hover:bg-white hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                <span className={cn('h-2.5 w-2.5 rounded-full', statusGroups[stage].dot)} />
                {statusGroups[stage].label}
              </div>
              <div className="mt-3 text-2xl font-display font-bold text-slate-900">{stageCounts[stage]}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h2 className="font-display font-bold text-lg text-slate-800">Orçamentos Recentes</h2>
            <button
              type="button"
              onClick={() => navigate('/quotes')}
              className="p-2 text-slate-300 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all"
              title="Abrir orçamentos"
            >
              <TrendingUp className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <th className="px-6 py-4">Cliente / Projeto</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentQuotes.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => navigate(`/quotes/edit/${quote.id}`)}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                    title="Abrir orçamento"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{quote.clientName}</div>
                      <div className="text-xs text-slate-400">{quote.environment}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', getStatusColor(quote.status))}>
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                      {canViewSalesValues ? formatCurrency(quote.totalPrice || 0) : hiddenSalesValueLabel}
                    </td>
                  </tr>
                ))}

                {!loading && recentQuotes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-10 text-center text-slate-400">
                      Nenhum orçamento cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className={cn(
              'w-full p-6 rounded-[32px] border shadow-sm text-left transition-all',
              pendingPurchases.length > 0 ?'bg-amber-50 border-amber-100 hover:bg-amber-100/70' : 'bg-white border-slate-100 hover:shadow-xl hover:shadow-slate-200/40',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-800">Compra pendente para orçamento aprovado</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {pendingPurchases.length > 0
                    ?`${pendingPurchases.length} material(is) com falta de área: ${totalPendingPurchaseArea.toFixed(2)} m²`
                    : 'Nenhuma compra pendente no momento.'}
                </p>
              </div>
              {pendingPurchases.length > 0 && <AlertCircle className="w-6 h-6 text-amber-600" />}
            </div>
          </button>

          <div className="hidden">
            <div className="mb-5 flex items-center gap-3">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-slate-800">Alertas de prazo</h3>
                <p className="text-xs text-slate-400">Clientes com prazo vencendo ou vencido.</p>
              </div>
            </div>
            <div className="space-y-3">
              {deadlineAlerts.map(({event, daysLeft, level}) => (
                <button
                  key={`${event.id}-dashboard-hidden`}
                  type="button"
                  onClick={() => setSelectedDeadlineEvent(event)}
                  className="w-full rounded-2xl bg-slate-50 p-3 text-left hover:bg-slate-100 transition-all"
                >
                  <div className="font-bold text-sm text-slate-900">{event.clientName || 'Evento'}</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{event.type}</div>
                  <div className={cn('mt-1 text-xs font-bold', level === 'maximo' ? 'text-red-600' : 'text-amber-700')}>
                    {level === 'maximo' ? 'ALERTA MÁXIMO' : 'ALERTA DE PRAZO'}: {daysLeft === 0 ? 'hoje' : `faltam ${daysLeft} dia(s)`}
                  </div>
                </button>
              ))}
              {deadlineAlerts.length === 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/calendar')}
                  className="w-full rounded-2xl bg-green-50 p-4 text-left text-sm font-semibold text-green-700 hover:bg-green-100 transition-all"
                >
                  Nenhum prazo crítico no momento.
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/quotes?scope=open')}
            className="w-full bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-4 hover:shadow-xl hover:shadow-slate-200/40 transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            <div className="w-16 h-16 bg-brand-primary/10 rounded-3xl flex items-center justify-center text-brand-primary">
              <Clock className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-800">Em Aberto</h3>
              <p className="text-slate-400 text-sm">
                Você possui {openQuotes.length} orçamentos aguardando aprovado.
              </p>
            </div>
          </button>

          <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-xl shadow-slate-900/20">
            <div className="flex items-center gap-2 mb-6 opacity-60">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Resumo de Vendas</span>
            </div>
            <div className="text-4xl font-display font-bold mb-1">
              {canViewSalesValues ? formatCurrency(totalValue) : hiddenSalesValueLabel}
            </div>
            <div className="text-xs opacity-50 mb-6">Total em orçamentos fechados</div>
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="w-full bg-white/10 hover:bg-white/20 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all"
            >
              Ver Relatório Detalhado
            </button>
          </div>
        </div>
      </div>

      {selectedDeadlineEvent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-100 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{selectedDeadlineEvent.type}</div>
                <h3 className="mt-1 text-xl font-display font-bold text-slate-900">{selectedDeadlineEvent.clientName || 'Evento'}</h3>
                <div className="mt-1 text-sm font-semibold text-slate-500">{selectedDeadlineEvent.date.toLocaleDateString('pt-BR')}</div>
              </div>
              <button type="button" onClick={() => setSelectedDeadlineEvent(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">?</button>
            </div>

            {selectedDeadlineClient ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Telefone</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{selectedDeadlineClient.phone || 'Não informado'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Endereço</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{selectedDeadlineClient.address || 'Não informado'}</div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">Sem cliente vinculado.</div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-2">
              {selectedDeadlineEvent.quoteId && (
                <button
                  type="button"
                  onClick={() => navigate(`/quotes/edit/${selectedDeadlineEvent.quoteId}`)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Abrir orçamento
                </button>
              )}
              {selectedDeadlineEvent.sourceId && (
                <button
                  type="button"
                  onClick={handleDeleteManualEvent}
                  disabled={deletingEventId === selectedDeadlineEvent.sourceId}
                  className="w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-70"
                >
                  {deletingEventId === selectedDeadlineEvent.sourceId ? 'Excluindo...' : 'Excluir evento'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};





