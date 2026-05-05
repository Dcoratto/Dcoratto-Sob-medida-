import React, {useEffect, useMemo, useState} from 'react';
import {addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc} from 'firebase/firestore';
import {Edit2, MapPin, Phone, Plus, Search, Trash2, User, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {Client, Quote} from '../types';
import {cn} from '../lib/utils';

type ClientStage = 'pre' | 'approved' | 'production' | 'ready' | 'done' | 'none';

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const stageMeta: Record<ClientStage, {label: string; dot: string; chip: string}> = {
  pre: {label: 'Pré-orçamento', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600'},
  approved: {label: 'Projeto fechado', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700'},
  production: {label: 'Em produção', dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700'},
  ready: {label: 'Aguardando entrega', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700'},
  done: {label: 'Concluído', dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700'},
  none: {label: 'Sem projeto', dot: 'bg-zinc-300', chip: 'bg-zinc-100 text-zinc-500'},
};

const quoteStage = (quote?: Quote): ClientStage => {
  const status = normalize(quote?.status);
  if (!quote) return 'none';
  if (status === 'entregue') return 'done';
  if (status === 'em producao') return 'production';
  if (status === 'pronto para entrega') return 'ready';
  if (status === 'aprovado') return 'approved';
  if (status === 'medido' || status === 'enviado') return 'ready';
  return 'pre';
};

const quoteTime = (quote?: Quote) => {
  const raw = quote?.createdAt;
  if (raw?.toDate) return raw.toDate().getTime();
  if (raw instanceof Date) return raw.getTime();
  return 0;
};

export const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStage | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const qClients = query(collection(db, 'clients'), orderBy('name', 'asc'));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Client)));
      setLoading(false);
    });

    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snapshot) => {
      setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
    });

    return () => {
      unsubClients();
      unsubQuotes();
    };
  }, []);

  const latestQuoteByClient = useMemo(() => {
    const map = new Map<string, Quote>();
    quotes.forEach((quote) => {
      const current = map.get(quote.clientId);
      if (!current || quoteTime(quote) > quoteTime(current)) {
        map.set(quote.clientId, quote);
      }
    });
    return map;
  }, [quotes]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setAddress('');
    setNotes('');
    setEditingClient(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {name, phone, address, notes};

    if (editingClient) {
      await updateDoc(doc(db, 'clients', editingClient.id), data);
    } else {
      await addDoc(collection(db, 'clients'), data);
    }

    setShowModal(false);
    resetForm();
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setPhone(client.phone);
    setAddress(client.address);
    setNotes(client.notes);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este cliente?');
    if (!confirmed) return;

    const ok = await deleteFirestoreDoc('clients', id);
    if (!ok) return;

    setClients((prev) => prev.filter((client) => client.id !== id));
  };

  const filteredClients = clients.filter((client) => {
    const stage = quoteStage(latestQuoteByClient.get(client.id));
    const matchesStatus = statusFilter === 'all' || stage === statusFilter;
    const matchesSearch = normalize(`${client.name} ${client.phone} ${client.address}`).includes(normalize(search));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Clientes</h1>
          <p className="text-slate-500 mt-1">Controle interno de qualidade, produção e entrega.</p>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-brand-primary text-white px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Novo Cliente
        </button>
      </header>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="p-4 border-b border-slate-50 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar clientes por nome, telefone ou endereço..."
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
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-400">Carregando clientes...</div>
          ) : filteredClients.length === 0 ? (
            <div className="col-span-full py-20 text-center text-slate-400">Nenhum cliente encontrado.</div>
          ) : (
            filteredClients.map((client) => {
              const latestQuote = latestQuoteByClient.get(client.id);
              const stage = quoteStage(latestQuote);
              const meta = stageMeta[stage];

              return (
                <div key={client.id} className="group relative bg-slate-50 border border-slate-100 p-6 rounded-[24px] hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300">
                  <div className={cn('absolute top-4 right-4 w-3 h-3 rounded-full ring-4 ring-white', meta.dot)} title={meta.label} />
                  <div className="absolute top-4 right-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => handleEdit(client)} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label="Excluir" title="Excluir" onClick={() => handleDelete(client.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-brand-primary border border-slate-100">
                      <User className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display font-bold text-slate-900 group-hover:text-brand-primary transition-colors truncate">{client.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {client.phone}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className={cn('inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase', meta.chip)}>
                      {meta.label}
                    </span>
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                      <span className="line-clamp-2">{client.address || 'Sem endereço cadastrado'}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-slate-900">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Nome Completo" value={name} onChange={setName} required />
              <FormField label="Telefone" value={phone} onChange={setPhone} required />

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Endereço</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[80px]" />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Observações</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[60px]" />
              </div>

              <button type="submit" className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95">
                {editingClient ? 'Salvar Alterações' : 'Cadastrar Cliente'}
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
    className={cn('px-3 py-2 rounded-xl text-xs font-bold transition-all', active ? 'bg-brand-primary text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100')}
  >
    {label}
  </button>
);

const FormField = ({label, value, onChange, required}: {label: string; value: string; onChange: (value: string) => void; required?: boolean}) => (
  <div className="space-y-1.5">
    <label className="text-slate-500 font-medium text-sm">{label}</label>
    <input
      type="text"
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
    />
  </div>
);
