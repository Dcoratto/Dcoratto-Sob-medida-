import React from 'react';
import {CalendarDays, CheckCircle2, FileUp, Loader2, PackageCheck, Plus, Search, UserRound, X} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {confirmClientContractImport, listContractClients, type ContractClientSummary, type ContractImportPieceDraft, type ContractSummary} from '../lib/clientContracts';
import {parseOperationalContractPdf} from '../lib/contractParser';
import {cn, formatCurrency} from '../lib/utils';

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-brand-primary/60 focus:ring-4 focus:ring-brand-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100';

const formatDate = (value?: string | null) => {
  if (!value) return 'Sem data';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
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
  const [loading, setLoading] = React.useState(true);
  const [feedback, setFeedback] = React.useState<{type: 'success' | 'error'; message: string} | null>(null);

  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewLoading, setReviewLoading] = React.useState(false);
  const [savingImport, setSavingImport] = React.useState(false);
  const [reviewNumber, setReviewNumber] = React.useState('');
  const [reviewDate, setReviewDate] = React.useState('');
  const [reviewPieces, setReviewPieces] = React.useState<ContractImportPieceDraft[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedClient = React.useMemo(
    () => clients.find((item) => item.id === selectedClientId) || clients[0] || null,
    [clients, selectedClientId],
  );
  const selectedContract = React.useMemo(
    () => selectedClient?.contracts.find((item) => item.id === selectedContractId) || selectedClient?.contracts[0] || null,
    [selectedClient, selectedContractId],
  );

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await listContractClients(search, 60);
      setClients(result);
      setSelectedClientId((current) => result.some((item) => item.id === current) ? current : result[0]?.id || '');
      setSelectedContractId('');
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar contratos.'});
    } finally {
      setLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 220);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

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
      const contractId = await confirmClientContractImport({
        clientId: selectedClient.id,
        contractNumber: reviewNumber.trim(),
        contractDate: reviewDate || undefined,
        pieces,
      }, actor);
      setReviewOpen(false);
      setReviewPieces([]);
      setReviewNumber('');
      setReviewDate('');
      await refresh();
      setSelectedClientId(selectedClient.id);
      setSelectedContractId(contractId);
      setFeedback({type: 'success', message: 'Contrato confirmado e vinculado ao cliente correto.'});
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel confirmar o contrato.'});
    } finally {
      setSavingImport(false);
    }
  };

  const renderContract = (contract: ContractSummary) => (
    <button
      key={contract.id}
      type="button"
      onClick={() => setSelectedContractId(contract.id)}
      className={cn(
        'w-full rounded-[24px] border p-4 text-left transition-all',
        selectedContract?.id === contract.id ? 'border-brand-primary bg-brand-primary/10' : 'border-slate-100 bg-white hover:border-slate-200',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Contrato {contract.contractNumber}</div>
          <div className="mt-1 text-xs text-slate-500">{formatDate(contract.contractDate)} · {contract.pieces.length} peca(s)</div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase text-slate-500">{contract.source === 'quote_backfill' ? 'Historico' : 'Confirmado'}</span>
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-[34px] bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-700">Cliente → Contrato → Peca</p>
          <h1 className="mt-2 text-3xl font-display font-bold text-slate-900">Contratos Realizados</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Central dos contratos efetivamente comprados por cada cliente, sem duplicar clientes e sem misturar pecas de compras diferentes.</p>
        </div>
        {canManage ? (
          <button type="button" onClick={openImport} disabled={reviewLoading || !selectedClient} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-[#3F3A34] shadow-lg shadow-brand-primary/20 disabled:opacity-60">
            {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Adicionar contrato
          </button>
        ) : null}
      </header>

      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} className="hidden" />
      {feedback ? <div className={cn('rounded-2xl px-4 py-3 text-sm font-medium', feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{feedback.message}</div> : null}

      <section className="grid gap-5 lg:grid-cols-[360px,minmax(0,1fr)]">
        <aside className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm">
          <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente" className="w-full bg-transparent text-sm font-medium outline-none" />
          </label>
          <div className="mt-4 max-h-[62vh] space-y-2 overflow-y-auto pr-1">
            {loading ? <div className="py-10 text-center text-sm text-slate-400">Carregando clientes...</div> : null}
            {!loading && clients.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">Nenhum cliente encontrado.</div> : null}
            {clients.map((client) => (
              <button key={client.id} type="button" onClick={() => { setSelectedClientId(client.id); setSelectedContractId(''); }} className={cn('w-full rounded-2xl border p-4 text-left transition-all', selectedClient?.id === client.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 bg-slate-50 hover:bg-white')}>
                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-5 w-5 text-emerald-600" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{client.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{client.contracts.length} contrato(s)</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-5">
          {!selectedClient ? (
            <div className="rounded-[30px] border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">Selecione um cliente para ver os contratos.</div>
          ) : (
            <>
              <section className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-display font-bold text-slate-900">{selectedClient.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span>{selectedClient.phone || 'Telefone nao informado'}</span>
                      {selectedClient.cpf ? <span>CPF/CNPJ {selectedClient.cpf}</span> : null}
                      {selectedClient.city ? <span>{selectedClient.city}</span> : null}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{selectedClient.contracts.length} contrato(s)</div>
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)]">
                <div className="space-y-3">
                  {selectedClient.contracts.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Cliente sem contrato realizado.</div>
                  ) : selectedClient.contracts.map(renderContract)}
                </div>
                <div className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
                  {!selectedContract ? (
                    <div className="py-14 text-center text-sm text-slate-400">Selecione um contrato para ver as pecas.</div>
                  ) : (
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Contrato</p>
                          <h3 className="mt-1 text-xl font-display font-bold text-slate-900">{selectedContract.contractNumber}</h3>
                          <p className="mt-1 text-sm text-slate-500">{selectedContract.quote?.environment || 'Sem ambiente vinculado'} · {formatDate(selectedContract.contractDate)}</p>
                        </div>
                        {selectedContract.quote ? <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right text-sm text-slate-500">Valor vendido<br /><span className="font-semibold text-slate-900">{formatCurrency(selectedContract.quote.totalPrice || 0)}</span></div> : null}
                      </div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {selectedContract.pieces.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 sm:col-span-2">Contrato sem pecas cadastradas.</div> : null}
                        {selectedContract.pieces.map((piece) => (
                          <div key={piece.id} className="rounded-2xl bg-slate-50 p-4">
                            <div className="flex items-center gap-2">
                              <PackageCheck className="h-4 w-4 text-emerald-600" />
                              <span className="text-sm font-semibold text-slate-900">{piece.pieceLabel}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </section>

      {reviewOpen && selectedClient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Conferir contrato</h3>
                <p className="mt-1 text-sm text-slate-500">A IA apenas preencheu a revisao. Confirme os dados antes de salvar.</p>
              </div>
              <button type="button" onClick={() => setReviewOpen(false)} className="rounded-2xl bg-slate-100 p-2 text-slate-500"><X className="h-5 w-5" /></button>
            </div>
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
                <button type="button" onClick={() => setReviewPieces((current) => [...current, {id: `manual-${Date.now()}`, label: ''}])} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"><Plus className="h-3.5 w-3.5" /> Peca</button>
              </div>
              <div className="space-y-2">
                {reviewPieces.map((piece, index) => (
                  <input key={piece.id || index} value={piece.label} onChange={(event) => setReviewPieces((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, label: event.target.value} : item))} className={inputClass} placeholder={`Peca ${index + 1}`} />
                ))}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setReviewOpen(false)} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600">Cancelar</button>
              <button type="button" onClick={() => void confirmImport()} disabled={savingImport} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-semibold text-[#3F3A34] disabled:opacity-60">
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
