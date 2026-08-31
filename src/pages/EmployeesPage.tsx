import React from 'react';
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Coffee,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCcw,
  Save,
  Search,
  TimerReset,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {cn} from '../lib/utils';
import {deleteObject, getDownloadURL, imageVariantUrl, ref as storageRef, storage, storagePath, uploadDataUrl} from '../lib/storage';
import {optimizeImageFile} from '../lib/imageUtils';
import {
  finishEmployeeActivity,
  listActivityTargets,
  listEmployeeActivityHistory,
  listEmployeeAttendanceHistory,
  listEmployeeFunctionCatalog,
  listEmployeeOperationalOverview,
  listEmployeeSchedules,
  pauseEmployeeActivity,
  resumeEmployeeActivity,
  saveEmployeeAttendance,
  saveEmployeeProfile,
  startEmployeeActivity,
  type EmployeeActivityTarget,
  type EmployeeFunctionCatalogItem,
  type EmployeeProfileDraft,
  type WorkforceActor,
} from '../lib/employeeWorkforce';
import type {
  Employee,
  EmployeeActivitySession,
  EmployeeAttendanceRecord,
  EmployeeFunction,
  EmployeeOperationalOverview,
  EmployeeStatus,
  EmployeeWorkSchedule,
} from '../types';

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 disabled:bg-slate-100';
const textareaClass = 'min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20';
const primaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-medium text-[#3F3A34] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const statusOptions: Array<{value: EmployeeStatus; label: string}> = [
  {value: 'ATIVO', label: 'Ativo'},
  {value: 'INATIVO', label: 'Inativo'},
  {value: 'FERIAS', label: 'Férias'},
  {value: 'AFASTADO', label: 'Afastado'},
];
const attendanceStatusOptions: Array<{value: EmployeeAttendanceRecord['status']; label: string}> = [
  {value: 'PRESENTE', label: 'Presente'},
  {value: 'AUSENTE', label: 'Ausente'},
  {value: 'FOLGA', label: 'Folga'},
  {value: 'FERIAS', label: 'Férias'},
  {value: 'AFASTADO', label: 'Afastado'},
];
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type Feedback = {type: 'success' | 'error'; message: string} | null;
type HistoryPeriod = 'today' | 'week' | 'month' | 'custom';

const formatMinutes = (value: number) => {
  const total = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}`;
};

const formatClock = (value?: string | null) => value ? new Date(value).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : '--:--';
const formatDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-';
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';

const toDateInputValue = (value?: string | null) => value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10);

const toLocalDateTimeInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (item: number) => String(item).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromLocalDateTimeInput = (value: string) => value ? new Date(value).toISOString() : null;

const defaultSchedule = () => weekdays.map((_, weekday) => ({
  weekday,
  isWorkingDay: weekday >= 1 && weekday <= 5,
  startTime: weekday >= 1 && weekday <= 5 ? '08:00' : '',
  endTime: weekday >= 1 && weekday <= 5 ? '17:00' : '',
  breakMinutes: 60,
  notes: '',
}));

const createEmployeeDraft = (catalog: EmployeeFunctionCatalogItem[], employee?: Employee, functions: EmployeeFunction[] = [], schedules: EmployeeWorkSchedule[] = []): EmployeeProfileDraft => {
  const primaryAssignedFunction = functions.find((item) => item.isPrimary) || functions[0];
  const fallbackCatalogFunction = catalog.find((item) => item.label === employee?.role) || catalog[0];
  const primaryLabel = primaryAssignedFunction?.functionLabel || fallbackCatalogFunction?.label || '';

  return {
    id: employee?.id,
    name: employee?.name || '',
    displayName: employee?.displayName || '',
    role: employee?.role || primaryLabel,
    status: employee?.status || (employee?.active === false ? 'INATIVO' : 'ATIVO'),
    admissionDate: employee?.admissionDate || '',
    phone: employee?.phone || '',
    notes: employee?.notes || '',
    photoUrl: employee?.photoUrl || '',
    thumbnailUrl: employee?.thumbnailUrl || '',
    mediumUrl: employee?.mediumUrl || '',
    originalUrl: employee?.originalUrl || '',
    functions: functions.length > 0
      ? functions.map((item) => ({
        functionKey: String(item.functionKey),
        functionLabel: item.functionLabel,
        linkedProductionStep: item.linkedProductionStep || null,
        isPrimary: Boolean(item.isPrimary),
      }))
      : fallbackCatalogFunction ? [{
        functionKey: fallbackCatalogFunction.key,
        functionLabel: fallbackCatalogFunction.label,
        linkedProductionStep: fallbackCatalogFunction.linkedProductionStep || null,
        isPrimary: true,
      }] : [],
    schedule: weekdays.map((_, weekday) => {
      const existing = schedules.find((item) => item.weekday === weekday);
      return existing ? {
        weekday,
        isWorkingDay: existing.isWorkingDay,
        startTime: existing.startTime || '',
        endTime: existing.endTime || '',
        breakMinutes: existing.breakMinutes || 0,
        notes: existing.notes || '',
      } : defaultSchedule()[weekday];
    }),
  };
};

const resolveOperationalStatus = (item: EmployeeOperationalOverview) => {
  if (item.employee.status === 'FERIAS') return {label: 'Férias', className: 'border-sky-200 bg-sky-50 text-sky-700'};
  if (item.employee.status === 'AFASTADO') return {label: 'Afastado', className: 'border-red-200 bg-red-50 text-red-700'};
  if (item.employee.status === 'INATIVO') return {label: 'Inativo', className: 'border-slate-200 bg-slate-100 text-slate-600'};
  if (item.currentSession?.status === 'PAUSADA') return {label: 'Pausado', className: 'border-amber-200 bg-amber-50 text-amber-700'};
  if (item.currentSession?.status === 'ATIVA') return {label: 'Trabalhando', className: 'border-emerald-200 bg-emerald-50 text-emerald-700'};
  if (item.attendanceToday?.status === 'AUSENTE') return {label: 'Ausente', className: 'border-rose-200 bg-rose-50 text-rose-700'};
  if (item.attendanceToday?.status === 'FOLGA') return {label: 'Folga', className: 'border-indigo-200 bg-indigo-50 text-indigo-700'};
  return {label: 'Sem atividade', className: 'border-slate-200 bg-slate-50 text-slate-600'};
};

const runtimeActivityMinutes = (session: EmployeeActivitySession | null, nowMs: number) => {
  if (!session) return 0;
  const started = new Date(session.startedAt).getTime();
  const ended = session.endedAt ? new Date(session.endedAt).getTime() : nowMs;
  const activePause = session.activePauseStartedAt && !session.endedAt ? Math.max(0, nowMs - new Date(session.activePauseStartedAt).getTime()) : 0;
  const totalSeconds = Math.max(0, Math.floor((ended - started) / 1000) - (session.pausedTotalSeconds || 0) - Math.floor(activePause / 1000));
  return Math.floor(totalSeconds / 60);
};

const Field: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{label}</span>
    {children}
  </label>
);

const Modal: React.FC<{title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean}> = ({title, open, onClose, children, wide}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Fechar" />
      <div className={cn('relative max-h-[94svh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]', wide ? 'sm:max-w-5xl' : 'sm:max-w-2xl')}>
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

export const EmployeesPage: React.FC = () => {
  const {accessUser, profile, user, hasPermission} = useAuth();
  const actor = React.useMemo<WorkforceActor>(() => ({
    uid: accessUser?.uid || user?.id || '',
    name: accessUser?.nome || profile?.name || user?.email?.split('@')[0] || 'Usuário',
  }), [accessUser, profile, user]);
  const canManage = hasPermission('funcionarios', 'cadastrar') || hasPermission('funcionarios', 'editar');
  const canTrack = hasPermission('funcionarios', 'apontar');
  const canManageSchedule = hasPermission('funcionarios', 'jornada');

  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [search, setSearch] = React.useState('');
  const deferredSearch = React.useDeferredValue(search);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [nowMs, setNowMs] = React.useState(Date.now());

  const [overview, setOverview] = React.useState<EmployeeOperationalOverview[]>([]);
  const [catalog, setCatalog] = React.useState<EmployeeFunctionCatalogItem[]>([]);

  const [employeeModalOpen, setEmployeeModalOpen] = React.useState(false);
  const [employeeDraft, setEmployeeDraft] = React.useState<EmployeeProfileDraft>(() => createEmployeeDraft([]));
  const [employeePhotoFile, setEmployeePhotoFile] = React.useState<File | null>(null);
  const [employeePhotoPreview, setEmployeePhotoPreview] = React.useState('');
  const [savingEmployee, setSavingEmployee] = React.useState(false);

  const [attendanceModalEmployee, setAttendanceModalEmployee] = React.useState<EmployeeOperationalOverview | null>(null);
  const [attendanceDraft, setAttendanceDraft] = React.useState({
    workDate: toDateInputValue(),
    status: 'PRESENTE' as EmployeeAttendanceRecord['status'],
    checkInAt: '',
    breakStartAt: '',
    breakEndAt: '',
    checkOutAt: '',
    notes: '',
  });
  const [savingAttendance, setSavingAttendance] = React.useState(false);

  const [activityModalEmployee, setActivityModalEmployee] = React.useState<EmployeeOperationalOverview | null>(null);
  const [activityDraft, setActivityDraft] = React.useState({
    quoteSearch: '',
    quoteId: '',
    functionKey: '',
    pieceId: '',
    notes: '',
  });
  const [activityTargets, setActivityTargets] = React.useState<EmployeeActivityTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = React.useState(false);
  const [savingActivity, setSavingActivity] = React.useState(false);

  const [detailEmployee, setDetailEmployee] = React.useState<EmployeeOperationalOverview | null>(null);
  const [detailSchedules, setDetailSchedules] = React.useState<EmployeeWorkSchedule[]>([]);
  const [detailAttendance, setDetailAttendance] = React.useState<EmployeeAttendanceRecord[]>([]);
  const [detailHistory, setDetailHistory] = React.useState<EmployeeActivitySession[]>([]);
  const [detailHistoryLoading, setDetailHistoryLoading] = React.useState(false);
  const [historyPeriod, setHistoryPeriod] = React.useState<HistoryPeriod>('month');
  const [historyCustomFrom, setHistoryCustomFrom] = React.useState('');
  const [historyCustomTo, setHistoryCustomTo] = React.useState('');
  const [historyClientId, setHistoryClientId] = React.useState('');
  const [historyFunctionKey, setHistoryFunctionKey] = React.useState('');
  const overviewRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const loadOverview = React.useCallback(async () => {
    const requestId = ++overviewRequestIdRef.current;
    setLoading(true);
    try {
      const [nextOverview, nextCatalog] = await Promise.all([
        listEmployeeOperationalOverview(deferredSearch),
        listEmployeeFunctionCatalog(),
      ]);
      if (requestId !== overviewRequestIdRef.current) return;
      setOverview(nextOverview);
      setCatalog(nextCatalog);
      setFeedback(null);
    } catch (error) {
      if (requestId !== overviewRequestIdRef.current) return;
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      if (requestId !== overviewRequestIdRef.current) return;
      setLoading(false);
    }
  }, [deferredSearch]);

  React.useEffect(() => {
    void loadOverview();
  }, [loadOverview, refreshKey]);

  const reloadDetail = React.useCallback(async (employeeId: string, period = historyPeriod, clientId = historyClientId, functionKey = historyFunctionKey, customFrom = historyCustomFrom, customTo = historyCustomTo) => {
    if (!employeeId) return;
    setDetailHistoryLoading(true);
    try {
      const dateRange = (() => {
        const now = new Date();
        if (period === 'today') {
          const value = now.toISOString().slice(0, 10);
          return {from: value, to: value};
        }
        if (period === 'week') {
          const start = new Date(now);
          start.setDate(now.getDate() - 6);
          return {from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10)};
        }
        if (period === 'month') {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          return {from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10)};
        }
        return {from: customFrom || '', to: customTo || ''};
      })();

      const [schedules, attendance, history] = await Promise.all([
        listEmployeeSchedules(employeeId),
        listEmployeeAttendanceHistory(employeeId),
        listEmployeeActivityHistory({
          employeeId,
          dateFrom: dateRange.from || undefined,
          dateTo: dateRange.to || undefined,
          clientId: clientId || undefined,
          functionKey: functionKey || undefined,
        }),
      ]);
      setDetailSchedules(schedules);
      setDetailAttendance(attendance);
      setDetailHistory(history);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setDetailHistoryLoading(false);
    }
  }, [historyClientId, historyCustomFrom, historyCustomTo, historyFunctionKey, historyPeriod]);

  React.useEffect(() => {
    if (!detailEmployee) return;
    void reloadDetail(detailEmployee.employee.id);
  }, [detailEmployee, reloadDetail]);

  const summary = React.useMemo(() => ({
    total: overview.length,
    activeNow: overview.filter((item) => item.currentSession?.status === 'ATIVA').length,
    paused: overview.filter((item) => item.currentSession?.status === 'PAUSADA').length,
    absent: overview.filter((item) => item.employee.status === 'AFASTADO' || item.attendanceToday?.status === 'AUSENTE').length,
    productiveMinutes: overview.reduce((sum, item) => sum + item.today.productiveMinutes, 0),
  }), [overview]);

  const openCreateEmployee = () => {
    setEmployeeDraft(createEmployeeDraft(catalog));
    setEmployeePhotoFile(null);
    setEmployeePhotoPreview('');
    setEmployeeModalOpen(true);
  };

  const openEditEmployee = async (item: EmployeeOperationalOverview) => {
    try {
      const schedules = await listEmployeeSchedules(item.employee.id);
      setEmployeeDraft(createEmployeeDraft(catalog, item.employee, item.functions, schedules));
      setEmployeePhotoFile(null);
      setEmployeePhotoPreview(item.employee.photoUrl || '');
      setEmployeeModalOpen(true);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    }
  };

  const handleEmployeePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFeedback({type: 'error', message: 'Use apenas imagens JPG, PNG ou WEBP.'});
      return;
    }
    if (file.size > 1024 * 1024) {
      setFeedback({type: 'error', message: 'A foto deve ter no máximo 1MB.'});
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setEmployeePhotoPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
    setEmployeePhotoFile(file);
  };

  const uploadEmployeePhoto = async (file: File, employeeIdHint: string) => {
    const optimized = await optimizeImageFile(file, {maxBytes: 600 * 1024, maxSide: 720, mimeType: 'image/webp'});
    const targetPath = storagePath('employees', employeeIdHint, `photo-${Date.now()}.webp`);
    const reference = storageRef(storage, targetPath);
    await uploadDataUrl(reference, optimized);
    return getDownloadURL(reference);
  };

  const handleSaveEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeDraft.name.trim()) {
      setFeedback({type: 'error', message: 'Informe o nome completo do funcionário.'});
      return;
    }
    if (employeeDraft.functions.length === 0) {
      setFeedback({type: 'error', message: 'Selecione ao menos uma função para o funcionário.'});
      return;
    }
    setSavingEmployee(true);
    try {
      let nextPhotoUrl = employeeDraft.photoUrl;
      if (employeePhotoFile) {
        nextPhotoUrl = await uploadEmployeePhoto(employeePhotoFile, employeeDraft.id || actor.uid || 'novo-funcionario');
      }

      const employeeId = await saveEmployeeProfile({
        ...employeeDraft,
        role: employeeDraft.role || employeeDraft.functions.find((item) => item.isPrimary)?.functionLabel || employeeDraft.functions[0]?.functionLabel || 'Outros',
        photoUrl: nextPhotoUrl,
        thumbnailUrl: nextPhotoUrl,
        mediumUrl: nextPhotoUrl,
        originalUrl: nextPhotoUrl,
      }, actor);

      if (employeePhotoFile && employeeDraft.photoUrl && employeeDraft.photoUrl !== nextPhotoUrl) {
        try {
          await deleteObject(storageRef(storage, employeeDraft.photoUrl));
        } catch {
          // Mantemos a foto antiga caso a limpeza não seja possível.
        }
      }

      setEmployeeModalOpen(false);
      setEmployeePhotoFile(null);
      setEmployeePhotoPreview('');
      setFeedback({type: 'success', message: employeeDraft.id ? 'Funcionário atualizado.' : 'Funcionário cadastrado.'});
      setRefreshKey((value) => value + 1);
      if (detailEmployee?.employee.id === employeeId) {
        const refreshed = await listEmployeeOperationalOverview('');
        const match = refreshed.find((item) => item.employee.id === employeeId) || null;
        setDetailEmployee(match);
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingEmployee(false);
    }
  };

  const openAttendanceModal = (item: EmployeeOperationalOverview) => {
    const record = item.attendanceToday;
    setAttendanceModalEmployee(item);
    setAttendanceDraft({
      workDate: toDateInputValue(record?.workDate),
      status: record?.status || 'PRESENTE',
      checkInAt: toLocalDateTimeInput(record?.checkInAt),
      breakStartAt: toLocalDateTimeInput(record?.breakStartAt),
      breakEndAt: toLocalDateTimeInput(record?.breakEndAt),
      checkOutAt: toLocalDateTimeInput(record?.checkOutAt),
      notes: record?.notes || '',
    });
  };

  const handleSaveAttendance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!attendanceModalEmployee) return;
    setSavingAttendance(true);
    try {
      await saveEmployeeAttendance({
        employeeId: attendanceModalEmployee.employee.id,
        workDate: attendanceDraft.workDate,
        status: attendanceDraft.status,
        checkInAt: fromLocalDateTimeInput(attendanceDraft.checkInAt),
        breakStartAt: fromLocalDateTimeInput(attendanceDraft.breakStartAt),
        breakEndAt: fromLocalDateTimeInput(attendanceDraft.breakEndAt),
        checkOutAt: fromLocalDateTimeInput(attendanceDraft.checkOutAt),
        notes: attendanceDraft.notes,
      }, actor);
      setAttendanceModalEmployee(null);
      setFeedback({type: 'success', message: 'Jornada atualizada.'});
      setRefreshKey((value) => value + 1);
      if (detailEmployee?.employee.id === attendanceModalEmployee.employee.id) {
        await reloadDetail(attendanceModalEmployee.employee.id);
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingAttendance(false);
    }
  };

  const loadTargets = React.useCallback(async (value: string) => {
    setLoadingTargets(true);
    try {
      const result = await listActivityTargets(value);
      setActivityTargets(result);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  const openActivityModal = (item: EmployeeOperationalOverview) => {
    setActivityModalEmployee(item);
    setActivityDraft({
      quoteSearch: '',
      quoteId: '',
      functionKey: item.functions.find((entry) => entry.isPrimary)?.functionKey?.toString() || catalog[0]?.key || '',
      pieceId: '',
      notes: '',
    });
    void loadTargets('');
  };

  const handleStartActivity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activityModalEmployee) return;
    const target = activityTargets.find((item) => item.id === activityDraft.quoteId);
    if (!target) {
      setFeedback({type: 'error', message: 'Selecione a obra vinculada antes de iniciar.'});
      return;
    }
    if (!activityDraft.functionKey) {
      setFeedback({type: 'error', message: 'Selecione a etapa ou função da atividade.'});
      return;
    }
    setSavingActivity(true);
    try {
      const piece = target.pieces.find((item) => item.id === activityDraft.pieceId);
      await startEmployeeActivity({
        employeeId: activityModalEmployee.employee.id,
        clientId: target.clientId,
        quoteId: target.id,
        functionKey: activityDraft.functionKey,
        pieceId: piece?.id,
        pieceLabel: piece?.label,
        notes: activityDraft.notes,
      }, actor);
      setActivityModalEmployee(null);
      setFeedback({type: 'success', message: 'Atividade iniciada.'});
      setRefreshKey((value) => value + 1);
      if (detailEmployee?.employee.id === activityModalEmployee.employee.id) {
        await reloadDetail(activityModalEmployee.employee.id);
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingActivity(false);
    }
  };

  const handlePauseActivity = async (item: EmployeeOperationalOverview) => {
    if (!item.currentSession) return;
    try {
      await pauseEmployeeActivity(item.currentSession.id, actor);
      setFeedback({type: 'success', message: 'Atividade pausada.'});
      setRefreshKey((value) => value + 1);
      if (detailEmployee?.employee.id === item.employee.id) {
        await reloadDetail(item.employee.id);
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    }
  };

  const handleResumeActivity = async (item: EmployeeOperationalOverview) => {
    if (!item.currentSession) return;
    try {
      await resumeEmployeeActivity(item.currentSession.id, actor);
      setFeedback({type: 'success', message: 'Atividade retomada.'});
      setRefreshKey((value) => value + 1);
      if (detailEmployee?.employee.id === item.employee.id) {
        await reloadDetail(item.employee.id);
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    }
  };

  const handleFinishActivity = async (item: EmployeeOperationalOverview) => {
    if (!item.currentSession) return;
    const completionNotes = window.prompt('Observação final da atividade (opcional):', '') || '';
    try {
      await finishEmployeeActivity(item.currentSession.id, actor, completionNotes);
      setFeedback({type: 'success', message: 'Atividade finalizada.'});
      setRefreshKey((value) => value + 1);
      if (detailEmployee?.employee.id === item.employee.id) {
        await reloadDetail(item.employee.id);
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    }
  };

  const detailClientOptions = React.useMemo(() => {
    const map = new Map<string, {id: string; label: string}>();
    detailHistory.forEach((item) => {
      const id = item.clientId || '';
      const label = item.client?.name || item.quote?.clientName || '';
      if (id && label && !map.has(id)) map.set(id, {id, label});
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [detailHistory]);

  const activeActivityTarget = React.useMemo(
    () => activityTargets.find((item) => item.id === activityDraft.quoteId) || null,
    [activityDraft.quoteId, activityTargets],
  );

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900">Funcionários</h1>
          <p className="mt-1 max-w-3xl text-slate-500">Cadastro, jornada, presença e apontamento operacional da equipe com base pronta para produtividade, horas trabalhadas e custos futuros.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
          {canManage && (
            <button type="button" className={primaryButton} onClick={openCreateEmployee}>
              <Plus className="h-4 w-4" />
              Novo funcionário
            </button>
          )}
        </div>
      </header>

      {feedback && (
        <div className={cn(
          'rounded-2xl border px-4 py-3 text-sm',
          feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700',
        )}>
          {feedback.message}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {label: 'Equipe cadastrada', value: String(summary.total), icon: Users},
          {label: 'Trabalhando agora', value: String(summary.activeNow), icon: PlayCircle},
          {label: 'Pausados', value: String(summary.paused), icon: PauseCircle},
          {label: 'Tempo produtivo hoje', value: formatMinutes(summary.productiveMinutes), icon: Clock3},
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

      <section className="rounded-[32px] border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, apelido ou função..."
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full rounded-[32px] border border-slate-100 bg-white p-12 text-center text-slate-500 shadow-sm">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-primary" />
            <p className="mt-3">Carregando funcionários...</p>
          </div>
        ) : overview.length === 0 ? (
          <div className="col-span-full rounded-[32px] border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
            Nenhum funcionário encontrado.
          </div>
        ) : overview.map((item) => {
          const currentStatus = resolveOperationalStatus(item);
          const activityMinutes = runtimeActivityMinutes(item.currentSession, nowMs);
          return (
            <article key={item.employee.id} className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-brand-primary/10 text-brand-primary">
                  {imageVariantUrl(item.employee, 'thumbnail') ? (
                    <img src={imageVariantUrl(item.employee, 'thumbnail')} alt={item.employee.displayName || item.employee.name} className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-7 w-7" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{item.employee.displayName || item.employee.name}</h2>
                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', currentStatus.className)}>
                      {currentStatus.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{item.employee.name}{item.employee.role ? ` · ${item.employee.role}` : ''}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.functions.slice(0, 4).map((entry) => (
                      <span key={entry.id} className={cn(
                        'inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium',
                        entry.isPrimary ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600',
                      )}>
                        {entry.functionLabel}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Hoje</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="block text-slate-400">Trabalhadas</span><strong className="text-slate-900">{formatMinutes(item.today.workedMinutes)}</strong></div>
                    <div><span className="block text-slate-400">Produtivas</span><strong className="text-slate-900">{formatMinutes(item.today.productiveMinutes)}</strong></div>
                    <div><span className="block text-slate-400">Sem atividade</span><strong className="text-slate-900">{formatMinutes(item.today.idleMinutes)}</strong></div>
                    <div><span className="block text-slate-400">Extras</span><strong className="text-slate-900">{formatMinutes(item.today.overtimeMinutes)}</strong></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Atividade atual</div>
                  {item.currentSession ? (
                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                      <div className="font-semibold text-slate-900">{item.currentSession.functionLabel}</div>
                      <div>{item.currentSession.client?.name || item.currentSession.quote?.clientName || 'Cliente não informado'}</div>
                      <div>{item.currentSession.pieceLabel || item.currentSession.quote?.environment || 'Sem peça específica'}</div>
                      <div>Iniciado às {formatClock(item.currentSession.startedAt)} · {formatMinutes(activityMinutes)}</div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-500">Sem atividade registrada agora.</div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className={secondaryButton} onClick={() => setDetailEmployee(item)}>Detalhes</button>
                {canManage && <button type="button" className={secondaryButton} onClick={() => void openEditEmployee(item)}>Editar</button>}
                {canManageSchedule && <button type="button" className={secondaryButton} onClick={() => openAttendanceModal(item)}><CalendarClock className="h-4 w-4" /> Jornada</button>}
                {canTrack && !item.currentSession && item.employee.status === 'ATIVO' && <button type="button" className={primaryButton} onClick={() => openActivityModal(item)}><PlayCircle className="h-4 w-4" /> Iniciar</button>}
                {canTrack && item.currentSession?.status === 'ATIVA' && <button type="button" className={secondaryButton} onClick={() => void handlePauseActivity(item)}><PauseCircle className="h-4 w-4" /> Pausar</button>}
                {canTrack && item.currentSession?.status === 'PAUSADA' && <button type="button" className={secondaryButton} onClick={() => void handleResumeActivity(item)}><TimerReset className="h-4 w-4" /> Retomar</button>}
                {canTrack && item.currentSession && <button type="button" className={primaryButton} onClick={() => void handleFinishActivity(item)}><CheckCircle2 className="h-4 w-4" /> Finalizar</button>}
              </div>
            </article>
          );
        })}
      </section>

      <Modal title={employeeDraft.id ? 'Editar funcionário' : 'Novo funcionário'} open={employeeModalOpen} onClose={() => setEmployeeModalOpen(false)} wide>
        <form onSubmit={handleSaveEmployee} className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-[220px,1fr]">
            <div className="rounded-[28px] border border-slate-100 bg-slate-50 p-5">
              <div className="mx-auto flex h-36 w-36 items-center justify-center overflow-hidden rounded-[28px] bg-white text-brand-primary shadow-sm">
                {employeePhotoPreview || employeeDraft.photoUrl ? (
                  <img src={employeePhotoPreview || employeeDraft.photoUrl} alt={employeeDraft.displayName || employeeDraft.name || 'Funcionário'} className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-10 w-10" />
                )}
              </div>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Foto opcional</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleEmployeePhotoChange} className={inputClass} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo"><input value={employeeDraft.name} onChange={(event) => setEmployeeDraft((value) => ({...value, name: event.target.value}))} className={inputClass} /></Field>
              <Field label="Apelido / exibição"><input value={employeeDraft.displayName} onChange={(event) => setEmployeeDraft((value) => ({...value, displayName: event.target.value}))} className={inputClass} /></Field>
              <Field label="Função principal">
                <select
                  value={employeeDraft.role}
                  onChange={(event) => {
                    const selected = catalog.find((item) => item.label === event.target.value);
                    setEmployeeDraft((value) => ({
                      ...value,
                      role: event.target.value,
                      functions: value.functions.some((item) => item.functionKey === selected?.key)
                        ? value.functions.map((item) => ({...item, isPrimary: item.functionKey === selected?.key}))
                        : selected ? [...value.functions.map((item) => ({...item, isPrimary: false})), {
                          functionKey: selected.key,
                          functionLabel: selected.label,
                          linkedProductionStep: selected.linkedProductionStep || null,
                          isPrimary: true,
                        }] : value.functions,
                    }));
                  }}
                  className={inputClass}
                >
                  <option value="">Selecione</option>
                  {catalog.map((item) => <option key={item.key} value={item.label}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={employeeDraft.status} onChange={(event) => setEmployeeDraft((value) => ({...value, status: event.target.value as EmployeeStatus}))} className={inputClass}>
                  {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Data de admissão"><input type="date" value={employeeDraft.admissionDate} onChange={(event) => setEmployeeDraft((value) => ({...value, admissionDate: event.target.value}))} className={inputClass} /></Field>
              <Field label="Telefone"><input value={employeeDraft.phone} onChange={(event) => setEmployeeDraft((value) => ({...value, phone: event.target.value}))} className={inputClass} /></Field>
              <div className="sm:col-span-2">
                <Field label="Observações internas"><textarea value={employeeDraft.notes} onChange={(event) => setEmployeeDraft((value) => ({...value, notes: event.target.value}))} className={textareaClass} /></Field>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-100 bg-white p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900">Funções atribuídas</h3>
              <p className="text-sm text-slate-500">Selecione todas as funções usuais. A principal será usada como cargo destacado.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.map((item) => {
                const checked = employeeDraft.functions.some((entry) => entry.functionKey === item.key);
                const primary = employeeDraft.functions.find((entry) => entry.isPrimary)?.functionKey === item.key;
                return (
                  <label key={item.key} className={cn('rounded-2xl border p-3 text-sm transition', checked ? 'border-brand-primary/40 bg-brand-primary/5' : 'border-slate-200 bg-slate-50')}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setEmployeeDraft((value) => {
                            if (event.target.checked) {
                              return {
                                ...value,
                                functions: [...value.functions, {
                                  functionKey: item.key,
                                  functionLabel: item.label,
                                  linkedProductionStep: item.linkedProductionStep || null,
                                  isPrimary: value.functions.length === 0,
                                }],
                              };
                            }
                            const filtered = value.functions.filter((entry) => entry.functionKey !== item.key);
                            const nextFunctions = filtered.length > 0 && !filtered.some((entry) => entry.isPrimary)
                              ? filtered.map((entry, index) => ({...entry, isPrimary: index === 0}))
                              : filtered;
                            return {
                              ...value,
                              role: value.role === item.label ? (nextFunctions.find((entry) => entry.isPrimary)?.functionLabel || '') : value.role,
                              functions: nextFunctions,
                            };
                          });
                        }}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary/20"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-800">{item.label}</div>
                        {checked && (
                          <button
                            type="button"
                            className={cn('mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em]', primary ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600')}
                            onClick={() => setEmployeeDraft((value) => ({
                              ...value,
                              role: item.label,
                              functions: value.functions.map((entry) => ({...entry, isPrimary: entry.functionKey === item.key})),
                            }))}
                          >
                            {primary ? 'Principal' : 'Tornar principal'}
                          </button>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-100 bg-white p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900">Jornada planejada</h3>
              <p className="text-sm text-slate-500">Defina horários diferentes por dia, com intervalo e carga prevista já calculável depois.</p>
            </div>
            <div className="space-y-3">
              {employeeDraft.schedule.map((item, index) => (
                <div key={item.weekday} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[72px,100px,1fr,1fr,120px]">
                  <div className="flex items-center text-sm font-semibold text-slate-800">{weekdays[item.weekday]}</div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={item.isWorkingDay}
                      onChange={(event) => setEmployeeDraft((value) => ({
                        ...value,
                        schedule: value.schedule.map((entry, entryIndex) => entryIndex === index ? {...entry, isWorkingDay: event.target.checked} : entry),
                      }))}
                      className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary/20"
                    />
                    Trabalha
                  </label>
                  <input type="time" value={item.startTime} disabled={!item.isWorkingDay} onChange={(event) => setEmployeeDraft((value) => ({...value, schedule: value.schedule.map((entry, entryIndex) => entryIndex === index ? {...entry, startTime: event.target.value} : entry)}))} className={inputClass} />
                  <input type="time" value={item.endTime} disabled={!item.isWorkingDay} onChange={(event) => setEmployeeDraft((value) => ({...value, schedule: value.schedule.map((entry, entryIndex) => entryIndex === index ? {...entry, endTime: event.target.value} : entry)}))} className={inputClass} />
                  <input type="number" min={0} max={720} value={item.breakMinutes} disabled={!item.isWorkingDay} onChange={(event) => setEmployeeDraft((value) => ({...value, schedule: value.schedule.map((entry, entryIndex) => entryIndex === index ? {...entry, breakMinutes: Number(event.target.value) || 0} : entry)}))} className={inputClass} placeholder="Intervalo (min)" />
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className={secondaryButton} onClick={() => setEmployeeModalOpen(false)}>Cancelar</button>
            <button type="submit" className={primaryButton} disabled={savingEmployee}>
              {savingEmployee ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar funcionário
            </button>
          </div>
        </form>
      </Modal>

      <Modal title={`Jornada de ${attendanceModalEmployee?.employee.displayName || attendanceModalEmployee?.employee.name || ''}`} open={Boolean(attendanceModalEmployee)} onClose={() => setAttendanceModalEmployee(null)}>
        <form onSubmit={handleSaveAttendance} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data"><input type="date" value={attendanceDraft.workDate} onChange={(event) => setAttendanceDraft((value) => ({...value, workDate: event.target.value}))} className={inputClass} /></Field>
            <Field label="Status">
              <select value={attendanceDraft.status} onChange={(event) => setAttendanceDraft((value) => ({...value, status: event.target.value as EmployeeAttendanceRecord['status']}))} className={inputClass}>
                {attendanceStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Entrada"><input type="datetime-local" value={attendanceDraft.checkInAt} onChange={(event) => setAttendanceDraft((value) => ({...value, checkInAt: event.target.value}))} className={inputClass} /></Field>
            <Field label="Início do intervalo"><input type="datetime-local" value={attendanceDraft.breakStartAt} onChange={(event) => setAttendanceDraft((value) => ({...value, breakStartAt: event.target.value}))} className={inputClass} /></Field>
            <Field label="Fim do intervalo"><input type="datetime-local" value={attendanceDraft.breakEndAt} onChange={(event) => setAttendanceDraft((value) => ({...value, breakEndAt: event.target.value}))} className={inputClass} /></Field>
            <Field label="Saída"><input type="datetime-local" value={attendanceDraft.checkOutAt} onChange={(event) => setAttendanceDraft((value) => ({...value, checkOutAt: event.target.value}))} className={inputClass} /></Field>
            <div className="sm:col-span-2"><Field label="Observações"><textarea value={attendanceDraft.notes} onChange={(event) => setAttendanceDraft((value) => ({...value, notes: event.target.value}))} className={textareaClass} /></Field></div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className={secondaryButton} onClick={() => setAttendanceModalEmployee(null)}>Cancelar</button>
            <button type="submit" className={primaryButton} disabled={savingAttendance}>
              {savingAttendance ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Salvar jornada
            </button>
          </div>
        </form>
      </Modal>

      <Modal title={`Iniciar atividade de ${activityModalEmployee?.employee.displayName || activityModalEmployee?.employee.name || ''}`} open={Boolean(activityModalEmployee)} onClose={() => setActivityModalEmployee(null)}>
        <form onSubmit={handleStartActivity} className="space-y-4">
          <Field label="Buscar obra / cliente">
            <div className="flex gap-2">
              <input value={activityDraft.quoteSearch} onChange={(event) => setActivityDraft((value) => ({...value, quoteSearch: event.target.value}))} className={inputClass} placeholder="Ex.: Maria, cozinha, varanda..." />
              <button type="button" className={secondaryButton} onClick={() => void loadTargets(activityDraft.quoteSearch)} disabled={loadingTargets}>
                {loadingTargets ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Field label="Obra vinculada">
            <select value={activityDraft.quoteId} onChange={(event) => setActivityDraft((value) => ({...value, quoteId: event.target.value, pieceId: ''}))} className={inputClass}>
              <option value="">Selecione</option>
              {activityTargets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.clientName} · {item.environment}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Etapa / função">
              <select value={activityDraft.functionKey} onChange={(event) => setActivityDraft((value) => ({...value, functionKey: event.target.value}))} className={inputClass}>
                <option value="">Selecione</option>
                {catalog.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Peça / serviço">
              <select value={activityDraft.pieceId} onChange={(event) => setActivityDraft((value) => ({...value, pieceId: event.target.value}))} className={inputClass} disabled={!activeActivityTarget}>
                <option value="">Sem peça específica</option>
                {activeActivityTarget?.pieces.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Observação opcional"><textarea value={activityDraft.notes} onChange={(event) => setActivityDraft((value) => ({...value, notes: event.target.value}))} className={textareaClass} /></Field>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className={secondaryButton} onClick={() => setActivityModalEmployee(null)}>Cancelar</button>
            <button type="submit" className={primaryButton} disabled={savingActivity}>
              {savingActivity ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Iniciar atividade
            </button>
          </div>
        </form>
      </Modal>

      <Modal title={detailEmployee ? `Funcionário · ${detailEmployee.employee.displayName || detailEmployee.employee.name}` : 'Detalhes'} open={Boolean(detailEmployee)} onClose={() => setDetailEmployee(null)} wide>
        {detailEmployee && (
          <div className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-[1.25fr,1fr]">
              <div className="rounded-[28px] border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white text-brand-primary shadow-sm">
                    {imageVariantUrl(detailEmployee.employee, 'thumbnail') ? <img src={imageVariantUrl(detailEmployee.employee, 'thumbnail')} alt={detailEmployee.employee.name} className="h-full w-full object-cover" /> : <UserRound className="h-8 w-8" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-semibold text-slate-900">{detailEmployee.employee.displayName || detailEmployee.employee.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{detailEmployee.employee.name}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detailEmployee.functions.map((entry) => (
                        <span key={entry.id} className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium', entry.isPrimary ? 'bg-slate-900 text-white' : 'bg-white text-slate-600')}>
                          {entry.functionLabel}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <div><strong className="text-slate-800">Status:</strong> {statusOptions.find((item) => item.value === detailEmployee.employee.status)?.label || detailEmployee.employee.status}</div>
                      <div><strong className="text-slate-800">Admissão:</strong> {detailEmployee.employee.admissionDate ? formatDate(detailEmployee.employee.admissionDate) : '-'}</div>
                      <div><strong className="text-slate-800">Telefone:</strong> {detailEmployee.employee.phone || '-'}</div>
                      <div><strong className="text-slate-800">Cargo principal:</strong> {detailEmployee.employee.role || '-'}</div>
                    </div>
                    {detailEmployee.employee.notes && <p className="mt-4 rounded-2xl bg-white p-3 text-sm text-slate-600">{detailEmployee.employee.notes}</p>}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {[
                  {label: 'Hoje · trabalhadas', value: formatMinutes(detailEmployee.today.workedMinutes), icon: Clock3},
                  {label: 'Hoje · produtivas', value: formatMinutes(detailEmployee.today.productiveMinutes), icon: Briefcase},
                  {label: 'Mês · extras', value: formatMinutes(detailEmployee.month.overtimeMinutes), icon: Coffee},
                  {label: 'Mês · atividades', value: String(detailEmployee.month.completedActivities), icon: CheckCircle2},
                ].map((item) => (
                  <div key={item.label} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                        <item.icon className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-100 bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Jornada planejada</h3>
                  <p className="text-sm text-slate-500">Separada da jornada realmente realizada.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {weekdays.map((label, weekday) => {
                  const row = detailSchedules.find((item) => item.weekday === weekday);
                  return (
                    <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
                      <div className="font-semibold text-slate-800">{label}</div>
                      {row?.isWorkingDay ? (
                        <div className="mt-2 space-y-1 text-slate-600">
                          <div>{row.startTime} → {row.endTime}</div>
                          <div>Intervalo {row.breakMinutes} min</div>
                          <div>Carga prevista {formatMinutes(row.expectedMinutes)}</div>
                        </div>
                      ) : (
                        <div className="mt-2 text-slate-500">Sem jornada padrão.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-100 bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Histórico operacional</h3>
                  <p className="text-sm text-slate-500">Filtre por período, cliente e etapa para entender onde o desenvolvimento parou e quanto tempo foi gasto.</p>
                </div>
                <button type="button" className={secondaryButton} onClick={() => void reloadDetail(detailEmployee.employee.id, historyPeriod, historyClientId, historyFunctionKey, historyCustomFrom, historyCustomTo)}>
                  <RefreshCcw className="h-4 w-4" />
                  Atualizar histórico
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-5">
                <select value={historyPeriod} onChange={(event) => setHistoryPeriod(event.target.value as HistoryPeriod)} className={inputClass}>
                  <option value="today">Hoje</option>
                  <option value="week">Esta semana</option>
                  <option value="month">Este mês</option>
                  <option value="custom">Período personalizado</option>
                </select>
                <select value={historyClientId} onChange={(event) => setHistoryClientId(event.target.value)} className={inputClass}>
                  <option value="">Todos os clientes</option>
                  {detailClientOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <select value={historyFunctionKey} onChange={(event) => setHistoryFunctionKey(event.target.value)} className={inputClass}>
                  <option value="">Todas as etapas</option>
                  {catalog.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
                <input type="date" value={historyCustomFrom} onChange={(event) => setHistoryCustomFrom(event.target.value)} className={inputClass} disabled={historyPeriod !== 'custom'} />
                <input type="date" value={historyCustomTo} onChange={(event) => setHistoryCustomTo(event.target.value)} className={inputClass} disabled={historyPeriod !== 'custom'} />
              </div>

              <div className="mt-4 grid gap-3">
                {detailHistoryLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-primary" />
                    <p className="mt-2">Carregando histórico...</p>
                  </div>
                ) : detailHistory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">Nenhuma atividade no filtro atual.</div>
                ) : detailHistory.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-slate-900">{item.functionLabel}</h4>
                          <span className={cn('inline-flex rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em]', item.status === 'FINALIZADA' ? 'bg-slate-900 text-white' : item.status === 'PAUSADA' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>{item.status}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{item.client?.name || item.quote?.clientName || 'Cliente não informado'} · {item.pieceLabel || item.quote?.environment || 'Sem peça específica'}</p>
                        <p className="mt-1 text-sm text-slate-500">{formatDateTime(item.startedAt)} → {formatDateTime(item.endedAt)}</p>
                        {(item.notes || item.completionNotes) && (
                          <p className="mt-2 text-sm text-slate-500">{[item.notes, item.completionNotes].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                      <div className="grid min-w-[200px] grid-cols-2 gap-3 text-sm">
                        <div><span className="block text-slate-400">Tempo produtivo</span><strong className="text-slate-900">{formatMinutes(Math.floor((item.productiveSeconds || runtimeActivityMinutes(item, nowMs) * 60) / 60))}</strong></div>
                        <div><span className="block text-slate-400">Pausas acumuladas</span><strong className="text-slate-900">{formatMinutes(Math.floor((item.pausedTotalSeconds || 0) / 60))}</strong></div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-6">
                <h4 className="text-sm font-semibold text-slate-900">Últimos apontamentos de jornada</h4>
                <div className="mt-3 grid gap-3">
                  {detailAttendance.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-slate-900">{formatDate(item.workDate)}</strong>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{item.status}</span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-4">
                        <div>Entrada: {formatClock(item.checkInAt)}</div>
                        <div>Saída: {formatClock(item.checkOutAt)}</div>
                        <div>Trabalhadas: {formatMinutes(item.workedMinutes)}</div>
                        <div>Extras: {formatMinutes(item.overtimeMinutes)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
};
