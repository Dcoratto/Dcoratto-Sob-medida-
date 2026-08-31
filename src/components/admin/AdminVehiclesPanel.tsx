import React from 'react';
import {Link} from 'react-router-dom';
import {CarFront, FileClock, Loader2, Pencil, Plus, ShieldAlert, Truck, X} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {cn} from '../../lib/utils';
import {imageVariantUrl} from '../../lib/storage';
import {createVehicleDraft, listVehicleOperationalOverview, saveVehicle, type VehicleActor, type VehicleDraft} from '../../lib/vehicleFleet';
import type {VehicleOperationalOverview} from '../../types';

type Feedback = {type: 'success' | 'error'; message: string} | null;

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 disabled:bg-slate-100';
const textareaClass = 'min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20';
const primaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-medium text-[#3F3A34] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const statusOptions = [
  {value: 'DISPONIVEL', label: 'Disponível'},
  {value: 'EM_USO', label: 'Em uso'},
  {value: 'MANUTENCAO', label: 'Manutenção'},
  {value: 'INDISPONIVEL', label: 'Indisponível'},
  {value: 'INATIVO', label: 'Inativo'},
] as const;

const statusMeta = {
  DISPONIVEL: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  EM_USO: 'border-blue-200 bg-blue-50 text-blue-700',
  MANUTENCAO: 'border-amber-200 bg-amber-50 text-amber-700',
  INDISPONIVEL: 'border-red-200 bg-red-50 text-red-700',
  INATIVO: 'border-slate-200 bg-slate-100 text-slate-600',
} as const;

const formatKm = (value?: number | null) => `${new Intl.NumberFormat('pt-BR').format(Number(value) || 0)} km`;
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';
const formatDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-';

const Field: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{label}</span>
    {children}
  </label>
);

const Modal: React.FC<{title: string; open: boolean; onClose: () => void; children: React.ReactNode}> = ({title, open, onClose, children}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Fechar" />
      <div className="relative max-h-[94svh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-3xl sm:rounded-[28px]">
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

export const AdminVehiclesPanel: React.FC = () => {
  const {accessUser, profile, user} = useAuth();
  const actor = React.useMemo<VehicleActor>(() => ({
    uid: accessUser?.uid || user?.id || '',
    name: accessUser?.nome || profile?.name || user?.email?.split('@')[0] || 'Usuário',
    empresaId: accessUser?.empresaId || profile?.empresaId,
  }), [accessUser, profile, user]);

  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VehicleOperationalOverview | null>(null);
  const [draft, setDraft] = React.useState<VehicleDraft>(() => createVehicleDraft());
  const [items, setItems] = React.useState<VehicleOperationalOverview[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listVehicleOperationalOverview(''));
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setDraft(createVehicleDraft());
    setModalOpen(true);
  };

  const openEdit = (item: VehicleOperationalOverview) => {
    setEditing(item);
    setDraft(createVehicleDraft(item.vehicle));
    setModalOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveVehicle(draft, actor);
      setModalOpen(false);
      setFeedback({type: 'success', message: editing ? 'Veículo atualizado.' : 'Veículo cadastrado.'});
      await load();
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSaving(false);
    }
  };

  const summary = React.useMemo(() => ({
    total: items.length,
    available: items.filter((item) => item.vehicle.status === 'DISPONIVEL').length,
    inUse: items.filter((item) => item.vehicle.status === 'EM_USO').length,
    docsDue: items.filter((item) => item.vehicle.registrationDueDate || item.vehicle.relevantDueDate).length,
  }), [items]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">Veículos</h3>
          <p className="mt-1 text-sm text-slate-500">Cadastre a frota, acompanhe status, quilometragem e documentação sem criar cadastro paralelo.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/vehicles" className={secondaryButton}>Abrir portal operacional</Link>
          <button type="button" className={primaryButton} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo veículo
          </button>
        </div>
      </div>

      {feedback && (
        <div className={cn('rounded-[24px] border px-4 py-3 text-sm', feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>
          {feedback.message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {label: 'Frota cadastrada', value: String(summary.total), icon: CarFront},
          {label: 'Disponíveis', value: String(summary.available), icon: Truck},
          {label: 'Em uso', value: String(summary.inUse), icon: ShieldAlert},
          {label: 'Com vencimentos', value: String(summary.docsDue), icon: FileClock},
        ].map((item) => (
          <div key={item.label} className="rounded-[28px] border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
                <div className="mt-3 text-2xl font-semibold text-slate-900">{item.value}</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-[28px] border border-slate-100 bg-white p-10 text-center text-slate-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-primary" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <article key={item.vehicle.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
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
                    <h4 className="text-lg font-semibold text-slate-900">{item.vehicle.internalName}</h4>
                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', statusMeta[item.vehicle.status])}>
                      {statusOptions.find((option) => option.value === item.vehicle.status)?.label || item.vehicle.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{[item.vehicle.brand, item.vehicle.model, item.vehicle.plate].filter(Boolean).join(' · ') || item.vehicle.vehicleType}</p>
                </div>
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100" onClick={() => openEdit(item)} aria-label={`Editar ${item.vehicle.internalName}`}>
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">KM atual</div>
                  <div className="mt-1 font-semibold text-slate-900">{formatKm(item.vehicle.currentOdometerKm)}</div>
                  <div className="mt-2 text-xs text-slate-500">Mês: {item.monthUsageCount} uso(s) · {formatKm(item.monthDistanceKm)}</div>
                </div>
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Documentação</div>
                  <div className="mt-1">Licenciamento: <strong className="text-slate-900">{formatDate(item.vehicle.registrationDueDate)}</strong></div>
                  <div className="mt-1">Vencimento: <strong className="text-slate-900">{formatDate(item.vehicle.relevantDueDate)}</strong></div>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                {item.currentSession ? (
                  <>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Em uso agora</div>
                    <div className="mt-1 font-semibold text-slate-900">{item.currentSession.employee?.displayName || item.currentSession.employee?.name || 'Funcionário'}</div>
                    <div className="mt-1">{item.currentSession.purposeLabel}{item.currentSession.clientNameSnapshot ? ` · ${item.currentSession.clientNameSnapshot}` : ''}</div>
                    <div className="mt-1 text-xs text-slate-500">Saída: {formatDateTime(item.currentSession.startedAt)}</div>
                  </>
                ) : item.lastSession ? (
                  <>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Último uso</div>
                    <div className="mt-1 font-semibold text-slate-900">{item.lastSession.employee?.displayName || item.lastSession.employee?.name || 'Funcionário'}</div>
                    <div className="mt-1">{item.lastSession.purposeLabel}{item.lastSession.clientNameSnapshot ? ` · ${item.lastSession.clientNameSnapshot}` : ''}</div>
                    <div className="mt-1 text-xs text-slate-500">Retorno: {formatDateTime(item.lastSession.endedAt)}</div>
                  </>
                ) : (
                  <>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Uso operacional</div>
                    <div className="mt-1">Sem uso registrado ainda.</div>
                  </>
                )}
              </div>

              {item.openOccurrenceCount > 0 && (
                <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {item.openOccurrenceCount} ocorrência(s) crítica(s) registrada(s) no mês.
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <Modal title={editing ? `Editar ${editing.vehicle.internalName}` : 'Novo veículo'} open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="space-y-5" onSubmit={handleSave}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome interno">
              <input className={inputClass} value={draft.internalName} onChange={(event) => setDraft((current) => ({...current, internalName: event.target.value}))} required />
            </Field>
            <Field label="Tipo do veículo">
              <input className={inputClass} value={draft.vehicleType} onChange={(event) => setDraft((current) => ({...current, vehicleType: event.target.value}))} required />
            </Field>
            <Field label="Marca">
              <input className={inputClass} value={draft.brand} onChange={(event) => setDraft((current) => ({...current, brand: event.target.value}))} />
            </Field>
            <Field label="Modelo">
              <input className={inputClass} value={draft.model} onChange={(event) => setDraft((current) => ({...current, model: event.target.value}))} />
            </Field>
            <Field label="Placa">
              <input className={inputClass} value={draft.plate} onChange={(event) => setDraft((current) => ({...current, plate: event.target.value.toUpperCase()}))} />
            </Field>
            <Field label="Ano">
              <input className={inputClass} type="number" min="1980" max="2100" value={draft.year} onChange={(event) => setDraft((current) => ({...current, year: event.target.value}))} />
            </Field>
            <Field label="Status">
              <select className={inputClass} value={draft.status} onChange={(event) => setDraft((current) => ({...current, status: event.target.value as VehicleDraft['status']}))}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Quilometragem atual">
              <input className={inputClass} type="number" min="0" value={draft.currentOdometerKm} onChange={(event) => setDraft((current) => ({...current, currentOdometerKm: event.target.value}))} required />
            </Field>
            <Field label="Licenciamento">
              <input className={inputClass} type="date" value={draft.registrationDueDate} onChange={(event) => setDraft((current) => ({...current, registrationDueDate: event.target.value}))} />
            </Field>
            <Field label="Vencimento relevante">
              <input className={inputClass} type="date" value={draft.relevantDueDate} onChange={(event) => setDraft((current) => ({...current, relevantDueDate: event.target.value}))} />
            </Field>
          </div>
          <Field label="Observação documental">
            <textarea className={textareaClass} value={draft.documentationNotes} onChange={(event) => setDraft((current) => ({...current, documentationNotes: event.target.value}))} />
          </Field>
          <Field label="Observações">
            <textarea className={textareaClass} value={draft.notes} onChange={(event) => setDraft((current) => ({...current, notes: event.target.value}))} />
          </Field>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className={secondaryButton} onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" className={primaryButton} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar veículo
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
};
