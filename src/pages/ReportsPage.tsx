import React, {useEffect, useMemo, useState} from 'react';
import {collection, limit, onSnapshot, orderBy, query} from 'firebase/firestore';
import {AlertCircle, BarChart3, Boxes, FileDown, Gauge, TrendingUp, Users} from 'lucide-react';
import {Client, Employee, InventoryItem, Material, ProductionStep, Quote, SystemEvent} from '../types';
import {db} from '../lib/firebase';
import {cn, formatCurrency} from '../lib/utils';
import {generateReportPDF} from '../lib/reportPdfGenerator';
import {QUOTE_STATUSES, normalizeQuoteStatus} from '../lib/quoteStatus';

type Period = 'all' | 'today' | 'week' | 'month' | 'year';

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

const isClosedSale = (status: string) =>
  ['Aprovado', 'Produ??o', 'Acabamento', 'Entrega', 'Finalizado'].includes(statusLabel(status));

export const ReportsPage: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [period, setPeriod] = useState<Period>('month');

  useEffect(() => {
    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snapshot) => setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote))));
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => setClients(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Client))));
    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material))));
    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => setInventory(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryItem))));
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => setEmployees(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Employee))));
    const unsubSystemEvents = onSnapshot(query(collection(db, 'systemEvents'), orderBy('createdAt', 'desc'), limit(60)), (snapshot) => {
      setSystemEvents(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as SystemEvent)));
    });
    return () => {
      unsubQuotes();
      unsubClients();
      unsubMaterials();
      unsubInventory();
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

  const filteredSystemEvents = useMemo(() => {
    const start = periodStart(period);
    if (!start) return systemEvents;
    return systemEvents.filter((event) => {
      const createdAt = toDate(event.createdAt);
      return createdAt ?createdAt >= start : true;
    });
  }, [period, systemEvents]);

  const totalSold = filteredQuotes
    .filter((quote) => isClosedSale(quote.status))
    .reduce((sum, quote) => sum + (quote.totalPrice || 0), 0);
  const openValue = filteredQuotes
    .filter((quote) => ['Orçamento', 'Medição', 'Projeto'].includes(statusLabel(quote.status)))
    .reduce((sum, quote) => sum + (quote.totalPrice || 0), 0);
  const refusedValue = filteredQuotes
    .filter((quote) => statusLabel(quote.status) === '__none__')
    .reduce((sum, quote) => sum + (quote.totalPrice || 0), 0);
  const approvedCount = filteredQuotes.filter((quote) => isClosedSale(quote.status)).length;
  const conversionRate = filteredQuotes.length ?Math.round((approvedCount / filteredQuotes.length) * 100) : 0;

  const statusCounts = QUOTE_STATUSES
    .map((status) => ({status, count: filteredQuotes.filter((quote) => statusLabel(quote.status) === status).length}));
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

  const exportReport = () => generateReportPDF({
    periodLabel: periodLabel(period),
    quotes: filteredQuotes,
    materials,
    inventory,
    totalSold,
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

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Relatérios</h1>
          <p className="text-slate-500 mt-1">Visão geral da marmoraria, produção, prazos, materiais e equipe.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <button type="button" onClick={exportReport} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase text-white">
            <FileDown className="w-4 h-4" />
            PDF
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ReportCard icon={TrendingUp} label="Valor vendido" value={formatCurrency(totalSold)} tone="brand" />
        <ReportCard icon={Gauge} label="Convers?o" value={`${conversionRate}%`} tone="green" />
        <ReportCard icon={Users} label="Clientes" value={String(clients.length)} tone="blue" />
        <ReportCard icon={Boxes} label="Itens em estoque" value={String(inventory.length)} tone="amber" />
      </div>

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
            <MoneyLine label="Vendidos" value={totalSold} className="text-green-700" />
            <MoneyLine label="Em aberto" value={openValue} className="text-amber-700" />
            <MoneyLine label="Recusados" value={refusedValue} className="text-red-600" />
            <MoneyLine label="Ticket m²dio" value={filteredQuotes.length ?filteredQuotes.reduce((sum, quote) => sum + (quote.totalPrice || 0), 0) / filteredQuotes.length : 0} className="text-slate-900" />
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
                <div className="font-mono font-bold text-brand-primary">{formatCurrency(item.value)}</div>
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
                    <div className="text-xs text-slate-400">Usu?rio: {event.userName || 'Não informado'}</div>
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
                  <div className="text-slate-400">avaliaçóes</div>
                </div>
              </div>
            </div>
          ))}
          {employeeStats.length === 0 && <EmptyText>Nenhum funcion?rio cadastrado.</EmptyText>}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6">
        <h2 className="font-display text-xl font-bold text-slate-900 mb-5">Avaliacoes registradas</h2>
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
                      Nota {item.rating}/5 - Avaliado por {item.evaluatedByName || 'Nao informado'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {evaluationHistory.length === 0 && <EmptyText>Nenhuma avaliacao registrada no periodo.</EmptyText>}
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

const MoneyLine = ({label, value, className}: {label: string; value: number; className?: string}) => (
  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
    <span className="text-sm font-semibold text-slate-500">{label}</span>
    <span className={cn('font-mono font-bold', className)}>{formatCurrency(value)}</span>
  </div>
);

const EmptyText = ({children}: {children: React.ReactNode}) => (
  <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-400">{children}</div>
);
