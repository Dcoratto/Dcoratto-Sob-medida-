import React, {useEffect, useMemo, useState} from 'react';
import {collection, onSnapshot, orderBy, query} from 'firebase/firestore';
import {useNavigate} from 'react-router-dom';
import {ClipboardCheck, Search} from 'lucide-react';
import {db} from '../lib/firebase';
import {Quote} from '../types';
import {cn, formatCurrency} from '../lib/utils';
import {normalizeQuoteStatus, quoteStatusColor} from '../lib/quoteStatus';

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isProjectStatus = (status: string) => {
  return ['Orçamento Aprovado', 'Medição', 'Projeto', 'Projeto Aprovado', 'Corte', 'Acabamento', 'Montagem', 'Produção Finalizada', 'Conferência Final', 'Entrega', 'Finalizado'].includes(normalizeQuoteStatus(status));
};

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'quotes'), orderBy('createdAt', 'desc')), (snapshot) => {
      setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const projects = useMemo(
    () => quotes.filter((quote) => isProjectStatus(quote.status)).filter((quote) => normalize(`${quote.clientName} ${quote.environment} ${quote.status}`).includes(normalize(search))),
    [quotes, search],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Projetos</h1>
        <p className="text-slate-500 mt-1">Todo orçamento aprovado entra automaticamente aqui.</p>
      </header>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="p-4 border-b border-slate-50">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar projeto por cliente, ambiente ou status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente / Projeto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Área</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Valor</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ?(
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Carregando projetos...</td></tr>
              ) : projects.length === 0 ?(
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Nenhum projeto encontrado.</td></tr>
              ) : (
                projects.map((quote) => (
                  <tr key={quote.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{quote.clientName}</div>
                      <div className="text-xs text-brand-primary font-medium">{quote.environment || 'Sem ambiente'}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">{(quote.totalArea || 0).toFixed(4)} m²</td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">{formatCurrency(quote.totalPrice || 0)}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase',
                        quoteStatusColor(quote.status),
                      )}>
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => navigate('/clients')}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-widest text-white"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        Acompanhar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
