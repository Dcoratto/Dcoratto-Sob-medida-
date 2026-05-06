import React, {useEffect, useMemo, useState} from 'react';
import {collection, limit, onSnapshot, orderBy, query} from 'firebase/firestore';
import {useNavigate} from 'react-router-dom';
import {AlertCircle, CheckCircle2, Clock, Database, FileText, Package, TrendingUp, Users} from 'lucide-react';
import {db} from '../lib/firebase';
import {Client, InventoryItem, Material, Quote, QuoteStatus} from '../types';
import {cn, formatCurrency} from '../lib/utils';

type ClientStage = 'pre' | 'approved' | 'production' | 'ready' | 'done' | 'none';

const statusGroups: Record<ClientStage, {label: string; dot: string; bg: string; statuses: QuoteStatus[]}> = {
  pre: {label: 'Pré-orçamento', dot: 'bg-slate-400', bg: 'bg-slate-50 text-slate-600', statuses: ['Pré-orçamento', 'Aguardando medição', 'Medido', 'Enviado']},
  approved: {label: 'Projeto fechado', dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700', statuses: ['Aprovado']},
  production: {label: 'Em produção', dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700', statuses: ['Em produção']},
  ready: {label: 'Pronto para entrega', dot: 'bg-amber-500', bg: 'bg-amber-50 text-amber-700', statuses: ['Pronto para entrega']},
  done: {label: 'Concluído', dot: 'bg-violet-500', bg: 'bg-violet-50 text-violet-700', statuses: ['Entregue']},
  none: {label: 'Sem orçamento', dot: 'bg-slate-300', bg: 'bg-slate-50 text-slate-500', statuses: []},
};

const normalizeStatus = (status?: string) => {
  const text = (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (text.includes('producao')) return 'Em produção' as QuoteStatus;
  if (text.includes('aprovado')) return 'Aprovado' as QuoteStatus;
  if (text.includes('recusado')) return 'Recusado' as QuoteStatus;
  if (text.includes('entregue') || text.includes('concluido')) return 'Entregue' as QuoteStatus;
  if (text.includes('pronto')) return 'Pronto para entrega' as QuoteStatus;
  if (text.includes('medido')) return 'Medido' as QuoteStatus;
  if (text.includes('enviado')) return 'Enviado' as QuoteStatus;
  if (text.includes('medicao')) return 'Aguardando medição' as QuoteStatus;
  return 'Pré-orçamento' as QuoteStatus;
};

const isClosedSale = (status?: string) => {
  const text = (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (text.includes('pre') || text.includes('orcamento') || text.includes('aguardando') || text.includes('medido') || text.includes('enviado') || text.includes('recusado')) {
    return false;
  }
  return text.includes('aprovado') || text.includes('fechado') || text.includes('producao') || text.includes('pronto') || text.includes('entregue') || text.includes('concluido');
};

const quoteStage = (quote?: Quote): ClientStage => {
  if (!quote) return 'none';
  const status = normalizeStatus(quote.status);
  if (status === 'Entregue') return 'done';
  if (status === 'Pronto para entrega') return 'ready';
  if (status === 'Em produção') return 'production';
  if (status === 'Aprovado') return 'approved';
  return 'pre';
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [materialsCount, setMaterialsCount] = useState(0);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

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

    return () => {
      unsubQuotesAll();
      unsubQuotesRecent();
      unsubClients();
      unsubMaterials();
      unsubInventory();
    };
  }, []);

  const latestQuoteByClient = useMemo(() => {
    const sorted = [...quotes].sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    return sorted.reduce<Record<string, Quote>>((acc, quote) => {
      if (quote.clientId && !acc[quote.clientId]) acc[quote.clientId] = quote;
      return acc;
    }, {});
  }, [quotes]);

  const stageCounts = useMemo(() => {
    const base: Record<ClientStage, number> = {pre: 0, approved: 0, production: 0, ready: 0, done: 0, none: 0};
    clients.forEach((client) => {
      base[quoteStage(latestQuoteByClient[client.id])] += 1;
    });
    return base;
  }, [clients, latestQuoteByClient]);

  const deadlineAlerts = useMemo(() => {
    const now = new Date();
    return quotes
      .filter((quote) => !['Recusado', 'Entregue'].includes(normalizeStatus(quote.status)))
      .map((quote) => {
        const createdAt = toDate(quote.createdAt);
        const deadline = toDate(quote.validityDate) || (createdAt ? new Date(createdAt.getTime() + (quote.deliveryDays || 0) * 86400000) : null);
        if (!deadline) return null;
        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
        if (daysLeft > 3) return null;
        return {quote, deadline, daysLeft};
      })
      .filter(Boolean)
      .sort((a, b) => (a!.daysLeft - b!.daysLeft))
      .slice(0, 5) as Array<{quote: Quote; deadline: Date; daysLeft: number}>;
  }, [quotes]);

  const stats = [
    {label: 'Orçamentos', value: quotes.length, icon: FileText, color: 'text-brand-primary', bg: 'bg-brand-primary/10', path: '/quotes'},
    {label: 'Clientes', value: clients.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', path: '/clients'},
    {label: 'Materiais', value: materialsCount, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50', path: '/materials'},
    {label: 'Itens em Estoque', value: inventory.length, icon: Database, color: 'text-amber-600', bg: 'bg-amber-50', path: '/inventory'},
  ];

  const openQuotes = quotes.filter((quote) => statusGroups.pre.statuses.includes(normalizeStatus(quote.status)));
  const closedQuotes = quotes.filter((quote) => isClosedSale(quote.status));
  const totalValue = closedQuotes.reduce((acc, quote) => acc + (quote.totalPrice || 0), 0);

  const getStatusColor = (status: string) => {
    const normalized = normalizeStatus(status);
    if (normalized === 'Aprovado') return 'bg-green-50 text-green-600';
    if (normalized === 'Recusado') return 'bg-red-50 text-red-600';
    if (normalized === 'Em produção') return 'bg-blue-50 text-blue-600';
    if (normalized === 'Aguardando medição') return 'bg-amber-50 text-amber-600';
    if (normalized === 'Entregue') return 'bg-violet-50 text-violet-600';
    if (normalized === 'Pronto para entrega') return 'bg-amber-50 text-amber-700';
    return 'bg-slate-100 text-slate-500';
  };

  return (
    <div className="space-y-8 pb-20">
      <header>
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Painel de Controle</h1>
        <p className="text-slate-500 mt-1">Veja um resumo das atividades da D'Coratto.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                      {formatCurrency(quote.totalPrice || 0)}
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
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-slate-800">Avisos de prazo</h3>
                <p className="text-xs text-slate-400">Clientes com prazo vencendo ou vencido.</p>
              </div>
            </div>
            <div className="space-y-3">
              {deadlineAlerts.map(({quote, daysLeft}) => (
                <button
                  key={quote.id}
                  type="button"
                  onClick={() => navigate(`/quotes/edit/${quote.id}`)}
                  className="w-full rounded-2xl bg-slate-50 p-3 text-left hover:bg-slate-100 transition-all"
                >
                  <div className="font-bold text-sm text-slate-900">{quote.clientName}</div>
                  <div className={cn('mt-1 text-xs font-bold', daysLeft < 0 ? 'text-red-600' : 'text-amber-600')}>
                    {daysLeft < 0 ? `${Math.abs(daysLeft)} dia(s) vencido` : `vence em ${daysLeft} dia(s)`}
                  </div>
                </button>
              ))}
              {deadlineAlerts.length === 0 && (
                <div className="rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-700">
                  Nenhum prazo crítico no momento.
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/quotes')}
            className="w-full bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-4 hover:shadow-xl hover:shadow-slate-200/40 transition-all focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            <div className="w-16 h-16 bg-brand-primary/10 rounded-3xl flex items-center justify-center text-brand-primary">
              <Clock className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-800">Em Aberto</h3>
              <p className="text-slate-400 text-sm">
                Você possui {openQuotes.length} orçamentos aguardando aprovação.
              </p>
            </div>
          </button>

          <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-xl shadow-slate-900/20">
            <div className="flex items-center gap-2 mb-6 opacity-60">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Resumo de Vendas</span>
            </div>
            <div className="text-4xl font-display font-bold mb-1">
              {formatCurrency(totalValue)}
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
    </div>
  );
};
