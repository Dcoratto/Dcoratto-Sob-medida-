import React, {useEffect, useMemo, useState} from 'react';
import {collection, limit, onSnapshot, orderBy, query} from '../lib/firestore';
import {AlertCircle, BarChart3, Boxes, FileDown, Gauge, TrendingUp, Users} from 'lucide-react';
import {Client, Employee, InventoryItem, InventoryPurchase, InventoryReservation, LegacyPaymentInstallment, Material, ProductionStep, Quote, SystemEvent} from '../types';
import {db} from '../lib/firestore';
import {cn, formatCurrency} from '../lib/utils';
import {QUOTE_STATUSES, getClientDisplayStatus, isQuoteApprovedOrBeyond, normalizeQuoteStatus} from '../lib/quoteStatus';
import {useAuth} from '../contexts/AuthContext';

type Period = 'all' | 'today' | 'week' | 'month' | 'year';

interface ManualCalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: any;
  dateKey?: string;
  eventTime?: string;
  clientId?: string;
  clientName?: string;
  city?: string;
  createdByName?: string;
}

const productionStepLabels: Record<ProductionStep, string> = {
  medicao: 'Medição',
  corte: 'Corte',
  acabamento: 'Acabamento',
  instalacao: 'Instalação',
  entrega: 'Entrega',
};

const normalize = (value: unknown) =>
  String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

const periodStart = (period: Period) => {
  const now = new Date();
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return start;
  }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
};

const periodLabel = (period: Period) => {
  if (period === 'today') return 'Hoje';
  if (period === 'week') return 'últimos 7 dias';
  if (period === 'month') return 'Mês atual';
  if (period === 'year') return 'Ano atual';
  return 'Todo o período';
};

const statusLabel = (status: string) => normalizeQuoteStatus(status);
const isClosedSale = (status: string) => isQuoteApprovedOrBeyond(status);

const summarizeLegacyPayments = (payments: LegacyPaymentInstallment[] = [], totalPrice = 0) => {
  const paid = payments
    .filter((payment) => payment.status === 'Pago')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pendingRegistered = payments
    .filter((payment) => payment.status !== 'Pago')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pending = payments.length > 0 ? pendingRegistered : Math.max(0, totalPrice - paid);
  return {paid, pending};
};

export const ReportsPage: React.FC = () => {
  const {hasPermission} = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<ManualCalendarEvent[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snapshot) => setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote))));
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => setClients(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Client))));
    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material))));
    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => setInventory(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryItem))));
    const unsubPurchases = onSnapshot(collection(db, 'inventoryPurchases'), (snapshot) => setPurchases(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryPurchase))));
    const unsubReservations = onSnapshot(collection(db, 'inventoryReservations'), (snapshot) => setReservations(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryReservation))));
    const unsubCalendarEvents = onSnapshot(collection(db, 'calendarEvents'), (snapshot) => setCalendarEvents(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as ManualCalendarEvent))));
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => setEmployees(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Employee))));
    const unsubSystemEvents = onSnapshot(query(collection(db, 'systemEvents'), orderBy('createdAt', 'desc'), limit(60)), (snapshot) => {
      setSystemEvents(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as SystemEvent)));
    });
    return () => {
      unsubQuotes();
      unsubClients();
      unsubMaterials();
      unsubInventory();
      unsubPurchases();
      unsubReservations();
      unsubCalendarEvents();
      unsubEmployees();
      unsubSystemEvents();
    };
  }, []);

  const filteredQuotes = useMemo(() => {
    const start = periodStart(period);
    if (!start) return quotes;
    return quotes.filter((quote) => {
      const createdAt = toDate(quote.createdAt);
      return createdAt ?createdAt >= start : true;
    });
  }, [period, quotes]);

  const latestQuoteByClient = useMemo(() => {
    const map = new Map<string, Quote>();
    filteredQuotes.forEach((quote) => {
      const current = map.get(quote.clientId);
      const currentTime = toDate(current?.createdAt)?.getTime() || 0;
      const nextTime = toDate(quote.createdAt)?.getTime() || 0;
      if (!current || nextTime >= currentTime) map.set(quote.clientId, quote);
    });
    return map;
  }, [filteredQuotes]);

  const manualOnlyClients = useMemo(() => {
    return clients.filter((client) => {
      if (latestQuoteByClient.has(client.id)) return false;
      return getClientDisplayStatus(client) !== 'Sem projeto';
    });
  }, [clients, latestQuoteByClient]);

  const filteredLegacySales = useMemo(() => {
    const start = periodStart(period);
    return clients
      .filter((client) => client.legacyProjectMode === 'orcamento_existente' && (client.legacyManualQuote?.totalPrice || 0) > 0)
      .filter((client) => {
        const updatedAt = toDate(client.legacyManualQuote?.updatedAt);
        if (!start) return true;
        return updatedAt ? updatedAt >= start : true;
      })
      .map((client) => ({
        client,
        totalPrice: client.legacyManualQuote?.totalPrice || 0,
        pieces: client.legacyManualQuote?.pieces || [],
        payments: client.legacyManualQuote?.payments || [],
        status: getClientDisplayStatus(client),
      }));
  }, [clients, period]);

  const filteredSystemEvents = useMemo(() => {
    const start = periodStart(period);
    if (!start) return systemEvents;
    return systemEvents.filter((event) => {
      const createdAt = toDate(event.createdAt);
      return createdAt ?createdAt >= start : true;
    });
  }, [period, systemEvents]);

  const filteredCalendarEvents = useMemo(() => {
    const start = periodStart(period);
    if (!start) return calendarEvents;
    return calendarEvents.filter((event) => {
      const eventDate = toDate(event.date);
      return eventDate ?eventDate >= start : true;
    });
  }, [calendarEvents, period]);

  const filteredPurchases = useMemo(() => {
    const start = periodStart(period);
    if (!start) return purchases;
    return purchases.filter((purchase) => {
      const purchasedAt = toDate(purchase.purchasedAt);
      const receivedAt = toDate(purchase.receivedAt);
      return (purchasedAt ?purchasedAt >= start : false) || (receivedAt ?receivedAt >= start : false);
    });
  }, [period, purchases]);

  const legacyReceived = filteredLegacySales.reduce((sum, sale) => sum + summarizeLegacyPayments(sale.payments, sale.totalPrice).paid, 0);
  const legacyPending = filteredLegacySales.reduce((sum, sale) => sum + summarizeLegacyPayments(sale.payments, sale.totalPrice).pending, 0);
  const overdueLegacyPayments = filteredLegacySales
    .flatMap((sale) => sale.payments.map((payment) => ({client: sale.client.name, payment})))
    .filter(({payment}) => payment.status !== 'Pago' && payment.dueDate)
    .filter(({payment}) => {
      const dueDate = payment.dueDate ? new Date(`${payment.dueDate}T12:00:00`) : null;
      return dueDate ? dueDate.getTime() < Date.now() : false;
    });
  const overdueLegacyAmount = overdueLegacyPayments.reduce((sum, entry) => sum + Number(entry.payment.amount || 0), 0);

  const totalSold = filteredQuotes
    .filter((quote) => isClosedSale(quote.status))
    .reduce((sum, quote) => sum + (quote.totalPrice || 0), 0) + filteredLegacySales.reduce((sum, sale) => sum + sale.totalPrice, 0);
  const totalReceived = legacyReceived;
  const pendingReceivable = legacyPending;
  const openValue = filteredQuotes
    .filter((quote) => ['Orçamento', 'Orçamento Aprovado', 'Medição', 'Projeto'].includes(statusLabel(quote.status)))
    .reduce((sum, quote) => sum + (quote.totalPrice || 0), 0);
  const projectedReceivable = openValue + pendingReceivable;
  const refusedValue = filteredQuotes
    .filter((quote) => ['recusado', 'cancelado'].includes(normalize(quote.status)))
    .reduce((sum, quote) => sum + (quote.totalPrice || 0), 0);
  const approvedCount = filteredQuotes.filter((quote) => isClosedSale(quote.status)).length + filteredLegacySales.length;
  const conversionRate = (filteredQuotes.length + filteredLegacySales.length) ?Math.round((approvedCount / (filteredQuotes.length + filteredLegacySales.length)) * 100) : 0;
  const inventoryArea = inventory.reduce((sum, item) => sum + (item.area || 0), 0);
  const inventoryCost = inventory.reduce((sum, item) => sum + (item.cost || 0), 0);
  const reservedArea = reservations
    .filter((item) => !['recusado', 'cancelado', 'finalizado'].includes(normalize(item.quoteStatus)))
    .reduce((sum, item) => sum + (item.area || 0), 0);
  const soldArea = reservations
    .filter((item) => normalize(item.quoteStatus) === 'finalizado')
    .reduce((sum, item) => sum + (item.area || 0), 0);
  const lossItems = inventory.filter((item) => normalize(item.status) === 'descarte' || item.lossReason);
  const lossArea = lossItems.reduce((sum, item) => sum + (item.area || 0), 0);
  const purchasePendingArea = purchases.filter((purchase) => purchase.status === 'Pedido').reduce((sum, item) => sum + (item.area || 0), 0);
  const quoteDetails = filteredQuotes.map((quote) => ({
    quote,
    pieces: quote.pieces?.length || 0,
    cutoutsTotal: Object.values(quote.cutouts || {}).reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : value ? 1 : 0), 0),
    fixtures: (quote.pieces || []).reduce((sum, piece) => sum + Object.values(piece.selectedFixtureIds || {}).filter(Boolean).length, 0),
  }));
  const legacyQuoteDetails = filteredLegacySales.map(({client, totalPrice, pieces, status}) => ({
    id: `legacy-${client.id}`,
    clientName: client.name,
    environment: 'Orçamento existente',
    status,
    totalPrice,
    piecesCount: pieces.length,
    itemsCount: pieces.reduce((sum, piece) => sum + (piece.items?.length || 0), 0),
  }));

  const statusCounts = QUOTE_STATUSES
    .map((status) => ({
      status,
      count:
        filteredQuotes.filter((quote) => statusLabel(quote.status) === status).length +
        manualOnlyClients.filter((client) => getClientDisplayStatus(client) === status).length,
    }));
  const maxStatusCount = Math.max(1, ...statusCounts.map((item) => item.count));

  const materialSales = materials.map((material) => {
    const materialQuotes = filteredQuotes.filter((quote) => quote.materialId === material.id && isClosedSale(quote.status));
    return {
      name: material.name,
      count: materialQuotes.length,
      value: materialQuotes.reduce((sum, quote) => sum + (quote.totalPrice || 0), 0),
    };
  }).sort((a, b) => b.value - a.value).slice(0, 5);

  const deadlineAlerts = filteredQuotes
    .filter((quote) => !['Finalizado'].includes(statusLabel(quote.status)))
    .map((quote) => {
      const createdAt = toDate(quote.createdAt);
      const deadline = toDate(quote.validityDate) || (createdAt ?new Date(createdAt.getTime() + (quote.deliveryDays || 0) * 86400000) : null);
      if (!deadline) return null;
      const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
      if (daysLeft > 5) return null;
      return {quote, daysLeft};
    })
    .filter(Boolean) as Array<{quote: Quote; daysLeft: number}>;

  const employeeStats = employees.map((employee) => {
    const evaluations = filteredQuotes.flatMap((quote) => quote.employeeEvaluations || []).filter((item) => item.employeeId === employee.id);
    const assignments = filteredQuotes.flatMap((quote) => quote.employeeAssignments || []).filter((item) => item.employeeId === employee.id);
    const average = evaluations.length ?evaluations.reduce((sum, item) => sum + item.rating, 0) / evaluations.length : 0;
    return {employee, evaluations, assignments, average};
  }).sort((a, b) => b.average - a.average || b.assignments.length - a.assignments.length);

  const evaluationHistory = filteredQuotes
    .flatMap((quote) => (quote.employeeEvaluations || []).map((item) => ({quote, item})))
    .sort((a, b) => (toDate(b.item.createdAt)?.getTime() || 0) - (toDate(a.item.createdAt)?.getTime() || 0))
    .slice(0, 20);

  const productionHistory = filteredQuotes
    .flatMap((quote) => (quote.statusHistory || []).map((item) => ({quote, item})))
    .sort((a, b) => (toDate(b.item.changedAt)?.getTime() || 0) - (toDate(a.item.changedAt)?.getTime() || 0))
    .slice(0, 20);

  const exportReport = async () => {
    if (!hasPermission('relatorios', 'exportar')) {
      alert('Você não tem permissão para exportar relatórios. Fale com o administrador.');
      return;
    }
    try {
      setExporting(true);
      const {generateReportPDF} = await import('../lib/reportPdfGenerator');
      await generateReportPDF({
        periodLabel: periodLabel(period),
        quotes: filteredQuotes,
        materials,
        inventory,
        purchases: filteredPurchases,
        reservations,
        calendarEvents: filteredCalendarEvents,
        systemEvents: filteredSystemEvents,
        totalSold,
        totalReceived,
        pendingReceivable,
        openValue,
        refusedValue,
        conversionRate,
        statusCounts,
        materialSales,
        deadlineAlerts,
        employeeStats,
        evaluationHistory,
        productionHistory,
        productionStepLabels,
      });
    } finally {
      setExporting(false);
    }
  };

  const canViewRevenue = hasPermission('relatorios', 'verFaturamento');
  const hiddenRevenueLabel = 'Valor oculto';

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Relatórios</h1>
          <p className="text-slate-500 mt-1">Visão geral da marmoraria, produção, prazos, materiais e equipe.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {(['today', 'week', 'month', 'year', 'all'] as Period[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={cn('rounded-xl px-4 py-2 text-xs font-bold uppercase transition-all', period === item ?'bg-brand-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}
            >
              {item === 'today' ?'Hoje' : item === 'week' ?'Semana' : item === 'month' ?'Mês' : item === 'year' ?'Ano' : 'Tudo'}
            </button>
          ))}
          {hasPermission('relatorios', 'exportar') && (
            <button
              type="button"
              onClick={exportReport}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase text-white disabled:cursor-wait disabled:opacity-70"
            >
              <FileDown className="w-4 h-4" />
              {exporting ?'Gerando...' : 'PDF'}
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <ReportCard icon={TrendingUp} label="Valor vendido" value={canViewRevenue ? formatCurrency(totalSold) : hiddenRevenueLabel} tone="brand" />
        <ReportCard icon={Gauge} label="Valor recebido" value={canViewRevenue ? formatCurrency(totalReceived) : hiddenRevenueLabel} tone="green" />
        <ReportCard icon={AlertCircle} label="A receber" value={canViewRevenue ? formatCurrency(pendingReceivable) : hiddenRevenueLabel} tone="amber" />
        <ReportCard icon={BarChart3} label="Conversão" value={`${conversionRate}%`} tone="blue" />
        <ReportCard icon={Users} label="Clientes" value={String(clients.length)} tone="blue" />
        <ReportCard icon={Boxes} label="Itens em estoque" value={String(inventory.length)} tone="amber" />
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MoneyCard label="Saldo projetado" value={canViewRevenue ? projectedReceivable : hiddenRevenueLabel} tone="brand" helper="Em aberto + legado pendente" />
        <MoneyCard label="Legado pendente" value={canViewRevenue ? legacyPending : hiddenRevenueLabel} tone="amber" helper="Parcelas abertas dos clientes antigos" />
        <MoneyCard label="Vencido" value={canViewRevenue ? overdueLegacyAmount : hiddenRevenueLabel} tone="red" helper={`${overdueLegacyPayments.length} parcela(s) vencida(s)`} />
        <MoneyCard label="Recebido legado" value={canViewRevenue ? legacyReceived : hiddenRevenueLabel} tone="green" helper="Pagamentos já marcados como pagos" />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Orçamentos detalhados</h2>
          <div className="space-y-3">
            {quoteDetails.slice(0, 20).map(({quote, pieces, cutoutsTotal, fixtures}) => (
              <div key={quote.id} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{quote.clientName}</div>
                    <div className="text-sm text-slate-500">{quote.environment || 'Sem ambiente'} · {quote.status}</div>
                    <div className="mt-1 text-xs text-slate-400">{pieces} peça(s) · {cutoutsTotal} recorte(s) · {fixtures} item(ns) cadastrados</div>
                  </div>
                  <div className="text-left md:text-right">
                    <div className="font-mono font-bold text-brand-primary">{canViewRevenue ? formatCurrency(quote.totalPrice || 0) : hiddenRevenueLabel}</div>
                    <div className="text-xs text-slate-400">{(quote.totalArea || 0).toFixed(4)} m²</div>
                  </div>
                </div>
              </div>
            ))}
            {legacyQuoteDetails.map((quote) => (
              <div key={quote.id} className="rounded-2xl bg-emerald-50/70 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{quote.clientName}</div>
                    <div className="text-sm text-slate-500">{quote.environment} · {quote.status}</div>
                    <div className="mt-1 text-xs text-slate-400">{quote.piecesCount} peça(s) · {quote.itemsCount} item(ns) cadastrados</div>
                  </div>
                  <div className="text-left md:text-right">
                    <div className="font-mono font-bold text-brand-primary">{canViewRevenue ? formatCurrency(quote.totalPrice || 0) : hiddenRevenueLabel}</div>
                    <div className="text-xs text-slate-400">Projeto legado</div>
                  </div>
                </div>
              </div>
            ))}
            {quoteDetails.length === 0 && legacyQuoteDetails.length === 0 && <EmptyText>Nenhum orçamento no período.</EmptyText>}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Resumo do estoque</h2>
          <div className="space-y-3">
            <MoneyLine label="Custo em estoque" value={canViewRevenue ? inventoryCost : hiddenRevenueLabel} className="text-slate-900" />
            <InfoLine label="?rea total" value={`${inventoryArea.toFixed(2)} m²`} />
            <InfoLine label="Reservado em orçamentos" value={`${reservedArea.toFixed(2)} m²`} />
            <InfoLine label="Vendido/finalizado" value={`${soldArea.toFixed(2)} m²`} />
            <InfoLine label="Compra pendente" value={`${purchasePendingArea.toFixed(2)} m²`} />
            <InfoLine label="Perdas/descarte" value={`${lossArea.toFixed(2)} m²`} danger />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Calendário operacional</h2>
          <div className="space-y-3">
            {filteredCalendarEvents.slice(0, 20).map((event) => {
              const date = toDate(event.date);
              return (
                <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="font-bold text-slate-900">{[event.title, event.clientName].filter(Boolean).join(' · ')}</div>
                  <div className="text-sm text-slate-500">{date ?date.toLocaleDateString('pt-BR') : '-'} {event.eventTime ?`às ${event.eventTime}` : ''}</div>
                  <div className="mt-1 text-xs text-slate-400">{[event.city, event.createdByName, event.description].filter(Boolean).join(' · ')}</div>
                </div>
              );
            })}
            {filteredCalendarEvents.length === 0 && <EmptyText>Nenhum evento manual no período.</EmptyText>}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Compras, reservas e perdas</h2>
          <div className="space-y-3">
            {filteredPurchases.slice(0, 10).map((purchase) => (
              <div key={purchase.id} className="rounded-2xl bg-slate-50 p-4">
                <div className="font-bold text-slate-900">{purchase.materialName}</div>
                <div className="text-sm text-slate-500">{purchase.status} · {purchase.code || 'Sem lote'} · {(purchase.area || 0).toFixed(2)} m²</div>
                <div className="mt-1 text-xs text-slate-400">Comprou: {purchase.purchasedByName || '-'} · Recebeu: {purchase.receivedByName || '-'}</div>
              </div>
            ))}
            {lossItems.slice(0, 8).map((item) => (
              <div key={`loss-${item.id}`} className="rounded-2xl bg-red-50 p-4">
                <div className="font-bold text-red-900">Perda: {item.materialName}</div>
                <div className="text-sm text-red-700">{item.lossReason || 'Descarte'} · {item.lossClientName || 'Sem cliente'} · {(item.area || 0).toFixed(2)} m²</div>
                <div className="mt-1 text-xs text-red-500">{item.lossNotes || item.notes || '-'}</div>
              </div>
            ))}
            {filteredPurchases.length === 0 && lossItems.length === 0 && <EmptyText>Nenhuma compra ou perda no período.</EmptyText>}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
        <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Parcelas vencidas de clientes antigos</h2>
        <div className="space-y-3">
          {overdueLegacyPayments.slice(0, 20).map(({client, payment}, index) => (
            <div key={`${client}-${payment.label}-${index}`} className="rounded-2xl bg-red-50 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-bold text-red-900">{client}</div>
                  <div className="text-sm text-red-700">{payment.label || 'Parcela'} · vencimento {payment.dueDate || '-'}</div>
                </div>
                <div className="font-mono font-bold text-red-800">
                  {canViewRevenue ? formatCurrency(Number(payment.amount || 0)) : hiddenRevenueLabel}
                </div>
              </div>
            </div>
          ))}
          {overdueLegacyPayments.length === 0 && <EmptyText>Nenhuma parcela vencida encontrada no período.</EmptyText>}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Funil de orçamento e produção</h2>
          <div className="space-y-3">
            {statusCounts.map((item) => (
              <div key={item.status} className="grid grid-cols-[160px_1fr_40px] items-center gap-3">
                <div className="text-xs font-bold text-slate-500">{item.status}</div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-primary" style={{width: `${(item.count / maxStatusCount) * 100}%`}} />
                </div>
                <div className="text-right text-sm font-bold text-slate-800">{item.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Financeiro</h2>
          <div className="space-y-3">
            <MoneyLine label="Vendidos" value={canViewRevenue ? totalSold : hiddenRevenueLabel} className="text-green-700" />
            <MoneyLine label="Recebidos" value={canViewRevenue ? totalReceived : hiddenRevenueLabel} className="text-emerald-700" />
            <MoneyLine label="A receber" value={canViewRevenue ? pendingReceivable : hiddenRevenueLabel} className="text-amber-700" />
            <MoneyLine label="Em aberto" value={canViewRevenue ? openValue : hiddenRevenueLabel} className="text-amber-700" />
            <MoneyLine label="Recusados" value={canViewRevenue ? refusedValue : hiddenRevenueLabel} className="text-red-600" />
            <MoneyLine label="Ticket m²dio" value={canViewRevenue ? ((filteredQuotes.length + filteredLegacySales.length) ?((filteredQuotes.reduce((sum, quote) => sum + (quote.totalPrice || 0), 0) + filteredLegacySales.reduce((sum, sale) => sum + sale.totalPrice, 0)) / (filteredQuotes.length + filteredLegacySales.length)) : 0) : hiddenRevenueLabel} className="text-slate-900" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Materiais mais vendidos</h2>
          <div className="space-y-3">
            {materialSales.map((item) => (
              <div key={item.name} className="rounded-2xl bg-slate-50 p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-slate-900">{item.name}</div>
                  <div className="text-xs text-slate-400">{item.count} orçamento(s)</div>
                </div>
                <div className="font-mono font-bold text-brand-primary">{canViewRevenue ? formatCurrency(item.value) : hiddenRevenueLabel}</div>
              </div>
            ))}
            {materialSales.length === 0 && <EmptyText>Nenhum material vendido no período.</EmptyText>}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
          <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Avisos de prazo</h2>
          <div className="space-y-3">
            {deadlineAlerts.map(({quote, daysLeft}) => (
              <div key={quote.id} className="rounded-2xl bg-slate-50 p-4 flex items-center gap-3">
                <AlertCircle className={cn('w-5 h-5', daysLeft < 0 ?'text-red-600' : 'text-amber-600')} />
                <div>
                  <div className="font-bold text-slate-900">{quote.clientName}</div>
                  <div className={cn('text-xs font-bold', daysLeft < 0 ?'text-red-600' : 'text-amber-600')}>
                    {daysLeft < 0 ?`${Math.abs(daysLeft)} dia(s) atrasado` : `vence em ${daysLeft} dia(s)`}
                  </div>
                </div>
              </div>
            ))}
            {deadlineAlerts.length === 0 && <EmptyText>Nenhum prazo crítico no período.</EmptyText>}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
        <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Histórico de produção</h2>
        <div className="space-y-3">
          {productionHistory.map(({quote, item}, index) => {
            const date = toDate(item.changedAt);
            return (
              <div key={`${quote.id}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{quote.clientName}</div>
                    <div className="text-sm text-slate-600">{item.note || item.status}</div>
                  </div>
                  <div className="text-left md:text-right">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {date ?date.toLocaleDateString('pt-BR') : 'Sem data'}
                    </div>
                    {item.changedByName && (
                      <div className="text-xs text-slate-400">Alterado por {item.changedByName}</div>
                    )}
                    <div className="text-xs text-slate-400">
                      {[item.responsibleEmployeeName, item.step ?productionStepLabels[item.step] : ''].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {productionHistory.length === 0 && <EmptyText>Nenhuma movimentação de produção no período.</EmptyText>}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
        <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Auditoria geral do sistema</h2>
        <div className="space-y-3">
          {filteredSystemEvents.slice(0, 25).map((event) => {
            const date = toDate(event.createdAt);
            return (
              <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{event.title}</div>
                    <div className="text-sm text-slate-600">{event.description || event.clientName || event.materialName || '-'}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {[event.clientName, event.materialName, event.employeeName, event.quoteStatus].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {date ?date.toLocaleDateString('pt-BR') : 'Sem data'}
                    </div>
                    <div className="text-xs text-slate-400">Usuário: {event.userName || 'Não informado'}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredSystemEvents.length === 0 && <EmptyText>Nenhuma movimentação registrada no período.</EmptyText>}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand-primary" />
          <h2 className="font-display text-xl font-bold text-slate-900">Desempenho da equipe</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employeeStats.map(({employee, average, assignments, evaluations}) => (
            <div key={employee.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">{employee.name}</div>
                  <div className="text-xs text-slate-400">{employee.role}</div>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-primary">
                  {average ?average.toFixed(1) : '-'} / 5
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white p-3">
                  <div className="font-bold text-slate-900">{assignments.length}</div>
                  <div className="text-slate-400">etapas</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="font-bold text-slate-900">{evaluations.length}</div>
                  <div className="text-slate-400">avaliações</div>
                </div>
              </div>
            </div>
          ))}
          {employeeStats.length === 0 && <EmptyText>Nenhum funcionário cadastrado.</EmptyText>}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
        <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Avaliações registradas</h2>
        <div className="space-y-3">
          {evaluationHistory.map(({quote, item}, index) => {
            const date = toDate(item.createdAt);
            return (
              <div key={`${quote.id}-${item.employeeId}-${item.step}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{item.employeeName} - {productionStepLabels[item.step]}</div>
                    <div className="text-sm text-slate-600">{quote.clientName} - {item.notes || 'Sem observacao'}</div>
                  </div>
                  <div className="text-left md:text-right">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {date ?date.toLocaleDateString('pt-BR') : 'Sem data'}
                    </div>
                    <div className="text-xs text-slate-400">
                      Nota {item.rating}/5 - Avaliado por {item.evaluatedByName || 'Não informado'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {evaluationHistory.length === 0 && <EmptyText>Nenhuma avaliação registrada no período.</EmptyText>}
        </div>
      </section>
    </div>
  );
};

const ReportCard = ({icon: Icon, label, value, tone}: {icon: any; label: string; value: string; tone: 'brand' | 'green' | 'blue' | 'amber'}) => {
  const tones = {
    brand: 'bg-brand-primary/10 text-brand-primary',
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-2xl', tones[tone])}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
};

const MoneyCard = ({
  label,
  value,
  tone,
  helper,
}: {
  label: string;
  value: number | string;
  tone: 'brand' | 'green' | 'amber' | 'red';
  helper: string;
}) => {
  const tones = {
    brand: 'border-brand-primary/10 bg-brand-primary/5 text-brand-primary',
    green: 'border-green-100 bg-green-50 text-green-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
  };

  return (
    <div className={cn('rounded-[28px] border p-5 shadow-sm', tones[tone])}>
      <div className="text-xs font-bold uppercase tracking-widest opacity-70">{label}</div>
      <div className="mt-2 font-display text-2xl font-bold">{typeof value === 'number' ? formatCurrency(value) : value}</div>
      <div className="mt-2 text-xs font-semibold opacity-75">{helper}</div>
    </div>
  );
};

const MoneyLine = ({label, value, className}: {label: string; value: number | string; className?: string}) => (
  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
    <span className="text-sm font-semibold text-slate-500">{label}</span>
    <span className={cn('font-mono font-bold', className)}>{typeof value === 'number' ? formatCurrency(value) : value}</span>
  </div>
);

const InfoLine = ({label, value, danger}: {label: string; value: string; danger?: boolean}) => (
  <div className={cn('flex items-center justify-between rounded-2xl px-4 py-3', danger ?'bg-red-50' : 'bg-slate-50')}>
    <span className={cn('text-sm font-semibold', danger ?'text-red-600' : 'text-slate-500')}>{label}</span>
    <span className={cn('font-mono font-bold', danger ?'text-red-700' : 'text-slate-900')}>{value}</span>
  </div>
);

const EmptyText = ({children}: {children: React.ReactNode}) => (
  <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-400">{children}</div>
);



