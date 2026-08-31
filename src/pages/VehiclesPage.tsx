import React from 'react';
import {
  AlertTriangle,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Fuel,
  Loader2,
  MapPinned,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {cn} from '../lib/utils';
import {imageVariantUrl} from '../lib/storage';
import {
  finishVehicleUsage,
  listVehicleEmployees,
  listVehicleOperationalOverview,
  listVehiclePurposes,
  listVehicleUsageHistory,
  reportVehicleOccurrence,
  searchVehicleReferences,
  startVehicleUsage,
  type VehicleActor,
  type VehicleDraft,
  type VehicleEmployeeOption,
  type VehicleReferenceOption,
} from '../lib/vehicleFleet';
import type {
  VehicleFuelLevel,
  VehicleOccurrenceSeverity,
  VehicleOperationalOverview,
  VehiclePurpose,
  VehicleStatus,
  VehicleUsageSession,
} from '../types';

type Feedback = {type: 'success' | 'error'; message: string} | null;

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 disabled:bg-slate-100';
const textareaClass = 'min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20';
const primaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-medium text-[#3F3A34] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const statusMeta: Record<VehicleStatus, {label: string; className: string}> = {
  DISPONIVEL: {label: 'Disponível', className: 'border-emerald-200 bg-emerald-50 text-emerald-700'},
  EM_USO: {label: 'Em uso', className: 'border-blue-200 bg-blue-50 text-blue-700'},
  MANUTENCAO: {label: 'Manutenção', className: 'border-amber-200 bg-amber-50 text-amber-700'},
  INDISPONIVEL: {label: 'Indisponível', className: 'border-red-200 bg-red-50 text-red-700'},
  INATIVO: {label: 'Inativo', className: 'border-slate-200 bg-slate-100 text-slate-600'},
};

const fuelOptions: Array<{value: VehicleFuelLevel; label: string}> = [
  {value: 'RESERVA', label: 'Reserva'},
  {value: 'UM_QUARTO', label: '1/4'},
  {value: 'METADE', label: '1/2'},
  {value: 'TRES_QUARTOS', label: '3/4'},
  {value: 'CHEIO', label: 'Cheio'},
];

const occurrenceSeverityOptions: Array<{value: VehicleOccurrenceSeverity; label: string}> = [
  {value: 'LEVE', label: 'Leve'},
  {value: 'ATENCAO', label: 'Atenção'},
  {value: 'IMPEDE_USO', label: 'Impede uso'},
];

const startChecklistItems = [
  {key: 'pneus_ok', label: 'Pneus aparentemente OK'},
  {key: 'farois_ok', label: 'Faróis OK'},
  {key: 'lanternas_ok', label: 'Lanternas OK'},
  {key: 'vidros_ok', label: 'Vidros OK'},
  {key: 'retrovisores_ok', label: 'Retrovisores OK'},
  {key: 'combustivel_informado', label: 'Combustível informado'},
  {key: 'sem_avarias_novas_aparentes', label: 'Sem avarias novas aparentes'},
  {key: 'documentacao_presente', label: 'Documentação presente'},
  {key: 'condicao_de_uso', label: 'Veículo em condição de uso'},
] as const;

const returnChecklistItems = [
  {key: 'quilometragem_conferida', label: 'Quilometragem conferida'},
  {key: 'combustivel_informado', label: 'Combustível informado'},
  {key: 'sem_novas_avarias_visiveis', label: 'Sem novas avarias visíveis'},
  {key: 'itens_recolhidos', label: 'Itens recolhidos'},
  {key: 'encerramento_confirmado', label: 'Encerramento confirmado'},
] as const;

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';
const formatDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-';
const formatKm = (value?: number | null) => `${new Intl.NumberFormat('pt-BR').format(Number(value) || 0)} km`;

const formatDuration = (startedAt?: string | null, endedAt?: string | null, nowMs = Date.now()) => {
  if (!startedAt) return '--';
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : nowMs;
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}h${String(rest).padStart(2, '0')}`;
};

const buildChecklistState = (items: readonly {key: string}[]) =>
  items.reduce<Record<string, boolean>>((acc, item) => {
    acc[item.key] = false;
    return acc;
  }, {});

const checklistComplete = (checklist: Record<string, boolean>, items: readonly {key: string}[]) =>
  items.every((item) => Boolean(checklist[item.key]));

const checklistLabel = (key: string) => key.replace(/_/g, ' ').replace(/^./, (value) => value.toUpperCase());

const createRequestKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const Field: React.FC<{label: string; required?: boolean; children: React.ReactNode}> = ({label, required, children}) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{label}{required ? ' *' : ''}</span>
    {children}
  </label>
);

const Modal: React.FC<{title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean}> = ({title, open, onClose, children, wide}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Fechar" />
      <div className={cn('relative max-h-[94svh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]', wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl')}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
};

export const VehiclesPage: React.FC = () => {
  const {accessUser, profile, user, hasPermission} = useAuth();
  const actor = React.useMemo<VehicleActor>(() => ({
    uid: accessUser?.uid || user?.id || '',
    name: accessUser?.nome || profile?.name || user?.email?.split('@')[0] || 'Usuário',
    empresaId: accessUser?.empresaId || profile?.empresaId,
  }), [accessUser, profile, user]);
  const canManage = hasPermission('veiculos', 'cadastrar') || hasPermission('veiculos', 'editar');
  const canUse = hasPermission('veiculos', 'usar');

  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [search, setSearch] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [nowMs, setNowMs] = React.useState(Date.now());
  const [loading, setLoading] = React.useState(true);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [overview, setOverview] = React.useState<VehicleOperationalOverview[]>([]);
  const [purposes, setPurposes] = React.useState<VehiclePurpose[]>([]);
  const [history, setHistory] = React.useState<VehicleUsageSession[]>([]);
  const [employees, setEmployees] = React.useState<VehicleEmployeeOption[]>([]);

  const [useVehicle, setUseVehicle] = React.useState<VehicleOperationalOverview | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState('');
  const [selectedPurposeKey, setSelectedPurposeKey] = React.useState('');
  const [selectedQuoteId, setSelectedQuoteId] = React.useState('');
  const [selectedClientId, setSelectedClientId] = React.useState('');
  const [startOdometerKm, setStartOdometerKm] = React.useState('');
  const [startFuelLevel, setStartFuelLevel] = React.useState<VehicleFuelLevel>('METADE');
  const [startNotes, setStartNotes] = React.useState('');
  const [startChecklist, setStartChecklist] = React.useState<Record<string, boolean>>(buildChecklistState(startChecklistItems));
  const [startOccurrenceSeverity, setStartOccurrenceSeverity] = React.useState<VehicleOccurrenceSeverity | ''>('');
  const [startOccurrenceDescription, setStartOccurrenceDescription] = React.useState('');
  const [savingStart, setSavingStart] = React.useState(false);
  const [referenceSearch, setReferenceSearch] = React.useState('');
  const [references, setReferences] = React.useState<VehicleReferenceOption[]>([]);
  const [referencesLoading, setReferencesLoading] = React.useState(false);

  const [returnSession, setReturnSession] = React.useState<VehicleUsageSession | null>(null);
  const [endOdometerKm, setEndOdometerKm] = React.useState('');
  const [endFuelLevel, setEndFuelLevel] = React.useState<VehicleFuelLevel>('METADE');
  const [endNotes, setEndNotes] = React.useState('');
  const [endChecklist, setEndChecklist] = React.useState<Record<string, boolean>>(buildChecklistState(returnChecklistItems));
  const [endOccurrenceSeverity, setEndOccurrenceSeverity] = React.useState<VehicleOccurrenceSeverity | ''>('');
  const [endOccurrenceDescription, setEndOccurrenceDescription] = React.useState('');
  const [savingReturn, setSavingReturn] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = React.useCallback((message?: string) => {
    setRefreshKey((value) => value + 1);
    if (message) setFeedback({type: 'success', message});
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      listVehicleOperationalOverview(search),
      listVehiclePurposes(),
      canManage ? listVehicleEmployees() : Promise.resolve([]),
    ])
      .then(([nextOverview, nextPurposes, nextEmployees]) => {
        if (!active) return;
        setOverview(nextOverview);
        setPurposes(nextPurposes);
        setEmployees(nextEmployees);
        if (!selectedPurposeKey && nextPurposes[0]) {
          setSelectedPurposeKey(nextPurposes[0].purposeKey);
        }
      })
      .catch((error) => active && setFeedback({type: 'error', message: (error as Error).message}))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [canManage, refreshKey, search, selectedPurposeKey]);

  React.useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    listVehicleUsageHistory({limit: 40})
      .then((rows) => {
        if (!active) return;
        setHistory(rows);
      })
      .catch((error) => active && setFeedback({type: 'error', message: (error as Error).message}))
      .finally(() => active && setHistoryLoading(false));
    return () => { active = false; };
  }, [refreshKey]);

  React.useEffect(() => {
    const normalized = referenceSearch.trim();
    if (!normalized) {
      setReferences([]);
      return;
    }
    let active = true;
    setReferencesLoading(true);
    searchVehicleReferences(normalized)
      .then((rows) => active && setReferences(rows))
      .catch((error) => active && setFeedback({type: 'error', message: (error as Error).message}))
      .finally(() => active && setReferencesLoading(false));
    return () => { active = false; };
  }, [referenceSearch]);

  const activeSessions = React.useMemo(() => history.filter((item) => item.status === 'ATIVA'), [history]);
  const myActiveSessionIds = React.useMemo(() => new Set(activeSessions.map((item) => item.id)), [activeSessions]);
  const summary = React.useMemo(() => ({
    total: overview.length,
    available: overview.filter((item) => item.vehicle.status === 'DISPONIVEL').length,
    inUse: overview.filter((item) => item.vehicle.status === 'EM_USO').length,
    attention: overview.filter((item) => item.vehicle.status === 'MANUTENCAO' || item.vehicle.status === 'INDISPONIVEL' || item.openOccurrenceCount > 0).length,
  }), [overview]);

  const selectedPurpose = React.useMemo(
    () => purposes.find((item) => item.purposeKey === selectedPurposeKey) || null,
    [purposes, selectedPurposeKey],
  );

  const openStartModal = (item: VehicleOperationalOverview) => {
    setUseVehicle(item);
    setSelectedEmployeeId(canManage ? '' : '');
    setSelectedPurposeKey(purposes[0]?.purposeKey || '');
    setSelectedQuoteId('');
    setSelectedClientId('');
    setReferenceSearch('');
    setStartOdometerKm(String(item.vehicle.currentOdometerKm || 0));
    setStartFuelLevel('METADE');
    setStartNotes('');
    setStartChecklist(buildChecklistState(startChecklistItems));
    setStartOccurrenceSeverity('');
    setStartOccurrenceDescription('');
  };

  const openReturnModal = (session: VehicleUsageSession) => {
    setReturnSession(session);
    setEndOdometerKm(String(session.vehicle?.currentOdometerKm || session.startOdometerKm || 0));
    setEndFuelLevel('METADE');
    setEndNotes('');
    setEndChecklist(buildChecklistState(returnChecklistItems));
    setEndOccurrenceSeverity('');
    setEndOccurrenceDescription('');
  };

  const handleStartUsage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!useVehicle || !canUse) return;
    if (!checklistComplete(startChecklist, startChecklistItems)) {
      setFeedback({type: 'error', message: 'Confirme todo o checklist antes da saída.'});
      return;
    }
    if (selectedPurpose?.requiresClientLink && !selectedQuoteId) {
      setFeedback({type: 'error', message: 'Selecione o cliente/obra vinculado à finalidade.'});
      return;
    }

    setSavingStart(true);
    try {
      if (startOccurrenceSeverity === 'IMPEDE_USO') {
        await reportVehicleOccurrence({
          vehicleId: useVehicle.vehicle.id,
          stage: 'SAIDA',
          severity: 'IMPEDE_USO',
          description: startOccurrenceDescription.trim() || 'Problema identificado antes da saída.',
        }, actor);
        setUseVehicle(null);
        refresh('Ocorrência registrada e veículo marcado como indisponível.');
        return;
      }

      await startVehicleUsage({
        employeeId: canManage ? (selectedEmployeeId || undefined) : undefined,
        vehicleId: useVehicle.vehicle.id,
        purposeKey: selectedPurposeKey,
        clientId: selectedClientId || null,
        quoteId: selectedQuoteId || null,
        startNotes,
        startOdometerKm: Number(startOdometerKm),
        startFuelLevel,
        startChecklist,
        occurrenceSeverity: startOccurrenceSeverity || null,
        occurrenceDescription: startOccurrenceDescription.trim() || '',
        startRequestKey: createRequestKey(),
      }, actor);
      setUseVehicle(null);
      refresh('Uso do veículo iniciado com sucesso.');
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingStart(false);
    }
  };

  const handleFinishUsage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!returnSession) return;
    if (!checklistComplete(endChecklist, returnChecklistItems)) {
      setFeedback({type: 'error', message: 'Confirme todo o checklist de devolução.'});
      return;
    }
    setSavingReturn(true);
    try {
      await finishVehicleUsage({
        sessionId: returnSession.id,
        endOdometerKm: Number(endOdometerKm),
        endFuelLevel,
        endChecklist,
        endNotes,
        finalVehicleStatus: endOccurrenceSeverity === 'IMPEDE_USO' ? 'INDISPONIVEL' : null,
        finishRequestKey: createRequestKey(),
        occurrenceSeverity: endOccurrenceSeverity || null,
        occurrenceDescription: endOccurrenceDescription.trim() || '',
      }, actor);
      setReturnSession(null);
      refresh('Veículo devolvido com sucesso.');
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingReturn(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900">Veículos</h1>
          <p className="mt-1 text-slate-500">Controle operacional da frota com retirada, devolução, quilometragem, finalidade e ocorrências.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => refresh()} className={secondaryButton}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      {feedback && (
        <div className={cn('rounded-[24px] border px-4 py-3 text-sm shadow-sm', feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>
          {feedback.message}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {label: 'Veículos cadastrados', value: String(summary.total), icon: CarFront},
          {label: 'Disponíveis', value: String(summary.available), icon: CheckCircle2},
          {label: 'Em uso agora', value: String(summary.inUse), icon: Truck},
          {label: 'Pedem atenção', value: String(summary.attention), icon: ShieldAlert},
        ].map((item) => (
          <div key={item.label} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">{item.label}</div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">{item.value}</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      {activeSessions.length > 0 && (
        <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5 text-brand-primary" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Em uso agora</h2>
              <p className="text-sm text-slate-500">Duração calculada no front-end a partir do horário oficial salvo no banco.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {activeSessions.map((session) => (
              <div key={session.id} className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Veículo</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{session.vehicle?.internalName || 'Veículo'}</div>
                    <div className="mt-1 text-sm text-slate-500">{session.purposeLabel}{session.quote?.environment ? ` · ${session.quote.environment}` : ''}</div>
                  </div>
                  <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                    {formatDuration(session.startedAt, null, nowMs)}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-600">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Motorista</div>
                    <div className="mt-1 font-medium text-slate-900">{session.employee?.displayName || session.employee?.name || 'Não identificado'}</div>
                  </div>
                  <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-600">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Saída</div>
                    <div className="mt-1 font-medium text-slate-900">{formatDateTime(session.startedAt)}</div>
                  </div>
                </div>
                {(canManage || myActiveSessionIds.has(session.id)) && (
                  <button type="button" className={cn(primaryButton, 'mt-4 w-full')} onClick={() => openReturnModal(session)}>
                    Devolver veículo
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-[32px] border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, placa, marca ou tipo..."
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {loading ? (
          <div className="col-span-full rounded-[32px] border border-slate-100 bg-white p-12 text-center text-slate-500 shadow-sm">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-primary" />
            <p className="mt-3">Carregando veículos...</p>
          </div>
        ) : overview.length === 0 ? (
          <div className="col-span-full rounded-[32px] border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
            Nenhum veículo encontrado.
          </div>
        ) : overview.map((item) => {
          const meta = statusMeta[item.vehicle.status];
          const canReturnThis = Boolean(item.currentSession && (canManage || myActiveSessionIds.has(item.currentSession.id)));
          const blockedToUse = ['MANUTENCAO', 'INDISPONIVEL', 'INATIVO', 'EM_USO'].includes(item.vehicle.status);
          return (
            <article key={item.vehicle.id} className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-brand-primary/10 text-brand-primary">
                  {imageVariantUrl(item.vehicle, 'thumbnail') ? (
                    <img src={imageVariantUrl(item.vehicle, 'thumbnail')} alt={item.vehicle.internalName} className="h-full w-full object-cover" />
                  ) : (
                    <Truck className="h-7 w-7" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{item.vehicle.internalName}</h2>
                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', meta.className)}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {[item.vehicle.brand, item.vehicle.model, item.vehicle.plate].filter(Boolean).join(' · ') || item.vehicle.vehicleType}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">KM atual</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{formatKm(item.vehicle.currentOdometerKm)}</div>
                  <div className="mt-2 text-sm text-slate-500">Mês: {item.monthUsageCount} uso(s) · {formatKm(item.monthDistanceKm)}</div>
                </div>
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Documentação</div>
                  <div className="mt-2 text-sm text-slate-700">Licenciamento: <strong>{formatDate(item.vehicle.registrationDueDate)}</strong></div>
                  <div className="mt-1 text-sm text-slate-700">Vencimento relevante: <strong>{formatDate(item.vehicle.relevantDueDate)}</strong></div>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                {item.currentSession ? (
                  <>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Uso ativo</div>
                    <div className="mt-2 text-sm text-slate-900">{item.currentSession.purposeLabel}{item.currentSession.clientNameSnapshot ? ` · ${item.currentSession.clientNameSnapshot}` : ''}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {item.currentSession.employee?.displayName || item.currentSession.employee?.name || 'Funcionário'} · saída {formatDateTime(item.currentSession.startedAt)}
                    </div>
                  </>
                ) : item.lastSession ? (
                  <>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Último uso</div>
                    <div className="mt-2 text-sm text-slate-900">{item.lastSession.purposeLabel}{item.lastSession.clientNameSnapshot ? ` · ${item.lastSession.clientNameSnapshot}` : ''}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {item.lastSession.employee?.displayName || item.lastSession.employee?.name || 'Funcionário'} · retorno {formatDateTime(item.lastSession.endedAt)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Histórico</div>
                    <div className="mt-2 text-sm text-slate-500">Ainda sem utilização registrada.</div>
                  </>
                )}
              </div>

              {item.openOccurrenceCount > 0 && (
                <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {item.openOccurrenceCount} ocorrência(s) crítica(s) registrada(s) neste mês.
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                {canUse && !blockedToUse && (
                  <button type="button" className={primaryButton} onClick={() => openStartModal(item)}>
                    <Plus className="h-4 w-4" />
                    Usar veículo
                  </button>
                )}
                {canReturnThis && item.currentSession && (
                  <button type="button" className={secondaryButton} onClick={() => openReturnModal(item.currentSession!)}>
                    Devolver veículo
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{canManage ? 'Histórico operacional da frota' : 'Seu histórico de usos'}</h2>
            <p className="text-sm text-slate-500">Registros preservados para cruzamentos futuros com funcionários, clientes e obras.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {historyLoading ? (
            <div className="py-8 text-center text-slate-500">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-primary" />
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Nenhum uso encontrado.
            </div>
          ) : history.map((session) => (
            <div key={session.id} className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {session.vehicle?.internalName || 'Veículo'} · {session.purposeLabel}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {session.employee?.displayName || session.employee?.name || 'Funcionário'}{session.quote?.environment ? ` · ${session.quote.environment}` : ''}{session.client?.name ? ` · ${session.client.name}` : session.clientNameSnapshot ? ` · ${session.clientNameSnapshot}` : ''}
                  </div>
                </div>
                <div className={cn('rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]', session.status === 'ATIVA' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600')}>
                  {session.status === 'ATIVA' ? 'Ativa' : 'Concluída'}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Saída</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(session.startedAt)}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Retorno</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(session.endedAt)}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">KM</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatKm(session.startOdometerKm)}{session.endOdometerKm != null ? ` → ${formatKm(session.endOdometerKm)}` : ''}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Percorrido</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{session.distanceKm != null ? formatKm(session.distanceKm) : formatDuration(session.startedAt, null, nowMs)}</div>
                </div>
              </div>
              {(session.occurrences || []).length > 0 && (
                <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Ocorrências</div>
                  <div className="mt-2 space-y-2">
                    {(session.occurrences || []).map((occurrence) => (
                      <div key={occurrence.id} className="text-sm text-amber-900">
                        {occurrence.severity} · {occurrence.description}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <details className="mt-4 rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <summary className="cursor-pointer font-medium text-slate-900">Ver checklists</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    {label: 'Saída', values: session.startChecklist},
                    {label: 'Devolução', values: session.endChecklist},
                  ].filter((item) => item.values).map((item) => (
                    <div key={item.label}>
                      <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {Object.entries(item.values || {}).map(([key, checked]) => (
                          <li key={key} className={checked ? 'text-emerald-700' : 'text-red-700'}>{checked ? '✓' : '✕'} {checklistLabel(key)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ))}
        </div>
      </section>

      <Modal title={useVehicle ? `Usar ${useVehicle.vehicle.internalName}` : 'Usar veículo'} open={Boolean(useVehicle)} onClose={() => setUseVehicle(null)} wide>
        {useVehicle && (
          <form className="space-y-5" onSubmit={handleStartUsage}>
            <div className="grid gap-4 md:grid-cols-2">
              {canManage && (
                <Field label="Funcionário" required>
                  <select className={inputClass} value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} required>
                    <option value="">Selecione</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.displayName} · {employee.role}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Finalidade" required>
                <select className={inputClass} value={selectedPurposeKey} onChange={(event) => setSelectedPurposeKey(event.target.value)} required>
                  <option value="">Selecione</option>
                  {purposes.map((purpose) => (
                    <option key={purpose.id} value={purpose.purposeKey}>{purpose.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="KM inicial" required>
                <input className={inputClass} type="number" min={useVehicle.vehicle.currentOdometerKm} value={startOdometerKm} onChange={(event) => setStartOdometerKm(event.target.value)} required />
              </Field>
              <Field label="Combustível" required>
                <select className={inputClass} value={startFuelLevel} onChange={(event) => setStartFuelLevel(event.target.value as VehicleFuelLevel)} required>
                  {fuelOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            {selectedPurpose?.requiresClientLink && (
              <section className="space-y-3 rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Cliente / obra vinculada</div>
                <input className={inputClass} value={referenceSearch} onChange={(event) => setReferenceSearch(event.target.value)} placeholder="Buscar cliente ou ambiente..." />
                <div className="space-y-2">
                  {referencesLoading ? (
                    <div className="text-sm text-slate-500">Buscando obras...</div>
                  ) : references.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn('w-full rounded-2xl border px-4 py-3 text-left text-sm transition', selectedQuoteId === item.id ? 'border-brand-primary bg-brand-primary/5 text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
                      onClick={() => {
                        setSelectedQuoteId(item.id);
                        setSelectedClientId(item.clientId);
                        setReferenceSearch(`${item.clientName} · ${item.environment}`);
                        setReferences([]);
                      }}
                    >
                      <div className="font-medium text-slate-900">{item.clientName}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{item.environment} · {item.status}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <Field label="Observação">
              <textarea className={textareaClass} value={startNotes} onChange={(event) => setStartNotes(event.target.value)} placeholder="Objetivo do deslocamento, recado interno, ponto de atenção..." />
            </Field>

            <section className="space-y-3 rounded-[24px] border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-brand-primary" />
                <div className="text-sm font-semibold text-slate-900">Checklist antes da saída</div>
              </div>
              <div className="grid gap-2">
                {startChecklistItems.map((item) => (
                  <label key={item.key} className="flex items-center gap-3 rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" checked={startChecklist[item.key]} onChange={(event) => setStartChecklist((current) => ({...current, [item.key]: event.target.checked}))} />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <div className="text-sm font-semibold text-amber-900">Existe problema / avaria?</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Severidade">
                  <select className={inputClass} value={startOccurrenceSeverity} onChange={(event) => setStartOccurrenceSeverity(event.target.value as VehicleOccurrenceSeverity | '')}>
                    <option value="">Sem ocorrência</option>
                    {occurrenceSeverityOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Descrição">
                <textarea className={textareaClass} value={startOccurrenceDescription} onChange={(event) => setStartOccurrenceDescription(event.target.value)} placeholder="Descreva a avaria ou observação visual, se houver." />
              </Field>
            </section>

            <section className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Resumo</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Veículo</div>
                  <div className="mt-1 font-medium text-slate-900">{useVehicle.vehicle.internalName}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Finalidade</div>
                  <div className="mt-1 font-medium text-slate-900">{selectedPurpose?.label || '-'}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Cliente / obra</div>
                  <div className="mt-1 font-medium text-slate-900">{referenceSearch || 'Não vinculado'}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">KM inicial</div>
                  <div className="mt-1 font-medium text-slate-900">{startOdometerKm || '-'}</div>
                </div>
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryButton} onClick={() => setUseVehicle(null)}>Cancelar</button>
              <button type="submit" className={primaryButton} disabled={savingStart}>
                {savingStart ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {startOccurrenceSeverity === 'IMPEDE_USO' ? 'Registrar impedimento' : 'Confirmar saída'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal title={returnSession ? `Devolver ${returnSession.vehicle?.internalName || 'veículo'}` : 'Devolver veículo'} open={Boolean(returnSession)} onClose={() => setReturnSession(null)} wide>
        {returnSession && (
          <form className="space-y-5" onSubmit={handleFinishUsage}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="KM final" required>
                <input className={inputClass} type="number" min={returnSession.startOdometerKm} value={endOdometerKm} onChange={(event) => setEndOdometerKm(event.target.value)} required />
              </Field>
              <Field label="Combustível na devolução" required>
                <select className={inputClass} value={endFuelLevel} onChange={(event) => setEndFuelLevel(event.target.value as VehicleFuelLevel)} required>
                  {fuelOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Observação">
              <textarea className={textareaClass} value={endNotes} onChange={(event) => setEndNotes(event.target.value)} placeholder="Ocorrência durante o uso, pendência, observação de entrega..." />
            </Field>

            <section className="space-y-3 rounded-[24px] border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-brand-primary" />
                <div className="text-sm font-semibold text-slate-900">Checklist de retorno</div>
              </div>
              <div className="grid gap-2">
                {returnChecklistItems.map((item) => (
                  <label key={item.key} className="flex items-center gap-3 rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" checked={endChecklist[item.key]} onChange={(event) => setEndChecklist((current) => ({...current, [item.key]: event.target.checked}))} />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <div className="text-sm font-semibold text-amber-900">Ocorrência durante o uso</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Severidade">
                  <select className={inputClass} value={endOccurrenceSeverity} onChange={(event) => setEndOccurrenceSeverity(event.target.value as VehicleOccurrenceSeverity | '')}>
                    <option value="">Sem ocorrência</option>
                    {occurrenceSeverityOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Descrição">
                <textarea className={textareaClass} value={endOccurrenceDescription} onChange={(event) => setEndOccurrenceDescription(event.target.value)} placeholder="Descreva qualquer problema identificado na devolução." />
              </Field>
            </section>

            <section className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Resumo do uso</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Veículo</div>
                  <div className="mt-1 font-medium text-slate-900">{returnSession.vehicle?.internalName || 'Veículo'}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Finalidade</div>
                  <div className="mt-1 font-medium text-slate-900">{returnSession.purposeLabel}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Saída</div>
                  <div className="mt-1 font-medium text-slate-900">{formatDateTime(returnSession.startedAt)}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white p-3 text-sm text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Tempo em uso</div>
                  <div className="mt-1 font-medium text-slate-900">{formatDuration(returnSession.startedAt, null, nowMs)}</div>
                </div>
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryButton} onClick={() => setReturnSession(null)}>Cancelar</button>
              <button type="submit" className={primaryButton} disabled={savingReturn}>
                {savingReturn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Devolver veículo
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
