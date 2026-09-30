import React from 'react';
import {AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, FileUp, Loader2, PackageCheck, Plus, Search, Trash2, UserRound, X} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {confirmClientContractImport, createManualClientContract, deleteClientContract, getContractClientSummary, listContractClients, listContractsForClient, type ContractClientSummary, type ContractImportPieceDraft, type ContractSummary} from '../lib/clientContracts';
import {resolveContractFinancialTotal} from '../lib/contractFinancials';
import {parseOperationalContractPdf} from '../lib/contractParser';
import {cn, formatCurrency} from '../lib/utils';

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-brand-primary/60 focus:ring-4 focus:ring-brand-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100';

const formatDate = (value?: string | null) => {
  if (!value) return 'Sem data';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
};

const pluralize = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

const normalizeMoneyDraft = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
};

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
  const [manualOpen, setManualOpen] = React.useState(false);
  const [savingManual, setSavingManual] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deletingContract, setDeletingContract] = React.useState(false);
  const [reviewNumber, setReviewNumber] = React.useState('');
  const [reviewDate, setReviewDate] = React.useState('');
  const [reviewPieces, setReviewPieces] = React.useState<ContractImportPieceDraft[]>([]);
  const [manualNumber, setManualNumber] = React.useState('');
  const [manualDate, setManualDate] = React.useState('');
  const [manualTotal, setManualTotal] = React.useState<number | null>(null);
  const [manualObservation, setManualObservation] = React.useState('');
  const [manualPieces, setManualPieces] = React.useState<ContractImportPieceDraft[]>([{id: 'manual-1', label: '', value: null}]);
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
  const manualPieceSum = manualPieces.reduce((sum, piece) => sum + (normalizeMoneyDraft(piece.value) || 0), 0);
  const manualHasPieceValues = manualPieces.some((piece) => piece.value !== null && typeof piece.value !== 'undefined');
  const manualNormalizedTotal = normalizeMoneyDraft(manualTotal);
  const manualHasTotalMismatch = manualNormalizedTotal !== null && manualHasPieceValues && Math.abs(manualPieceSum - manualNormalizedTotal) >= 0.01;

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
    setManualOpen(false);
    setDeleteConfirmOpen(false);
    setReviewPieces([]);
    setReviewNumber('');
    setReviewDate('');
    resetManualForm();
  };

  const resetManualForm = () => {
    setManualNumber('');
    setManualDate('');
    setManualTotal(null);
    setManualObservation('');
    setManualPieces([{id: `manual-${Date.now()}`, label: '', value: null}]);
  };

  const openManualForm = () => {
    if (!selectedClient) {
      setFeedback({type: 'error', message: 'Selecione um cliente antes de adicionar contrato manualmente.'});
      return;
    }
    resetManualForm();
    setSelectedContractId('');
    setManualOpen(true);
    setFeedback(null);
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
      setReviewPieces(parsed.pieces.map((piece, index) => ({
        id: `pdf-${index + 1}`,
        label: piece.name,
        value: normalizeMoneyDraft(piece.value),
      })));
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
    const pieces = reviewPieces
      .map((piece) => ({...piece, label: piece.label.trim(), value: normalizeMoneyDraft(piece.value)}))
      .filter((piece) => piece.label);
    if (pieces.length === 0) {
      setFeedback({type: 'error', message: 'Adicione ao menos uma peca para confirmar o contrato.'});
      return;
    }
    const contractTotal = pieces.some((piece) => piece.value !== null)
      ? pieces.reduce((sum, piece) => sum + (piece.value || 0), 0)
      : null;

    setSavingImport(true);
    try {
      await confirmClientContractImport({
        clientId: selectedClient.id,
        contractNumber: reviewNumber.trim(),
        contractDate: reviewDate || undefined,
        contractTotal,
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

  const saveManualContract = async () => {
    if (!selectedClient || savingManual) return;
    if (!manualNumber.trim()) {
      setFeedback({type: 'error', message: 'Informe o numero do contrato antes de salvar.'});
      return;
    }
    const pieces = manualPieces
      .map((piece) => ({...piece, label: piece.label.trim(), value: normalizeMoneyDraft(piece.value)}))
      .filter((piece) => piece.label);
    if (pieces.length === 0) {
      setFeedback({type: 'error', message: 'Adicione ao menos uma peca ao contrato.'});
      return;
    }

    setSavingManual(true);
    setFeedback(null);
    try {
      await createManualClientContract({
        clientId: selectedClient.id,
        contractNumber: manualNumber.trim(),
        contractDate: manualDate || undefined,
        contractTotal: manualNormalizedTotal,
        observation: manualObservation.trim(),
        pieces,
      }, actor);
      resetManualForm();
      setManualOpen(false);
      setSelectedContractId('');
      await Promise.all([
        loadClientContracts(selectedClient.id, true),
        refreshClientCard(selectedClient.id),
      ]);
      setFeedback({type: 'success', message: 'Contrato manual cadastrado com sucesso.'});
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel cadastrar o contrato manual.'});
    } finally {
      setSavingManual(false);
    }
  };

  const confirmDeleteContract = async () => {
    if (!selectedClient || !selectedContract || deletingContract) return;
    setDeletingContract(true);
    setFeedback(null);
    try {
      await deleteClientContract({
        clientId: selectedClient.id,
        contractId: selectedContract.id,
      }, actor);
      setDeleteConfirmOpen(false);
      setSelectedContractId('');
      setContractsByClient((current) => ({
        ...current,
        [selectedClient.id]: (current[selectedClient.id] || []).filter((contract) => contract.id !== selectedContract.id),
      }));
      await Promise.all([
        loadClientContracts(selectedClient.id, true),
        refreshClientCard(selectedClient.id),
      ]);
      setFeedback({type: 'success', message: 'Contrato excluido com sucesso.'});
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel excluir o contrato.'});
    } finally {
      setDeletingContract(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-[34px] border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">Cliente → Contrato → Peca</p>
        <h1 className="mt-2 text-3xl font-display font-semibold text-slate-900">Contratos Realizados</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">Localize o cliente e abra somente os contratos daquele cliente, mantendo as pecas protegidas dentro do detalhe do contrato.</p>
      </header>

      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} className="hidden" />
      {feedback ? <div className={cn('rounded-2xl px-4 py-3 text-sm font-medium', feedback.type === 'success' ? 'bg-brand-primary/20 text-[#3F3A34]' : 'bg-amber-50 text-amber-800')}>{feedback.message}</div> : null}

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
          <button key={client.id} type="button" onClick={() => openClientWindow(client)} className="group rounded-[26px] border border-slate-100 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">{client.name || 'Cliente sem nome'}</h2>
                  <p className="mt-1 text-sm text-slate-500">{pluralize(client.contractCount, 'contrato', 'contratos')} · {pluralize(client.pieceCount, 'peca', 'pecas')}</p>
                </div>
              </div>
              <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Total comprado</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(client.lifetimeValue || 0)}</div>
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
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Cliente selecionado</p>
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
              {manualOpen ? (
                <div className="space-y-5">
                  <button type="button" onClick={() => setManualOpen(false)} disabled={savingManual} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-60">
                    <ArrowLeft className="h-4 w-4" />
                    Voltar aos contratos
                  </button>

                  <section className="rounded-[28px] bg-slate-50 p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Cadastro manual</p>
                    <h3 className="mt-1 text-2xl font-display font-semibold text-slate-900">Novo contrato para {selectedClient.name}</h3>
                    <p className="mt-2 text-sm text-slate-500">Use quando o contrato nao veio de PDF/importacao. O numero sera validado no banco, inclusive contra contratos excluidos.</p>
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-500">Numero do contrato *</span>
                      <input value={manualNumber} onChange={(event) => setManualNumber(event.target.value)} maxLength={80} className={inputClass} placeholder="Ex.: 100001754 ou DC-2026-01" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-500">Data do contrato</span>
                      <input type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} className={inputClass} />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-500">Valor total do contrato</span>
                      <input type="number" min="0" step="0.01" value={manualTotal ?? ''} onChange={(event) => setManualTotal(event.target.value === '' ? null : Number(event.target.value))} className={inputClass} placeholder="Valor opcional" />
                    </label>
                    <label className="space-y-1.5 sm:col-span-2">
                      <span className="text-sm font-medium text-slate-500">Observacao</span>
                      <textarea value={manualObservation} onChange={(event) => setManualObservation(event.target.value)} maxLength={2000} className={cn(inputClass, 'min-h-24 resize-none')} placeholder="Informacoes internas opcionais sobre este contrato" />
                    </label>
                  </section>

                  <section className="rounded-[28px] border border-slate-100 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-lg font-display font-semibold text-slate-900">Pecas do contrato</h4>
                        <p className="mt-1 text-sm text-slate-500">Informe ao menos uma peca. Valores por peca sao opcionais e nao serao distribuidos automaticamente.</p>
                      </div>
                      <button type="button" onClick={() => setManualPieces((current) => [...current, {id: `manual-${Date.now()}`, label: '', value: null}])} disabled={savingManual} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-60">
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar peca
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      {manualPieces.map((piece, index) => (
                        <div key={piece.id || index} className="grid gap-2 sm:grid-cols-[1fr_180px_44px]">
                          <input value={piece.label} onChange={(event) => setManualPieces((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, label: event.target.value} : item))} maxLength={180} className={inputClass} placeholder={`Peca ${index + 1} *`} />
                          <input type="number" min="0" step="0.01" value={piece.value ?? ''} onChange={(event) => setManualPieces((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, value: event.target.value === '' ? null : Number(event.target.value)} : item))} className={inputClass} placeholder="Valor" />
                          <button type="button" onClick={() => setManualPieces((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))} disabled={savingManual || manualPieces.length === 1} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Remover peca ${index + 1}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Total informado</div>
                        <div className="mt-1 font-semibold text-slate-900">{manualNormalizedTotal === null ? 'Nao informado' : formatCurrency(manualNormalizedTotal)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Soma das pecas</div>
                        <div className="mt-1 font-semibold text-slate-900">{manualHasPieceValues ? formatCurrency(manualPieceSum) : 'Nao informada'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Quantidade</div>
                        <div className="mt-1 font-semibold text-slate-900">{pluralize(manualPieces.filter((piece) => piece.label.trim()).length, 'peca', 'pecas')}</div>
                      </div>
                    </div>

                    {manualHasTotalMismatch ? (
                      <div className="mt-4 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>A soma das pecas ({formatCurrency(manualPieceSum)}) e diferente do valor do contrato ({formatCurrency(manualNormalizedTotal || 0)}). Voce pode salvar mesmo assim; o sistema nao vai redistribuir valores automaticamente.</p>
                      </div>
                    ) : null}
                  </section>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => setManualOpen(false)} disabled={savingManual} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-60">Cancelar</button>
                    <button type="button" onClick={() => void saveManualContract()} disabled={savingManual} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-[#3F3A34] disabled:opacity-60">
                      {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {savingManual ? 'Salvando...' : 'Salvar contrato'}
                    </button>
                  </div>
                </div>
              ) : !selectedContract ? (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-xl font-display font-semibold text-slate-900">Contratos realizados ({selectedClientContracts.length || selectedClient.contractCount})</h3>
                      <p className="mt-1 text-sm text-slate-500">Mais recentes primeiro. Abra um contrato para ver somente as pecas dele.</p>
                    </div>
                    {canManage ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="button" onClick={openImport} disabled={reviewLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-[#3F3A34] shadow-lg shadow-brand-primary/20 disabled:opacity-60">
                          {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                          Adicionar contrato
                        </button>
                        <button type="button" onClick={openManualForm} disabled={reviewLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-60">
                          <Plus className="h-4 w-4" />
                          Adicionar manualmente
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {loadingContracts ? <div className="rounded-[24px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">Carregando contratos...</div> : null}
                  {!loadingContracts && selectedClientContracts.length === 0 ? <div className="rounded-[24px] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">Cliente sem contrato realizado.</div> : null}
                  <div className="grid gap-3">
                    {selectedClientContracts.map((contract) => (
                      <button key={contract.id} type="button" onClick={() => setSelectedContractId(contract.id)} className="rounded-[24px] border border-slate-100 bg-slate-50 p-4 text-left transition-all hover:border-slate-200 hover:bg-white">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-base font-semibold text-slate-900">Contrato {contract.contractNumber}</h4>
                            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {formatDate(contract.contractDate)}</span>
                              <span>{pluralize(contract.pieces.length, 'peca', 'pecas')}</span>
                              <span>Valor: <span className="font-medium text-slate-700">{formatCurrency(resolveContractFinancialTotal(contract))}</span></span>
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

                  <section className="rounded-[28px] bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Contrato selecionado</p>
                        <h3 className="mt-1 truncate text-2xl font-display font-semibold text-slate-900">Contrato {selectedContract.contractNumber}</h3>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                          <span>{formatDate(selectedContract.contractDate)}</span>
                          <span>{pluralize(selectedContract.pieces.length, 'peca', 'pecas')}</span>
                          {selectedContract.quote?.environment ? <span>{selectedContract.quote.environment}</span> : null}
                          <span>Valor do contrato: <span className="font-medium text-slate-700">{formatCurrency(resolveContractFinancialTotal(selectedContract))}</span></span>
                        </div>
                      </div>
                      {canManage ? (
                        <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="rounded-2xl p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600" aria-label={`Excluir contrato ${selectedContract.contractNumber}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-lg font-display font-semibold text-slate-900">Pecas ({selectedContract.pieces.length})</h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {selectedContract.pieces.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 sm:col-span-2">Contrato sem pecas cadastradas.</div> : null}
                      {selectedContract.pieces.map((piece) => (
                        <article key={piece.id} className="rounded-2xl bg-slate-50 p-4">
                          <div className="flex items-start gap-3">
                            <PackageCheck className="mt-0.5 h-4 w-4 text-slate-500" />
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{piece.pieceLabel}</div>
                              <div className="mt-1 text-xs text-slate-500">Tipo: {piece.pieceTypeKey || 'Nao informado'}</div>
                              <div className="mt-2 text-sm font-semibold text-slate-900">
                                {piece.pieceTotal === null || typeof piece.pieceTotal === 'undefined'
                                  ? 'Valor nao informado'
                                  : formatCurrency(piece.pieceTotal)}
                              </div>
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
                    <div key={piece.id || index} className="grid gap-2 sm:grid-cols-[1fr_180px]">
                      <input value={piece.label} onChange={(event) => setReviewPieces((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, label: event.target.value} : item))} className={inputClass} placeholder={`Peca ${index + 1}`} />
                      <input type="number" min="0" step="0.01" value={piece.value ?? ''} onChange={(event) => setReviewPieces((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, value: event.target.value === '' ? null : Number(event.target.value)} : item))} className={inputClass} placeholder="Valor da peca" />
                    </div>
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

      {deleteConfirmOpen && selectedContract ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Excluir contrato">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-display font-semibold text-slate-900">Excluir contrato {selectedContract.contractNumber}?</h3>
                <p className="mt-2 text-sm text-slate-500">Este contrato e suas pecas serao removidos de Contratos Realizados. Cliente, orcamento e historicos permanecem preservados.</p>
              </div>
              <button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={deletingContract} className="rounded-2xl bg-slate-100 p-2 text-slate-500 disabled:opacity-60">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={deletingContract} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-60">Cancelar</button>
              <button type="button" onClick={() => void confirmDeleteContract()} disabled={deletingContract} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {deletingContract ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deletingContract ? 'Excluindo...' : 'Excluir contrato'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
