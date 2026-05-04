import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Quote, Client, Material, InventoryItem } from '../types';
import { FileText, Users, Package, Database, TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Dashboard: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([]);
  const [clientsCount, setClientsCount] = useState(0);
  const [materialsCount, setMaterialsCount] = useState(0);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Quotes (all for total, but limited for list)
    const qQuotesAll = query(collection(db, 'quotes'));
    const unsubQuotesAll = onSnapshot(qQuotesAll, (snap) => {
      const allQuotes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote));
      setQuotes(allQuotes);
    });

    const qQuotesRecent = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'), limit(5));
    const unsubQuotesRecent = onSnapshot(qQuotesRecent, (snap) => {
      setRecentQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote)));
    });

    // Stats
    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => setClientsCount(snap.size));
    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snap) => setMaterialsCount(snap.size));
    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snap) => {
      setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
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
    { label: 'Orçamentos', value: quotes.length, icon: FileText, color: 'text-brand-primary', bg: 'bg-brand-primary/10' },
    { label: 'Clientes', value: clientsCount, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Materiais', value: materialsCount, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Itens em Estoque', value: inventory.length, icon: Database, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const totalValue = quotes.reduce((acc, q) => acc + q.totalPrice, 0);

  return (
    <div className="space-y-8 pb-20">
      <header>
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Painel de Controle</h1>
        <p className="text-slate-500 mt-1">Veja um resumo das atividades da D’Coratto.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 group hover:shadow-xl hover:shadow-slate-200/40 transition-all duration-300">
            <div className={`w-14 h-14 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shrink-0`}>
              <stat.icon className="w-7 h-7" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">{stat.label}</div>
              <div className="text-2xl font-display font-bold text-slate-900">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Latest Quotes */}
        <div className="lg:col-span-2 bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h2 className="font-display font-bold text-lg text-slate-800">Orçamentos Recentes</h2>
            <TrendingUp className="w-5 h-5 text-slate-300" />
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
                {recentQuotes.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{q.clientName}</div>
                      <div className="text-xs text-slate-400">{q.environment}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                        q.status === 'Aprovado' ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
                      )}>
                        {q.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(q.totalPrice)}
                    </td>
                  </tr>
                ))}
                {quotes.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-10 text-center text-slate-400">Nenhum orçamento cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity/Alerts */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-brand-primary/10 rounded-3xl flex items-center justify-center text-brand-primary">
              <Clock className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-800">Em Aberto</h3>
              <p className="text-slate-400 text-sm">Você possui {quotes.filter(q => q.status === 'Pré-orçamento').length} orçamentos aguardando aprovação.</p>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-xl shadow-slate-900/20">
            <div className="flex items-center gap-2 mb-6 opacity-60">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Resumo de Vendas</span>
            </div>
            <div className="text-4xl font-display font-bold mb-1">
              {formatCurrency(totalValue)}
            </div>
            <div className="text-xs opacity-50 mb-6">Total em orçamentos gerados esta semana</div>
            <button className="w-full bg-white/10 hover:bg-white/20 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all">
              Ver Relatório Detalhado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
