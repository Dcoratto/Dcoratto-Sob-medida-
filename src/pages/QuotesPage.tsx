import React, {useEffect, useState} from 'react';
import {addDoc, arrayUnion, collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc} from '../lib/firestore';
import {useLocation, useNavigate} from 'react-router-dom';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {Copy, Edit2, FileText, Plus, Search, Trash2} from 'lucide-react';
import {db} from '../lib/firestore';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {Quote, QuoteStatus} from '../types';
import {cn, formatCurrency} from '../lib/utils';
import {applyQuoteInventoryByStatusTransition, isApprovedOrBeyond, releaseQuoteReservation, syncQuoteReservation} from '../lib/inventoryReservations';
import {useAuth} from '../contexts/AuthContext';
import {logSystemEvent} from '../lib/systemEvents';
import {QUOTE_STATUSES, normalizeQuoteStatus, normalizeText, quoteStatusColor} from '../lib/quoteStatus';
import {LABELS} from '../constants/labels';

export const QuotesPage: React.FC = () => {
  const {user, profile, appUid, hasPermission} = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const scope = new URLSearchParams(location.search).get('scope') || 'all';
  const currentUserName = profile?.name || user?.user_metadata?.name || user?.email || 'Usuário';
  const openPremiumProposal = (quoteId: string) => {
    const proposalUrl = window.location.origin + '/quotes/proposal/' + quoteId;
    window.open(proposalUrl, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    const q = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const filteredQuotes = quotes.filter((quote) => {
    const normalizedStatus = normalizeText(normalizeQuoteStatus(quote.status));
    const isOpenScope = ['orcamento', 'orcamento aprovado', 'medicao', 'projeto', 'projeto aprovado', 'corte', 'acabamento', 'montagem', 'producao finalizada', 'conferencia final', 'entrega'].includes(normalizedStatus);
    const matchesScope = scope === 'open' ?isOpenScope : true;

    const searchable = [
      quote.clientName,
      quote.environment,
      quote.phone,
      quote.address,
      quote.status,
      quote.responsible,
    ].map(normalizeText).join(' ');

    return matchesScope && searchable.includes(normalizeText(search));
  });

  const handleStatusChange = async (quote: Quote, status: QuoteStatus) => {
    if (!hasPermission('orcamento', 'editar')) {
      alert('Você não tem permissão para alterar orçamentos. Fale com o administrador.');
      return;
    }
    if (isApprovedOrBeyond(status) && !hasPermission('orcamento', 'aprovar')) {
      alert('Você não tem permissão para aprovar orçamentos. Fale com o administrador.');
      return;
    }
    try {
      if (!isApprovedOrBeyond(quote.status) && isApprovedOrBeyond(status)) {
        await applyQuoteInventoryByStatusTransition(quote.id, quote.status, status, quote);
      }

      await updateDoc(doc(db, 'quotes', quote.id), {
        status,
        statusHistory: arrayUnion({
          status,
          changedAt: Timestamp.now(),
          changedByUid: appUid || '',
          changedByName: currentUserName,
          note: `Status alterado para ${status}`,
        }),
      });

      if (isApprovedOrBeyond(quote.status) || !isApprovedOrBeyond(status)) {
        await syncQuoteReservation(quote.id, {...quote, status});
      }

      await logSystemEvent({
        type: 'quote_status_changed',
        title: 'Status do orçamento alterado',
        description: `${quote.clientName}: ${quote.status} -> ${status}`,
        entityType: 'quote',
        entityId: quote.id,
        quoteId: quote.id,
        quoteStatus: status,
        clientId: quote.clientId,
        clientName: quote.clientName,
        materialId: quote.materialId,
        materialName: quote.materialName,
        userUid: appUid || '',
        userName: currentUserName,
      });
    } catch (error: any) {
      alert(error?.message || 'Não foi possível alterar o status do orçamento.');
    }
  };

  const handleDuplicate = async (quote: Quote) => {
    if (!hasPermission('orcamento', 'criar')) {
      alert('Você não tem permissão para criar orçamentos. Fale com o administrador.');
      return;
    }
    const {id, ...data} = quote;
    const duplicatedQuote = {
      ...data,
      createdAt: Timestamp.now(),
      status: 'Orçamento',
      clientName: `${data.clientName} (Cópia)`,
    } as Omit<Quote, 'id'>;
    const createdRef = await addDoc(collection(db, 'quotes'), duplicatedQuote);
    await syncQuoteReservation(createdRef.id, duplicatedQuote);
    await logSystemEvent({
      type: 'quote_duplicated',
      title: LABELS.quotes.duplicated,
      description: `${quote.clientName} foi duplicado`,
      entityType: 'quote',
      entityId: createdRef.id,
      quoteId: createdRef.id,
      quoteStatus: duplicatedQuote.status,
      clientId: quote.clientId,
      clientName: duplicatedQuote.clientName,
      materialId: quote.materialId,
      materialName: quote.materialName,
      userUid: appUid || '',
      userName: currentUserName,
    });
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission('orcamento', 'excluir')) {
      alert('Você não tem permissão para excluir orçamentos. Fale com o administrador.');
      return;
    }
    const confirmed = window.confirm('Tem certeza que deseja excluir este orçamento?');
    if (!confirmed) return;

    await releaseQuoteReservation(id);
    const ok = await deleteFirestoreDoc('quotes', id);
    if (!ok) return;

    const deletedQuote = quotes.find((quote) => quote.id === id);
    if (deletedQuote) {
      await logSystemEvent({
        type: 'quote_deleted',
        title: LABELS.quotes.deleted,
        description: deletedQuote.clientName,
        entityType: 'quote',
        entityId: id,
        quoteId: id,
        quoteStatus: deletedQuote.status,
        clientId: deletedQuote.clientId,
        clientName: deletedQuote.clientName,
        materialId: deletedQuote.materialId,
        materialName: deletedQuote.materialName,
        userUid: appUid || '',
        userName: currentUserName,
      });
    }
    setQuotes((prev) => prev.filter((quote) => quote.id !== id));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">{LABELS.quotes.plural}</h1>
          <p className="text-slate-500 mt-1">{LABELS.quotes.pageDescription}</p>
        </div>
        {hasPermission('orcamento', 'criar') && (
          <button
            type="button"
            onClick={() => navigate('/quotes/new')}
            className="flex items-center gap-2 bg-brand-primary text-white px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            {LABELS.quotes.new}
          </button>
        )}
      </header>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        {scope === 'open' && (
          <div className="mx-4 mt-4 mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-xs font-bold uppercase tracking-widest text-amber-800">{LABELS.quotes.openFilter}</div>
            <button
              type="button"
              onClick={() => navigate('/quotes')}
              className="text-xs font-bold uppercase tracking-widest text-amber-700 hover:underline"
            >
              Limpar filtro
            </button>
          </div>
        )}
        <div className="p-4 border-b border-slate-50">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, telefone, projeto ou status..."
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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">{LABELS.quotes.listTitle}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Data</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Total</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">{LABELS.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ?(
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">{LABELS.quotes.loading}</td></tr>
              ) : filteredQuotes.length === 0 ?(
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">{LABELS.quotes.empty}</td></tr>
              ) : (
                filteredQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{quote.clientName}</div>
                      <div className="text-xs text-brand-primary font-medium">{quote.environment}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {quote.createdAt?.toDate ?format(quote.createdAt.toDate(), 'dd/MM/yyyy', {locale: ptBR}) : '-'}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      {formatCurrency(quote.totalPrice || 0)}
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={normalizeQuoteStatus(quote.status)}
                        onChange={(e) => handleStatusChange(quote, e.target.value as QuoteStatus)}
                        disabled={!hasPermission('orcamento', 'editar')}
                        className={cn(
                          'max-w-[180px] cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold uppercase outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60',
                          quoteStatusColor(quote.status),
                        )}
                      >
                        {QUOTE_STATUSES.map((status) => (
                          <option key={status} value={status} className={quoteStatusColor(status)}>{status}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4 text-right sm:px-6">
                      <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          type="button"
                          title="Abrir proposta premium"
                          onClick={() => openPremiumProposal(quote.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-brand-primary/5 hover:text-brand-primary"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        {hasPermission('orcamento', 'editar') && (
                          <button type="button" title="Editar" onClick={() => navigate(`/quotes/edit/${quote.id}`)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-primary/5 hover:text-brand-primary">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('orcamento', 'criar') && (
                          <button type="button" title="Duplicar" onClick={() => handleDuplicate(quote)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-500">
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('orcamento', 'excluir') && (
                          <button type="button" aria-label="Excluir" title="Excluir" onClick={() => handleDelete(quote.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
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
    </div>
  );
};


