import React, {useEffect, useMemo, useState} from 'react';
import {addDoc, collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc} from 'firebase/firestore';
import {CheckCircle2, ClipboardList, Edit2, MapPin, Phone, Plus, Search, Trash2, User, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {Client, Employee, EmployeeAssignment, EmployeeEvaluation, FixtureInfo, ProductionStep, Quote, QuotePiece, QuoteStatus} from '../types';
import {cn, formatCurrency} from '../lib/utils';
import {syncQuoteReservation} from '../lib/inventoryReservations';
import {useAuth} from '../contexts/AuthContext';

type ClientStage = 'pre' | 'approved' | 'production' | 'ready' | 'done' | 'none';

const productionSteps: Array<{key: ProductionStep; label: string}> = [
  {key: 'medicao', label: 'Medição'},
  {key: 'corte', label: 'Corte'},
  {key: 'acabamento', label: 'Acabamento'},
  {key: 'instalacao', label: 'Instalação'},
  {key: 'entrega', label: 'Entrega'},
];

const quoteStatuses: QuoteStatus[] = [
  'Pré-orçamento',
  'Aguardando medição',
  'Medido',
  'Enviado',
  'Aprovado',
  'Recusado',
  'Em produção',
  'Pronto para entrega',
  'Entregue',
];

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

const stepDate = (value: any) => {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : value;
  if (!(date instanceof Date)) return '';
  return date.toLocaleDateString('pt-BR');
};

export const ClientsPage: React.FC = () => {
  const {user, profile} = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStage | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [showProduction, setShowProduction] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
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

    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      setEmployees(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Employee)));
    });

    return () => {
      unsubClients();
      unsubQuotes();
      unsubEmployees();
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
  const currentUserName = profile?.name || user?.displayName || user?.email || 'Usuário';

  const resetForm = () => {
    setName('');
    setPhone('');
    setAddress('');
    setNotes('');
    setEditingClient(null);
  };

  const openProduction = (client: Client) => {
    const latest = latestQuoteByClient.get(client.id);
    setSelectedClient(client);
    setSelectedQuoteId(latest?.id || '');
    setShowProduction(true);
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

  const updateQuoteStatus = async (quote: Quote, status: QuoteStatus) => {
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
    await syncQuoteReservation(quote.id, {...quote, status});
  };

  const updateAssignment = async (quote: Quote, step: ProductionStep, employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId);
    const nextAssignments = (quote.employeeAssignments || []).filter((item) => item.step !== step);
    if (employee) {
      nextAssignments.push({
        step,
        employeeId: employee.id,
        employeeName: employee.name,
        startedAt: Timestamp.now(),
      });
    }

    await updateDoc(doc(db, 'quotes', quote.id), {
      employeeAssignments: nextAssignments,
      statusHistory: [
        ...(quote.statusHistory || []),
        {
          status: quote.status,
          changedAt: Timestamp.now(),
          changedByUid: user?.uid || '',
          changedByName: currentUserName,
          responsibleEmployeeId: employee?.id || '',
          responsibleEmployeeName: employee?.name || '',
          step,
          note: employee ? `${employee.name} assumiu ${productionSteps.find((item) => item.key === step)?.label}` : `Responsável removido de ${step}`,
        },
      ],
    });
  };

  const toggleStepDone = async (quote: Quote, assignment: EmployeeAssignment) => {
    const finished = Boolean(assignment.finishedAt);
    const nextAssignments = (quote.employeeAssignments || []).map((item) => (
      item.step === assignment.step && item.employeeId === assignment.employeeId
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
          note: `${productionSteps.find((item) => item.key === assignment.step)?.label} ${finished ? 'reaberta' : 'finalizada'} por ${assignment.employeeName}`,
        },
      ],
    });
  };

  const updateEvaluation = async (quote: Quote, assignment: EmployeeAssignment, rating: number, notes?: string) => {
    const currentEvaluation = quote.employeeEvaluations?.find((item) => item.step === assignment.step && item.employeeId === assignment.employeeId);
    const nextEvaluation: EmployeeEvaluation = {
      step: assignment.step,
      employeeId: assignment.employeeId,
      employeeName: assignment.employeeName,
      rating,
      notes: notes ?? currentEvaluation?.notes ?? '',
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
  };

  const updatePieceFixture = async (
    quote: Quote,
    pieceId: string,
    fixtureType: 'sink' | 'faucet' | 'cooktop',
    field: keyof FixtureInfo,
    value: string,
  ) => {
    const numericFields: Array<keyof FixtureInfo> = ['width', 'depth', 'height', 'diameter'];
    const nextPieces = (quote.pieces || []).map((piece) => {
      if (piece.id !== pieceId) return piece;
      const currentFixture = piece.purchasedFixtures?.[fixtureType] || {};
      const nextFixture = {
        ...currentFixture,
        [field]: numericFields.includes(field) ? Number(value || 0) : value,
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
          note: `Dados de ${fixtureType === 'sink' ? 'cuba' : fixtureType === 'faucet' ? 'torneira' : 'cooktop'} atualizados`,
        },
      ],
    });
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
                <button
                  key={client.id}
                  type="button"
                  onClick={() => openProduction(client)}
                  className="group relative bg-slate-50 border border-slate-100 p-6 rounded-[24px] hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 text-left"
                >
                  <div className={cn('absolute top-4 right-4 w-3 h-3 rounded-full ring-4 ring-white', meta.dot)} title={meta.label} />
                  <div className="absolute top-4 right-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={(event) => { event.stopPropagation(); handleEdit(client); }} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label="Excluir" title="Excluir" onClick={(event) => { event.stopPropagation(); handleDelete(client.id); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
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
                    {latestQuote && (
                      <div className="text-xs font-bold text-brand-primary">
                        {latestQuote.pieces?.length || 0} peça(s) · {formatCurrency(latestQuote.totalPrice || 0)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {showProduction && selectedClient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-[36px] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">{selectedClient.name}</h2>
                <p className="text-sm text-slate-400">Controle de produção do contrato fechado.</p>
              </div>
              <button type="button" onClick={() => setShowProduction(false)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-auto p-6 space-y-6">
              {selectedClientQuotes.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-4">
                    <select
                      value={selectedQuote?.id || ''}
                      onChange={(event) => setSelectedQuoteId(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      {selectedClientQuotes.map((quote) => (
                        <option key={quote.id} value={quote.id}>{quote.environment || 'Projeto'} · {formatCurrency(quote.totalPrice || 0)}</option>
                      ))}
                    </select>
                    {selectedQuote && (
                      <select
                        value={selectedQuote.status}
                        onChange={(event) => updateQuoteStatus(selectedQuote, event.target.value as QuoteStatus)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                      >
                        {quoteStatuses.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedQuote && (
                    <>
                      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="rounded-3xl bg-slate-50 p-5">
                          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Valor fechado</div>
                          <div className="mt-2 text-2xl font-display font-bold text-slate-900">{formatCurrency(selectedQuote.totalPrice || 0)}</div>
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

                      <section className="rounded-3xl border border-slate-100 p-5">
                        <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Peças fechadas</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(selectedQuote.pieces || []).map((piece) => (
                            <div key={piece.id} className="rounded-2xl bg-slate-50 p-4 flex gap-4">
                              {piece.previewUrl ? (
                                <img src={piece.previewUrl} alt={piece.name} className="h-24 w-24 rounded-xl border border-slate-100 bg-white object-contain p-2" />
                              ) : (
                                <div className="h-24 w-24 rounded-xl border border-slate-100 bg-white flex items-center justify-center text-slate-300">
                                  <ClipboardList className="w-8 h-8" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900">{piece.name}</div>
                                <div className="text-xs text-slate-400">{piece.length || 0} x {piece.width || 0} cm</div>
                                <div className="mt-2 text-sm font-bold text-brand-primary">{((piece.totalArea || piece.manualArea || piece.area || 0)).toFixed(4)} m²</div>
                                {piece.sides?.length > 0 && (
                                  <div className="mt-1 text-xs text-slate-500">{piece.sides.length} adicional(is)</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-3xl border border-slate-100 p-5">
                        <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Itens comprados para projeto</h3>
                        <div className="space-y-4">
                          {(selectedQuote.pieces || []).map((piece) => (
                            <div key={piece.id} className="rounded-2xl bg-slate-50 p-4">
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-bold text-slate-900">{piece.name}</div>
                                  <div className="text-xs text-slate-400">Informe modelos e medidas reais para projeto e produção.</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <FixtureFields quote={selectedQuote} piece={piece} type="sink" title="Cuba" onChange={updatePieceFixture} />
                                <FixtureFields quote={selectedQuote} piece={piece} type="faucet" title="Torneira" onChange={updatePieceFixture} />
                                <FixtureFields quote={selectedQuote} piece={piece} type="cooktop" title="Cooktop" onChange={updatePieceFixture} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-3xl border border-slate-100 p-5">
                        <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Etapas e responsáveis</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {productionSteps.map((step) => {
                            const assignment = selectedQuote.employeeAssignments?.find((item) => item.step === step.key);
                            const evaluation = assignment
                              ? selectedQuote.employeeEvaluations?.find((item) => item.step === step.key && item.employeeId === assignment.employeeId)
                              : undefined;
                            return (
                              <div key={step.key} className="rounded-2xl bg-slate-50 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="font-bold text-slate-900">{step.label}</div>
                                    <div className="text-xs text-slate-400">
                                      {assignment?.startedAt ? `Iniciado em ${stepDate(assignment.startedAt)}` : 'Sem início registrado'}
                                    </div>
                                  </div>
                                  {assignment?.finishedAt && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                                </div>
                                <select
                                  value={assignment?.employeeId || ''}
                                  onChange={(event) => updateAssignment(selectedQuote, step.key, event.target.value)}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-primary/20"
                                >
                                  <option value="">Selecionar profissional</option>
                                  {employees.filter((employee) => employee.active).map((employee) => (
                                    <option key={employee.id} value={employee.id}>{employee.name} · {employee.role}</option>
                                  ))}
                                </select>
                                {assignment && (
                                  <div className="space-y-3">
                                    <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(assignment.finishedAt)}
                                        onChange={() => toggleStepDone(selectedQuote, assignment)}
                                        className="h-4 w-4 accent-brand-primary"
                                      />
                                      {assignment.finishedAt ? `Finalizado em ${stepDate(assignment.finishedAt)}` : 'Marcar etapa finalizada'}
                                    </label>

                                    <div className="rounded-xl bg-white p-3 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Avaliação</span>
                                        <div className="flex gap-1">
                                          {[1, 2, 3, 4, 5].map((rating) => (
                                            <button
                                              key={rating}
                                              type="button"
                                              onClick={() => updateEvaluation(selectedQuote, assignment, rating)}
                                              className={cn(
                                                'h-8 w-8 rounded-full text-sm transition-all',
                                                (evaluation?.rating || 0) >= rating ? 'bg-green-500 text-white shadow-sm' : 'bg-slate-50 text-slate-300 hover:text-brand-primary',
                                              )}
                                              title={`${rating} ponto(s)`}
                                            >
                                              {rating <= 2 ? '☹' : rating === 3 ? '○' : '☺'}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <input
                                        value={evaluation?.notes || ''}
                                        onChange={(event) => updateEvaluation(selectedQuote, assignment, evaluation?.rating || 3, event.target.value)}
                                        placeholder="Observação da etapa"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-primary/20"
                                      />
                                    </div>
                                  </div>
                                )}
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
                                {stepDate(item.changedAt)}{item.responsibleEmployeeName ? ` · ${item.responsibleEmployeeName}` : ''}
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
              ) : (
                <div className="rounded-3xl bg-slate-50 p-10 text-center">
                  <ClipboardList className="mx-auto mb-4 w-10 h-10 text-slate-300" />
                  <div className="font-display text-xl font-bold text-slate-900">Nenhum orçamento vinculado</div>
                  <p className="mt-2 text-sm text-slate-400">Quando um orçamento for fechado para este cliente, as peças e etapas aparecerão aqui.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

const FixtureFields = ({
  quote,
  piece,
  type,
  title,
  onChange,
}: {
  quote: Quote;
  piece: QuotePiece;
  type: 'sink' | 'faucet' | 'cooktop';
  title: string;
  onChange: (quote: Quote, pieceId: string, fixtureType: 'sink' | 'faucet' | 'cooktop', field: keyof FixtureInfo, value: string) => void;
}) => {
  const fixture = piece.purchasedFixtures?.[type] || {};
  const showDiameter = type === 'faucet';

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
      <div className="text-sm font-bold text-slate-900">{title}</div>
      <FixtureInput label="Modelo" value={fixture.model || ''} onBlur={(value) => onChange(quote, piece.id, type, 'model', value)} />
      <FixtureInput label="Marca" value={fixture.brand || ''} onBlur={(value) => onChange(quote, piece.id, type, 'brand', value)} />
      {showDiameter ? (
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
