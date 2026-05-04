import React, {useEffect, useState} from 'react';
import {collection, limit, onSnapshot, orderBy, query} from 'firebase/firestore';
import {useNavigate} from 'react-router-dom';
import {AlertCircle, CheckCircle2, Clock, Database, FileText, Package, TrendingUp, Users} from 'lucide-react';
import {db} from '../lib/firebase';
import {Client, InventoryItem, Material, Quote} from '../types';
import {cn, formatCurrency} from '../lib/utils';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([]);
  const [clientsCount, setClientsCount] = useState(0);
  const [materialsCount, setMaterialsCount] = useState(0);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qQuotesAll = query(collection(db, 'quotes'));
    const unsubQuotesAll = onSnapshot(qQuotesAll, (snap) => {
      setQuotes(snap.docs.map((doc) => ({id: doc.id, ...doc.data()} as Quote)));
    });

    const qQuotesRecent = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'), limit(5));
    const unsubQuotesRecent = onSnapshot(qQuotesRecent, (snap) => {
      setRecentQuotes(snap.docs.map((doc) => ({id: doc.id, ...doc.data()} as Quote)));
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      const clients = snap.docs.map((doc) => ({id: doc.id, ...doc.data()} as Client));
      setClientsCount(clients.length);
    });

    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snap) => {
      const materials = snap.docs.map((doc) => ({id: doc.id, ...doc.data()} as Material));
      setMaterialsCount(materials.length);
    });

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snap) => {
      setInventory(snap.docs.map((doc) => ({id: doc.id, ...doc.data()} as InventoryItem)));
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

  const stats = [
    {label: 'Orçamentos', value: quotes.length, icon: FileText, color: 'text-brand-primary', bg: 'bg-brand-primary/10', path: '/quotes'},
    {label: 'Clientes', value: clientsCount, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', path: '/clients'},
    {label: 'Materiais', value: materialsCount, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50', path: '/materials'},
    {label: 'Itens em Estoque', value: inventory.length, icon: Database, color: 'text-amber-600', bg: 'bg-amber-50', path: '/inventory'},
  ];

  const openQuotes = quotes.filter((quote) => quote.status === 'Pré-orçamento');
  const totalValue = quotes.reduce((acc, quote) => acc + (quote.totalPrice || 0), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Aprovado':
        return 'bg-green-50 text-green-600';
      case 'Recusado':
        return 'bg-red-50 text-red-600';
      case 'Em produção':
        return 'bg-blue-50 text-blue-600';
      case 'Aguardando medição':
        return 'bg-amber-50 text-amber-600';
      default:
        return 'bg-slate-100 text-slate-500';
    }
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
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                        getStatusColor(quote.status),
                      )}>
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
            <div className="text-xs opacity-50 mb-6">Total em orçamentos gerados esta semana</div>
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
