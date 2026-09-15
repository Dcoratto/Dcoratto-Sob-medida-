import React from 'react';
import {ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, FileUp, Loader2, PackageCheck, Plus, Search, UserRound, X} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {confirmClientContractImport, getContractClientSummary, listContractClients, listContractsForClient, type ContractClientSummary, type ContractImportPieceDraft, type ContractSummary} from '../lib/clientContracts';
import {parseOperationalContractPdf} from '../lib/contractParser';
import {cn, formatCurrency} from '../lib/utils';

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-brand-primary/60 focus:ring-4 focus:ring-brand-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100';

const formatDate = (value?: string | null) => {
  if (!value) return 'Sem data';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
};

const pluralize = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

export const ClientContractsPage: React.FC = () => {
  const {accessUser, profile, user, hasPermission} = useAuth();
  const canManage = hasPermission('cliente', 'editarDados') || hasPermission('projeto', 'editar');
  const actor = React.useMemo(() => ({
    uid: accessUser?.uid || user?.id || '',
    name: accessUser?.nome || profile?.name || user?.email?.split('@')[0] || 'Usuario',
  }), [accessUser, profile, user]);

  const [search, setSearch] = React.useState('');
  const [clients, setClients] = React.useState<ContractClientSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = React.useState('');
  const [selectedContractId, setSelectedContractId] = React.useState('');
  const [contractsByClient, setContractsByClient] = React.useState<Record<string, ContractSummary[]>>({});
  const [clientModalOpen, setClientModalOpen] = React.useState(false);
  const [loadingClients, setLoadingClients] = React.useState(true);
  const [loadingContracts, setLoadingContracts] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{type: 'success' | 'error'; message: string} | null>(null);

  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewLoading, setReviewLoading] = React.useState(false);
  const [savingImport, setSavingImport] = React.useState(false);
  const [reviewNumber, setReviewNumber] = React.useState('');
  const [reviewDate, setReviewDate] = React.useState('');
  const [reviewPieces, setReviewPieces] = React.useState<ContractImportPieceDraft[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedClient = React.useMemo(
    () => clients.find((item) => item.id === selectedClientId) || null,
    [clients, selectedClientId],
  );
  const selectedClientContracts = selectedClientId ? contractsByClient[selectedClientId] || [] : [];
  const selectedContract = React.useMemo(
    () => selectedClientContracts.find((item) => item.id === selectedContractId) || null,
    [selectedClientContracts, selectedContractId],
  );

  const refreshClients = React.useCallback(async () => {
    setLoadingClients(true);
    try {
      const result = await listContractClients(search, 60);
      setClients(result);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar clientes.'});
    } finally {
      setLoadingClients(false);
    }
  }, [search]);

  const refreshClientCard = React.useCallback(async (clientId: string) => {
    const summary = await getContractClientSummary(clientId);
    if (!summary) return;
    setClients((current) => current.some((item) => item.id === clientId)
      ? current.map((item) => item.id === clientId ? summary : item)
      : [summary, ...current]);
  }, []);

  const loadClientContracts = React.useCallback(async (clientId: string, force = false) => {
    if (!clientId) return;
    if (!force && contractsByClient[clientId]) return;
    setLoadingContracts(true);
    try {
      const contracts = await listContractsForClient(clientId);
      setContractsByClient((current) => ({...current, [clientId]: contracts}));
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar contratos deste cliente.'});
    } finally {
      setLoadingContracts(false);
    }
  }, [contractsByClient]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void refreshClients(), 220);
    return () => window.clearTimeout(timeout);
  }, [refreshClients]);

  const openClientWindow = (client: ContractClientSummary) => {
    setSelectedClientId(client.id);
    setSelectedContractId('');
    setClientModalOpen(true);
    setFeedback(null);
    void loadClientContracts(client.id);
  };

  const closeClientWindow = () => {
    setClientModalOpen(false);
    setSelectedClientId('');
    setSelectedContractId('');
    setReviewOpen(false);
    setReviewPieces([]);
    setReviewNumber('');
    setReviewDate('');
  };

  const openImport = () => {
    if (!selectedClient) {
      setFeedback({type: 'error', message: 'Selecione um cliente antes de adicionar contrato.'});
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedClient) return;

    setReviewLoading(true);
    setFeedback(null);
    try {
      const parsed = await parseOperationalContractPdf(file);
      setReviewNumber(parsed.contractNumber);
      setReviewDate(parsed.contractDate ? parsed.contractDate.split('/').reverse().join('-') : '');
      setReviewPieces(parsed.pieces.map((piece, index) => ({id: `pdf-${index + 1}`, label: piece.name})));
      setReviewOpen(true);
      if (parsed.needsManualReview) {
        setFeedback({type: 'error', message: 'Revise o numero do contrato e as pecas antes de confirmar. Nada foi salvo ainda.'});
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const message = code === 'PDF_MUITO_GRANDE'
        ? 'O PDF ultrapassa o limite de 12 MB.'
        : code === 'PDF_INVALIDO'
          ? 'Envie um PDF valido. O arquivo nao passou pela validacao inicial.'
          : 'Nao consegui extrair este contrato. Revise manualmente antes de confirmar.';
      setFeedback({type: 'error', message});
    } finally {
      setReviewLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!selectedClient || !reviewNumber.trim()) {
      setFeedback({type: 'error', message: 'Informe o numero do contrato antes de confirmar.'});
      return;
    }
    const pieces = reviewPieces.map((piece) => ({...piece, label: piece.label.trim()})).filter((piece) => piece.label);
    if (pieces.length === 0) {
      setFeedback({type: 'error', message: 'Adicione ao menos uma peca para confirmar o contrato.'});
      return;
    }

    setSavingImport(true);
    try {
      await confirmClientContractImport({
        clientId: selectedClient.id,
        contractNumber: reviewNumber.trim(),
        contractDate: reviewDate || undefined,
        pieces,
      }, actor);
      setReviewOpen(false);
      setReviewPieces([]);
      setReviewNumber('');
      setReviewDate('');
      setSelectedContractId('');
      await Promise.all([
        loadClientContracts(selectedClient.id, true),
        refreshClientCard(selectedClient.id),
      ]);
      setFeedback({type: 'success', message: 'Contrato confirmado e listado neste cliente.'});
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel confirmar o contrato.'});
    } finally {
      setSavingImport(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-[34px] bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-700">Cliente → Contrato → Peca</p>
        <h1 className="mt-2 text-3xl font-display font-semibold text-slate-900">Contratos Realizados</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">Localize o cliente e abra somente os contratos daquele cliente, mantendo as pecas protegidas dentro do detalhe do contrato.</p>
      </header>

      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} className="hidden" />
      {feedback ? <div className={cn('rounded-2xl px-4 py-3 text-sm font-medium', feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{feedback.message}</div> : null}

      <section className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente..." className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none" />
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loadingClients ? <div className="col-span-full rounded-[28px] border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">Carregando clientes...</div> : null}
        {!loadingClients && clients.length === 0 ? <div className="col-span-full rounded-[28px] border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">Nenhum cliente encontrado.</div> : null}
        {clients.map((client) => (
          <button key={client.id} type="button" onClick={() => openClientWindow(client)} className="group rounded-[26px] border border-slate-100 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">{client.name || 'Cliente sem nome'}</h2>
                  <p className="mt-1 text-sm text-slate-500">{pluralize(client.contractCount, 'contrato', 'contratos')} · {pluralize(client.pieceCount, 'peca', 'pecas')}</p>
                </div>
              </div>
              <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-500" />
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {client.latestContractNumber ? (
                <span>Ultimo contrato: <span className="font-medium text-slate-700">{client.latestContractNumber}</span>{client.latestContractDate ? ` · ${formatDate(client.latestContractDate)}` : ''}</span>
              ) : 'Sem contrato realizado'}
            </div>
          </button>
        ))}
      </section>

      {clientModalOpen && selectedClient ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Contratos de ${selectedClient.name}`}>
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:max-w-5xl sm:rounded-[32px]">
            <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">Cliente selecionado</p>
                  <h2 className="mt-1 truncate text-2xl font-display font-semibold text-slate-900">{selectedClient.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-500">
                    <span>{selectedClient.phone || 'Telefone nao informado'}</span>
                    {selectedClient.cpf ? <span>CPF/CNPJ {selectedClient.cpf}</span> : null}
                    {selectedClient.city ? <span>{selectedClient.city}</span> : null}
                  </div>
                </div>
                <button type="button" onClick={closeClientWindow} className="rounded-2xl bg-slate-100 p-3 text-slate-500 transition-colors hover:bg-slate-200">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {!selectedContract ? (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-xl font-display font-semibold text-slate-900">Contratos realizados ({selectedClientContracts.length || selectedClient.contractCount})</h3>
                      <p className="mt-1 text-sm text-slate-500">Mais recentes primeiro. Abra um contrato para ver somente as pecas dele.</p>
                    </div>
                    {canManage ? (
                      <button type="button" onClick={openImport} disabled={reviewLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-[#3F3A34] shadow-lg shadow-brand-primary/20 disabled:opacity-60">
                        {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        Adicionar contrato
                      </button>
                    ) : null}
                  </div>

                  {loadingContracts ? <div className="rounded-[24px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">Carregando contratos...</div> : null}
                  {!loadingContracts && selectedClientContracts.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">Cliente sem contrato realizado.</div> : null}
                  <div className="grid gap-3">
                    {selectedClientContracts.map((contract) => (
                      <button key={contract.id} type="button" onClick={() => setSelectedContractId(contract.id)} className="rounded-[24px] border border-slate-100 bg-slate-50 p-4 text-left transition-all hover:border-emerald-200 hover:bg-white">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-base font-semibold text-slate-900">Contrato {contract.contractNumber}</h4>
                            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {formatDate(contract.contractDate)}</span>
                              <span>{pluralize(contract.pieces.length, 'peca', 'pecas')}</span>
                            </div>
                          </div>
                          <ChevronRight className="mt-2 h-5 w-5 text-slate-300" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <button type="button" onClick={() => setSelectedContractId('')} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200">
                    <ArrowLeft className="h-4 w-4" />
                    Voltar aos contratos
                  </button>

                  <section className="rounded-[28px] bg-gradient-to-br from-slate-50 to-emerald-50/70 p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Contrato selecionado</p>
                    <h3 className="mt-1 text-2xl font-display font-semibold text-slate-900">Contrato {selectedContract.contractNumber}</h3>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span>{formatDate(selectedContract.contractDate)}</span>
                      <span>{pluralize(selectedContract.pieces.length, 'peca', 'pecas')}</span>
                      {selectedContract.quote?.environment ? <span>{selectedContract.quote.environment}</span> : null}
                      {selectedContract.quote ? <span>{formatCurrency(selectedContract.quote.totalPrice || 0)}</span> : null}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-lg font-display font-semibold text-slate-900">Pecas ({selectedContract.pieces.length})</h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {selectedContract.pieces.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 sm:col-span-2">Contrato sem pecas cadastradas.</div> : null}
                      {selectedContract.pieces.map((piece) => (
                        <article key={piece.id} className="rounded-2xl bg-slate-50 p-4">
                          <div className="flex items-start gap-3">
                            <PackageCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{piece.pieceLabel}</div>
                              <div className="mt-1 text-xs text-slate-500">Tipo: {piece.pieceTypeKey || 'Nao informado'}</div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {reviewOpen && selectedClient ? (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Conferir contrato">
          <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-[32px]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
              <div>
                <h3 className="text-2xl font-display font-semibold text-slate-900">Conferir contrato</h3>
                <p className="mt-1 text-sm text-slate-500">Cliente ja selecionado: {selectedClient.name}. Revise antes de salvar.</p>
              </div>
              <button type="button" onClick={() => setReviewOpen(false)} className="rounded-2xl bg-slate-100 p-2 text-slate-500"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-500">Cliente</span>
                  <input value={selectedClient.name} disabled className={inputClass} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-500">Numero do contrato</span>
                  <input value={reviewNumber} onChange={(event) => setReviewNumber(event.target.value)} className={inputClass} placeholder="Ex.: 100001754" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-500">Data do contrato</span>
                  <input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} className={inputClass} />
                </label>
              </div>
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Pecas encontradas</span>
                  <button type="button" onClick={() => setReviewPieces((current) => [...current, {id: `manual-${Date.now()}`, label: ''}])} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"><Plus className="h-3.5 w-3.5" /> Peca</button>
                </div>
                <div className="space-y-2">
                  {reviewPieces.map((piece, index) => (
                    <input key={piece.id || index} value={piece.label} onChange={(event) => setReviewPieces((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, label: event.target.value} : item))} className={inputClass} placeholder={`Peca ${index + 1}`} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 p-5 sm:flex-row sm:justify-end sm:p-6">
              <button type="button" onClick={() => setReviewOpen(false)} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600">Cancelar</button>
              <button type="button" onClick={() => void confirmImport()} disabled={savingImport} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-[#3F3A34] disabled:opacity-60">
                {savingImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar contrato
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
