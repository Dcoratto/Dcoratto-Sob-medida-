import React from 'react';
import {useSearchParams} from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {cn} from '../lib/utils';
import {
  createCrisisCase,
  createCrisisPhotoRecord,
  createCrisisTask,
  createSignedCrisisPhotoUrl,
  getCrisisCase,
  listCrisisCases,
  listCrisisHistory,
  listCrisisTaskPhotos,
  listCrisisTasks,
  removeCrisisTaskSchedule,
  reopenCrisisTask,
  scheduleCrisisTask,
  searchClientsForCrisis,
  softDeleteCrisisPhoto,
  softDeleteCrisisTask,
  updateCrisisTask,
  uploadCrisisImageBlob,
  completeCrisisTask,
  type CrisisCaseListItem,
} from '../lib/crisisManagement';
import {describeOptimizedImageSize, prepareCrisisImageForUpload} from '../lib/crisisImages';
import {Client, CrisisHistoryEvent, CrisisTask, CrisisTaskPhoto} from '../types';

const CASES_PAGE_SIZE = 12;
const PHOTOS_PAGE_SIZE = 12;
const HISTORY_PAGE_SIZE = 20;

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

const formatShortDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};

const formatTaskSchedule = (task?: Pick<CrisisTask, 'scheduledFor' | 'scheduleStartTime' | 'scheduleEndTime'> | null) => {
  if (!task?.scheduledFor) return '';
  const dateLabel = formatShortDate(task.scheduledFor as string);
  if (!task.scheduleStartTime) return `Agendada para ${dateLabel}`;
  if (!task.scheduleEndTime || task.scheduleEndTime === task.scheduleStartTime) {
    return `Agendada para ${dateLabel} às ${task.scheduleStartTime}`;
  }
  return `Agendada para ${dateLabel} às ${task.scheduleStartTime} até ${task.scheduleEndTime}`;
};

const isTaskOverdue = (task: Pick<CrisisTask, 'status' | 'scheduledFor' | 'scheduleEndTime' | 'scheduleStartTime'>) => {
  if (task.status === 'completed' || !task.scheduledFor) return false;
  const scheduleDate = new Date(task.scheduledFor as string);
  if (Number.isNaN(scheduleDate.getTime())) return false;

  const dueAt = new Date(scheduleDate);
  if (task.scheduleEndTime) {
    const [hours, minutes] = task.scheduleEndTime.split(':').map(Number);
    dueAt.setHours(Number.isFinite(hours) ? hours : 23, Number.isFinite(minutes) ? minutes : 59, 0, 0);
  } else if (task.scheduleStartTime) {
    const [hours, minutes] = task.scheduleStartTime.split(':').map(Number);
    dueAt.setHours(Number.isFinite(hours) ? hours : 23, Number.isFinite(minutes) ? minutes : 59, 0, 0);
  } else {
    dueAt.setHours(23, 59, 59, 999);
  }

  return dueAt.getTime() < Date.now();
};

const statusMeta = {
  pending: {label: 'Pendente', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500'},
  in_progress: {label: 'Em andamento', badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500'},
  completed: {label: 'Concluido', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500'},
  empty: {label: 'Sem pendencias', badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400'},
} as const;

const taskStatusMeta = {
  pending: {label: 'Pendente', badge: 'bg-amber-50 text-amber-700 border-amber-200'},
  completed: {label: 'Concluido', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'},
} as const;

const StatusBadge: React.FC<{status: keyof typeof statusMeta}> = ({status}) => (
  <span className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold', statusMeta[status].badge)}>
    <span className={cn('h-2 w-2 rounded-full', statusMeta[status].dot)} />
    {statusMeta[status].label}
  </span>
);

const TaskStatusBadge: React.FC<{status: keyof typeof taskStatusMeta}> = ({status}) => (
  <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide', taskStatusMeta[status].badge)}>
    {taskStatusMeta[status].label}
  </span>
);

const EmptyState: React.FC<{title: string; body: string; action?: React.ReactNode}> = ({title, body, action}) => (
  <div className="rounded-[28px] border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
      <AlertCircle className="h-6 w-6" />
    </div>
    <h3 className="mt-4 text-lg font-display font-bold text-slate-900">{title}</h3>
    <p className="mt-2 text-sm text-slate-500">{body}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

export const CrisisManagementPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const {accessUser, profile, user, hasPermission} = useAuth();
  const canEdit = hasPermission('cliente', 'editarDados');
  const canUpload = hasPermission('cliente', 'anexarArquivos');
  const actor = React.useMemo(() => ({
    uid: accessUser?.uid || user?.id || '',
    name: accessUser?.nome || profile?.name || user?.email?.split('@')[0] || 'Usuario',
    empresaId: accessUser?.empresaId || profile?.empresaId,
  }), [accessUser, profile, user]);

  const [loadingCases, setLoadingCases] = React.useState(true);
  const [cases, setCases] = React.useState<CrisisCaseListItem[]>([]);
  const [casesPage, setCasesPage] = React.useState(0);
  const [casesTotal, setCasesTotal] = React.useState(0);
  const [caseSearch, setCaseSearch] = React.useState('');
  const [selectedCaseId, setSelectedCaseId] = React.useState('');
  const [selectedCase, setSelectedCase] = React.useState<CrisisCaseListItem | null>(null);

  const [tasksLoading, setTasksLoading] = React.useState(false);
  const [tasks, setTasks] = React.useState<CrisisTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = React.useState('');

  const [photos, setPhotos] = React.useState<CrisisTaskPhoto[]>([]);
  const [photosTotal, setPhotosTotal] = React.useState(0);
  const [photosPage, setPhotosPage] = React.useState(0);
  const [photosLoading, setPhotosLoading] = React.useState(false);
  const [photoUrls, setPhotoUrls] = React.useState<Record<string, string>>({});

  const [historyItems, setHistoryItems] = React.useState<CrisisHistoryEvent[]>([]);
  const [historyTotal, setHistoryTotal] = React.useState(0);
  const [historyPage, setHistoryPage] = React.useState(0);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const [feedback, setFeedback] = React.useState<{type: 'success' | 'error'; message: string} | null>(null);

  const [showClientModal, setShowClientModal] = React.useState(false);
  const [clientSearch, setClientSearch] = React.useState('');
  const [clientResults, setClientResults] = React.useState<Pick<Client, 'id' | 'name' | 'phone' | 'city' | 'address'>[]>([]);
  const [searchingClients, setSearchingClients] = React.useState(false);
  const [addingClientId, setAddingClientId] = React.useState('');

  const [showTaskModal, setShowTaskModal] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<CrisisTask | null>(null);
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskDescription, setTaskDescription] = React.useState('');
  const [savingTask, setSavingTask] = React.useState(false);

  const [showScheduleModal, setShowScheduleModal] = React.useState(false);
  const [scheduleTask, setScheduleTask] = React.useState<CrisisTask | null>(null);
  const [scheduleDate, setScheduleDate] = React.useState('');
  const [scheduleStartTime, setScheduleStartTime] = React.useState('');
  const [scheduleEndTime, setScheduleEndTime] = React.useState('');
  const [scheduleNote, setScheduleNote] = React.useState('');
  const [savingSchedule, setSavingSchedule] = React.useState(false);
  const [removingSchedule, setRemovingSchedule] = React.useState(false);

  const [showUploadModal, setShowUploadModal] = React.useState(false);
  const [uploadTask, setUploadTask] = React.useState<CrisisTask | null>(null);
  const [uploadCaptureKind, setUploadCaptureKind] = React.useState<'before' | 'after' | 'evidence'>('evidence');
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadStatus, setUploadStatus] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [completeAfterUpload, setCompleteAfterUpload] = React.useState(false);

  const [lightboxPhoto, setLightboxPhoto] = React.useState<CrisisTaskPhoto | null>(null);
  const [lightboxScale, setLightboxScale] = React.useState(1);

  const requestedCaseId = searchParams.get('case') || '';
  const requestedTaskId = searchParams.get('task') || '';

  const selectedTask = React.useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || null,
    [tasks, selectedTaskId],
  );

  const selectedTaskPhotos = React.useMemo(
    () => photos.filter((photo) => photo.crisisTaskId === selectedTaskId),
    [photos, selectedTaskId],
  );

  const visibleCases = React.useMemo(
    () => cases.filter((item) => item.client?.name || item.clientId),
    [cases],
  );

  const refreshCases = React.useCallback(async (page = 0, append = false, search = caseSearch) => {
    setLoadingCases(true);
    try {
      const result = await listCrisisCases(page, CASES_PAGE_SIZE, search);
      setCasesTotal(result.total);
      setCasesPage(page);
      setCases((current) => append ? [...current, ...result.items.filter((item) => !current.some((entry) => entry.id === item.id))] : result.items);

      const fallbackCaseId = selectedCaseId && result.items.some((item) => item.id === selectedCaseId)
        ? selectedCaseId
        : result.items[0]?.id || '';
      if (fallbackCaseId) {
        setSelectedCaseId(fallbackCaseId);
      } else {
        setSelectedCaseId('');
        setSelectedCase(null);
        setTasks([]);
        setSelectedTaskId('');
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar os clientes em crise.'});
    } finally {
      setLoadingCases(false);
    }
  }, [caseSearch, selectedCaseId]);

  const refreshSelectedCase = React.useCallback(async (caseId: string) => {
    if (!caseId) return;
    setTasksLoading(true);
    try {
      const [caseItem, taskItems] = await Promise.all([
        getCrisisCase(caseId),
        listCrisisTasks(caseId),
      ]);
      setSelectedCase(caseItem);
      setTasks(taskItems);
      setSelectedTaskId((current) => {
        if (requestedTaskId && taskItems.some((task) => task.id === requestedTaskId)) return requestedTaskId;
        return current && taskItems.some((task) => task.id === current) ? current : (taskItems[0]?.id || '');
      });
      setCases((current) => current.map((item) => item.id === caseItem.id ? caseItem : item));
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar as pendencias.'});
    } finally {
      setTasksLoading(false);
    }
  }, [requestedTaskId]);

  const refreshPhotos = React.useCallback(async (taskId: string, page = 0, append = false) => {
    if (!taskId) {
      setPhotos([]);
      setPhotosTotal(0);
      return;
    }
    setPhotosLoading(true);
    try {
      const result = await listCrisisTaskPhotos(taskId, page, PHOTOS_PAGE_SIZE);
      const nextItems = append ? [...photos.filter((photo) => photo.crisisTaskId !== taskId), ...photos.filter((photo) => photo.crisisTaskId === taskId), ...result.items] : [
        ...photos.filter((photo) => photo.crisisTaskId !== taskId),
        ...result.items,
      ];
      const deduped = Array.from(new Map(nextItems.map((photo) => [photo.id, photo])).values());
      setPhotos(deduped);
      setPhotosTotal(result.total);
      setPhotosPage(page);

      const missing = result.items.filter((photo) => !photoUrls[photo.id]);
      if (missing.length) {
        const urls = await Promise.all(missing.map(async (photo) => ({id: photo.id, url: await createSignedCrisisPhotoUrl(photo.filePath)})));
        setPhotoUrls((current) => {
          const next = {...current};
          urls.forEach((entry) => {
            next[entry.id] = entry.url;
          });
          return next;
        });
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar as fotos.'});
    } finally {
      setPhotosLoading(false);
    }
  }, [photoUrls, photos]);

  const refreshHistory = React.useCallback(async (caseId: string, taskId?: string, page = 0, append = false) => {
    if (!caseId) {
      setHistoryItems([]);
      setHistoryTotal(0);
      return;
    }
    setHistoryLoading(true);
    try {
      const result = await listCrisisHistory(caseId, page, HISTORY_PAGE_SIZE, taskId);
      setHistoryItems((current) => append ? [...current, ...result.items.filter((item) => !current.some((entry) => entry.id === item.id))] : result.items);
      setHistoryTotal(result.total);
      setHistoryPage(page);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar o historico.'});
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshCases(0, false, caseSearch);
  }, [refreshCases, caseSearch]);

  React.useEffect(() => {
    if (requestedCaseId && requestedCaseId !== selectedCaseId) {
      setSelectedCaseId(requestedCaseId);
    }
  }, [requestedCaseId, selectedCaseId]);

  React.useEffect(() => {
    if (!selectedCaseId) return;
    void refreshSelectedCase(selectedCaseId);
  }, [refreshSelectedCase, selectedCaseId]);

  React.useEffect(() => {
    if (!selectedTaskId || !selectedCaseId) return;
    void refreshPhotos(selectedTaskId, 0, false);
    void refreshHistory(selectedCaseId, selectedTaskId, 0, false);
  }, [refreshHistory, refreshPhotos, selectedCaseId, selectedTaskId]);

  React.useEffect(() => {
    if (!showClientModal) return;
    setSearchingClients(true);
    const timeout = window.setTimeout(async () => {
      try {
        const results = await searchClientsForCrisis(clientSearch, 20);
        const activeClientIds = new Set(cases.map((item) => item.clientId));
        setClientResults(results.filter((item) => !activeClientIds.has(item.id)));
      } catch (error) {
        setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel buscar clientes.'});
      } finally {
        setSearchingClients(false);
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [cases, clientSearch, showClientModal]);

  const openTaskModal = (task?: CrisisTask) => {
    setEditingTask(task || null);
    setTaskTitle(task?.title || '');
    setTaskDescription(task?.description || '');
    setShowTaskModal(true);
  };

  const closeTaskModal = () => {
    setShowTaskModal(false);
    setEditingTask(null);
    setTaskTitle('');
    setTaskDescription('');
  };

  const openScheduleModal = (task: CrisisTask) => {
    setScheduleTask(task);
    setScheduleDate(task.scheduledFor ? new Date(task.scheduledFor as string).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setScheduleStartTime(task.scheduleStartTime || '');
    setScheduleEndTime(task.scheduleEndTime || '');
    setScheduleNote(task.scheduleNote || '');
    setShowScheduleModal(true);
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setScheduleTask(null);
    setScheduleDate('');
    setScheduleStartTime('');
    setScheduleEndTime('');
    setScheduleNote('');
  };

  const handleSaveTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCaseId) return;
    if (taskTitle.trim().length < 3) {
      setFeedback({type: 'error', message: 'Informe um titulo com pelo menos 3 caracteres.'});
      return;
    }
    setSavingTask(true);
    try {
      if (editingTask) {
        await updateCrisisTask(editingTask.id, selectedCaseId, {title: taskTitle, description: taskDescription}, actor);
        setFeedback({type: 'success', message: 'Pendencia atualizada.'});
      } else {
        await createCrisisTask(selectedCaseId, {title: taskTitle, description: taskDescription}, actor);
        setFeedback({type: 'success', message: 'Pendencia criada.'});
      }
      closeTaskModal();
      await refreshSelectedCase(selectedCaseId);
      await refreshHistory(selectedCaseId, selectedTaskId || undefined, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel salvar a pendencia.'});
    } finally {
      setSavingTask(false);
    }
  };

  const handleSaveSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCase || !scheduleTask) return;
    if (!scheduleDate) {
      setFeedback({type: 'error', message: 'Informe a data da pendencia.'});
      return;
    }
    if (scheduleStartTime && scheduleEndTime && scheduleEndTime <= scheduleStartTime) {
      setFeedback({type: 'error', message: 'O horario final deve ser posterior ao horario inicial.'});
      return;
    }

    const hadSchedule = Boolean(scheduleTask.scheduledFor);
    setSavingSchedule(true);
    try {
      await scheduleCrisisTask(scheduleTask.id, {
        scheduleDate,
        startTime: scheduleStartTime || undefined,
        endTime: scheduleEndTime || undefined,
        note: scheduleNote || undefined,
      }, actor);
      setFeedback({type: 'success', message: hadSchedule ? 'Data da pendencia atualizada.' : 'Pendencia agendada com sucesso.'});
      closeScheduleModal();
      await refreshSelectedCase(selectedCase.id);
      await refreshHistory(selectedCase.id, scheduleTask.id, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel salvar a data. Tente novamente.'});
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleRemoveSchedule = async () => {
    if (!selectedCase || !scheduleTask?.scheduledFor) return;
    if (!window.confirm('Remover o agendamento desta pendencia?')) return;
    setRemovingSchedule(true);
    try {
      await removeCrisisTaskSchedule(scheduleTask.id, actor);
      setFeedback({type: 'success', message: 'Agendamento removido com sucesso.'});
      closeScheduleModal();
      await refreshSelectedCase(selectedCase.id);
      await refreshHistory(selectedCase.id, scheduleTask.id, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel remover o agendamento.'});
    } finally {
      setRemovingSchedule(false);
    }
  };

  const handleAddClient = async (client: Pick<Client, 'id' | 'name'>) => {
    setAddingClientId(client.id);
    try {
      const created = await createCrisisCase(client.id, actor);
      setFeedback({type: 'success', message: `${client.name} entrou na Gestao de Crise.`});
      setShowClientModal(false);
      setClientSearch('');
      await refreshCases(0, false, caseSearch);
      setSelectedCaseId(created.id);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel adicionar o cliente.'});
    } finally {
      setAddingClientId('');
    }
  };

  const openCompletionUpload = (task: CrisisTask, markAsCompleted: boolean) => {
    setUploadTask(task);
    setCompleteAfterUpload(markAsCompleted);
    setUploadCaptureKind(markAsCompleted ? 'after' : 'evidence');
    setUploadProgress(0);
    setUploadStatus('');
    setShowUploadModal(true);
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files?.length || !uploadTask || !selectedCase) return;

    setUploading(true);
    setUploadProgress(8);
    setUploadStatus('Validando imagens...');

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const prepared = await prepareCrisisImageForUpload(file);
        setUploadProgress(25 + Math.round((index / files.length) * 30));
        setUploadStatus(`Enviando ${index + 1} de ${files.length} (${describeOptimizedImageSize(prepared.sizeBytes)})...`);

        const fileName = `${Date.now()}-${index + 1}.${prepared.extension}`;
        const filePath = `gestao-crise/${selectedCase.clientId}/${uploadTask.id}/${fileName}`;

        await uploadCrisisImageBlob(filePath, prepared.blob, prepared.mimeType);

        try {
          await createCrisisPhotoRecord(uploadTask.id, selectedCase.id, {
            filePath,
            fileName,
            mimeType: prepared.mimeType,
            sizeBytes: prepared.sizeBytes,
            width: prepared.width,
            height: prepared.height,
            captureKind: uploadCaptureKind,
          }, actor);
        } catch (error) {
          throw error;
        }
      }

      setUploadProgress(88);
      if (completeAfterUpload) {
        setUploadStatus('Finalizando pendencia...');
        await completeCrisisTask(uploadTask.id, selectedCase.id, actor);
      }

      setUploadProgress(100);
      setUploadStatus('Upload concluido.');
      setFeedback({type: 'success', message: completeAfterUpload ? 'Pendencia concluida com evidencia.' : 'Foto adicionada com sucesso.'});
      setShowUploadModal(false);
      setUploadTask(null);
      await refreshSelectedCase(selectedCase.id);
      await refreshPhotos(uploadTask.id, 0, false);
      await refreshHistory(selectedCase.id, uploadTask.id, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel enviar as imagens.'});
    } finally {
      setUploading(false);
    }
  };

  const handleReopenTask = async (task: CrisisTask) => {
    if (!selectedCase) return;
    try {
      await reopenCrisisTask(task.id, selectedCase.id, actor);
      setFeedback({type: 'success', message: 'Pendencia reaberta.'});
      await refreshSelectedCase(selectedCase.id);
      await refreshHistory(selectedCase.id, task.id, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel reabrir a pendencia.'});
    }
  };

  const handleDeleteTask = async (task: CrisisTask) => {
    if (!selectedCase || !window.confirm(`Remover a pendencia "${task.title}"?`)) return;
    try {
      if (task.scheduledFor) {
        await removeCrisisTaskSchedule(task.id, actor);
      }
      await softDeleteCrisisTask(task.id, selectedCase.id, actor);
      setFeedback({type: 'success', message: 'Pendencia removida.'});
      await refreshSelectedCase(selectedCase.id);
      await refreshHistory(selectedCase.id, undefined, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel remover a pendencia.'});
    }
  };

  const handleDeletePhoto = async (photo: CrisisTaskPhoto) => {
    if (!selectedCase || !window.confirm('Remover esta foto?')) return;
    try {
      await softDeleteCrisisPhoto(photo, selectedCase.id, actor);
      setFeedback({type: 'success', message: 'Foto removida.'});
      await refreshPhotos(photo.crisisTaskId, 0, false);
      await refreshHistory(selectedCase.id, photo.crisisTaskId, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel remover a foto.'});
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Gestao de Crise</h1>
          <p className="mt-1 text-sm text-slate-500">Pos-obra com pendencias, evidencias fotograficas e historico completo.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-[240px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={caseSearch}
              onChange={(event) => setCaseSearch(event.target.value)}
              placeholder="Buscar cliente em crise"
              className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setShowClientModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-primary/20 transition-all hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Adicionar Cliente
            </button>
          ) : null}
        </div>
      </header>

      {feedback ? (
        <div className={cn(
          'rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm',
          feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700',
        )}>
          {feedback.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px,minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-display font-bold text-slate-900">Clientes em crise</h2>
                <p className="text-xs text-slate-400">{casesTotal} registro(s)</p>
              </div>
              <button
                type="button"
                onClick={() => void refreshCases(0, false, caseSearch)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200"
                aria-label="Atualizar lista"
              >
                <RefreshCcw className={cn('h-4 w-4', loadingCases && 'animate-spin')} />
              </button>
            </div>

            <div className="space-y-3">
              {loadingCases && cases.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">Carregando clientes...</div>
              ) : null}

              {!loadingCases && visibleCases.length === 0 ? (
                <EmptyState
                  title="Nenhum cliente em crise"
                  body="Quando um pos-obra precisar de acompanhamento, o cliente aparece aqui com o resumo das pendencias."
                />
              ) : null}

              {visibleCases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedCaseId(item.id)}
                  className={cn(
                    'w-full rounded-[24px] border p-4 text-left transition-all',
                    selectedCaseId === item.id ? 'border-brand-primary bg-brand-primary/5 shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/70',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-900">{item.client?.name || 'Cliente sem nome'}</h3>
                      <p className="mt-1 truncate text-xs text-slate-500">{item.client?.city || 'Cidade nao informada'}</p>
                    </div>
                    <StatusBadge status={item.visualStatus} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pendencias</div>
                      <div className="mt-1 font-bold text-slate-900">{item.taskCount}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Concluidas</div>
                      <div className="mt-1 font-bold text-slate-900">{item.completedTaskCount}</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      <span>Progresso</span>
                      <span>{item.completionPercent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-brand-primary transition-all" style={{width: `${item.completionPercent}%`}} />
                    </div>
                  </div>
                  <div className="mt-4 text-[11px] text-slate-400">Incluido em {formatShortDate(item.createdAt as string)}</div>
                </button>
              ))}

              {visibleCases.length < casesTotal ? (
                <button
                  type="button"
                  onClick={() => void refreshCases(casesPage + 1, true, caseSearch)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                >
                  Carregar mais
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {!selectedCase ? (
            <EmptyState
              title="Selecione um cliente"
              body="Escolha um card da lista para acompanhar as pendencias, fotos e historico tecnico."
            />
          ) : (
            <>
              <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-display font-bold text-slate-900">{selectedCase.client?.name}</h2>
                      <StatusBadge status={selectedCase.visualStatus} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                      <span>{selectedCase.client?.phone || 'Telefone nao informado'}</span>
                      <span>{selectedCase.client?.city || 'Cidade nao informada'}</span>
                      <span>Entrada em {formatShortDate(selectedCase.createdAt as string)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm sm:min-w-[280px]">
                    <div className="rounded-2xl bg-slate-50 px-3 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total</div>
                      <div className="mt-1 text-lg font-bold text-slate-900">{selectedCase.taskCount}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Concluidas</div>
                      <div className="mt-1 text-lg font-bold text-slate-900">{selectedCase.completedTaskCount}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Percentual</div>
                      <div className="mt-1 text-lg font-bold text-slate-900">{selectedCase.completionPercent}%</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.1fr),minmax(360px,0.9fr)]">
                <div className="space-y-6">
                  <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-display font-bold text-slate-900">Pendencias</h3>
                        <p className="text-sm text-slate-400">Checklist tecnico com evidencia obrigatoria para conclusao.</p>
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openTaskModal()}
                          className="inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-primary/20"
                        >
                          <Plus className="h-4 w-4" />
                          Nova pendencia
                        </button>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      {tasksLoading ? (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">Carregando pendencias...</div>
                      ) : null}

                      {!tasksLoading && tasks.length === 0 ? (
                        <EmptyState
                          title="Nenhuma pendencia registrada"
                          body="Use o botao acima para adicionar o primeiro item deste pos-obra."
                        />
                      ) : null}

                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className={cn(
                            'rounded-[26px] border p-4 transition-all',
                            selectedTaskId === task.id ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-100 bg-white hover:border-slate-200',
                            requestedTaskId === task.id && 'ring-2 ring-brand-primary/20',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              disabled={!canUpload}
                              onClick={() => task.status === 'completed' ? void handleReopenTask(task) : openCompletionUpload(task, true)}
                              className={cn(
                                'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all',
                                task.status === 'completed'
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-slate-300 bg-white text-transparent hover:border-brand-primary',
                                !canUpload && 'cursor-not-allowed opacity-60',
                              )}
                              title={task.status === 'completed' ? 'Reabrir pendencia' : 'Concluir com foto'}
                            >
                              <Check className="h-4 w-4" />
                            </button>

                            <button type="button" onClick={() => setSelectedTaskId(task.id)} className="min-w-0 flex-1 text-left">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-bold text-slate-900">{task.title}</h4>
                                <TaskStatusBadge status={task.status} />
                              </div>
                              {task.description ? <p className="mt-1 text-sm text-slate-500">{task.description}</p> : null}
                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                                <span>Criada em {formatDateTime(task.createdAt as string)}</span>
                                <span>Por {task.createdByName || 'Usuario'}</span>
                                {task.completedAt ? <span>Concluida em {formatDateTime(task.completedAt as string)}</span> : null}
                              </div>
                              {task.scheduledFor ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-semibold text-slate-500">{formatTaskSchedule(task)}</span>
                                  {isTaskOverdue(task) ? (
                                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-600">
                                      ATRASADA
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </button>

                            <div className="flex items-center gap-2">
                              {canUpload ? (
                                <button
                                  type="button"
                                  onClick={() => openCompletionUpload(task, false)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200"
                                  title="Adicionar foto"
                                >
                                  <ImagePlus className="h-4 w-4" />
                                </button>
                              ) : null}
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => openScheduleModal(task)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200"
                                  title={task.scheduledFor ? 'Alterar data da pendência' : 'Definir data da pendência'}
                                  aria-label="Definir data da pendência"
                                >
                                  <CalendarDays className="h-4 w-4" />
                                </button>
                              ) : null}
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => openTaskModal(task)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200"
                                  title="Editar pendencia"
                                >
                                  <Clock3 className="h-4 w-4" />
                                </button>
                              ) : null}
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteTask(task)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600 transition-all hover:bg-red-100"
                                  title="Remover pendencia"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-display font-bold text-slate-900">
                          {selectedTask ? selectedTask.title : 'Detalhes da pendencia'}
                        </h3>
                        <p className="text-sm text-slate-400">
                          {selectedTask ? 'Fotos, comprovacoes e status desta pendencia.' : 'Selecione uma pendencia para ver as evidencias.'}
                        </p>
                      </div>
                      {selectedTask ? <TaskStatusBadge status={selectedTask.status} /> : null}
                    </div>

                    {!selectedTask ? (
                      <EmptyState
                        title="Nenhuma pendencia selecionada"
                        body="Toque em uma pendencia da lista para abrir a galeria e o historico."
                      />
                    ) : (
                      <div className="space-y-6">
                        {selectedTask.description ? (
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{selectedTask.description}</div>
                        ) : null}

                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Fotos</h4>
                            {canUpload ? (
                              <button
                                type="button"
                                onClick={() => openCompletionUpload(selectedTask, false)}
                                className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200"
                              >
                                <Upload className="h-4 w-4" />
                                Adicionar foto
                              </button>
                            ) : null}
                          </div>

                          {photosLoading && selectedTaskPhotos.length === 0 ? (
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Carregando fotos...</div>
                          ) : null}

                          {!photosLoading && selectedTaskPhotos.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                              Ainda nao existem fotos nesta pendencia.
                            </div>
                          ) : null}

                          {selectedTaskPhotos.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                              {selectedTaskPhotos.map((photo) => (
                                <div key={photo.id} className="overflow-hidden rounded-[22px] border border-slate-100 bg-white">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLightboxPhoto(photo);
                                      setLightboxScale(1);
                                    }}
                                    className="block aspect-[4/3] w-full overflow-hidden bg-slate-100"
                                  >
                                    {photoUrls[photo.id] ? (
                                      <img src={photoUrls[photo.id]} alt={photo.fileName} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
                                    ) : (
                                      <div className="flex h-full items-center justify-center text-slate-300">
                                        <Users className="h-5 w-5" />
                                      </div>
                                    )}
                                  </button>
                                  <div className="space-y-2 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate text-xs font-bold text-slate-700">{photo.captureKind || 'evidence'}</span>
                                      {canUpload ? (
                                        <button
                                          type="button"
                                          onClick={() => void handleDeletePhoto(photo)}
                                          className="text-red-500 transition-all hover:text-red-600"
                                          title="Remover foto"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      ) : null}
                                    </div>
                                    <div className="text-[11px] text-slate-400">{formatDateTime(photo.createdAt as string)}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {selectedTaskPhotos.length < photosTotal ? (
                            <button
                              type="button"
                              onClick={() => void refreshPhotos(selectedTask.id, photosPage + 1, true)}
                              className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                            >
                              Carregar mais fotos
                            </button>
                          ) : null}
                        </div>

                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Historico</h4>
                            {historyLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                          </div>
                          <div className="space-y-3">
                            {historyItems.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                                Nenhum evento registrado ainda.
                              </div>
                            ) : historyItems.map((item) => (
                              <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                <div className="text-sm font-semibold text-slate-800">{item.message}</div>
                                <div className="mt-1 text-xs text-slate-400">{item.userName || 'Usuario'} • {formatDateTime(item.createdAt as string)}</div>
                              </div>
                            ))}
                          </div>
                          {historyItems.length < historyTotal ? (
                            <button
                              type="button"
                              onClick={() => void refreshHistory(selectedCase.id, selectedTask.id, historyPage + 1, true)}
                              className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                            >
                              Carregar mais historico
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {showClientModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Adicionar Cliente</h3>
                <p className="text-sm text-slate-400">Selecione um cadastro existente para incluir no acompanhamento.</p>
              </div>
              <button type="button" onClick={() => setShowClientModal(false)} className="rounded-2xl bg-slate-100 p-2 text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Buscar por nome, telefone ou cidade"
                className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {searchingClients ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Buscando clientes...</div>
              ) : null}
              {!searchingClients && clientResults.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Nenhum cliente disponivel para adicionar.</div>
              ) : null}
              {clientResults.map((client) => (
                <div key={client.id} className="flex items-center justify-between gap-3 rounded-[24px] border border-slate-100 p-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">{client.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{client.phone || 'Sem telefone'} • {client.city || 'Cidade nao informada'}</div>
                  </div>
                  <button
                    type="button"
                    disabled={addingClientId === client.id}
                    onClick={() => void handleAddClient(client)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {addingClientId === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Adicionar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showTaskModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-2xl font-display font-bold text-slate-900">{editingTask ? 'Editar pendencia' : 'Nova pendencia'}</h3>
              <button type="button" onClick={closeTaskModal} className="rounded-2xl bg-slate-100 p-2 text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveTask} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-500">Titulo</span>
                <input
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand-primary/20"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-500">Descricao</span>
                <textarea
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand-primary/20"
                />
              </label>
              <button
                type="submit"
                disabled={savingTask}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Salvar pendencia
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showScheduleModal && scheduleTask && selectedCase ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Data da pendencia</h3>
                <p className="text-sm text-slate-400">Agende esta pendencia no calendario interno.</p>
              </div>
              <button type="button" onClick={closeScheduleModal} disabled={savingSchedule || removingSchedule} className="rounded-2xl bg-slate-100 p-2 text-slate-500 disabled:opacity-60">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-500">Cliente</span>
                <input value={selectedCase.client?.name || 'Cliente'} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none" />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-500">Pendencia</span>
                <input value={scheduleTask.title} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none" />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="block space-y-1.5 sm:col-span-1">
                  <span className="text-sm font-medium text-slate-500">Data</span>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(event) => setScheduleDate(event.target.value)}
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-500">Horario inicial</span>
                  <input
                    type="time"
                    value={scheduleStartTime}
                    onChange={(event) => setScheduleStartTime(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-500">Horario final</span>
                  <input
                    type="time"
                    value={scheduleEndTime}
                    onChange={(event) => setScheduleEndTime(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-500">Observacao</span>
                <textarea
                  value={scheduleNote}
                  onChange={(event) => setScheduleNote(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none"
                />
              </label>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeScheduleModal}
                    className="inline-flex items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-200"
                    disabled={savingSchedule || removingSchedule}
                  >
                    Cancelar
                  </button>
                  {scheduleTask.scheduledFor ? (
                    <button
                      type="button"
                      onClick={() => void handleRemoveSchedule()}
                      className="inline-flex items-center justify-center rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition-all hover:bg-red-100"
                      disabled={savingSchedule || removingSchedule}
                    >
                      {removingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remover agendamento'}
                    </button>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={savingSchedule || removingSchedule}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                  Salvar data
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showUploadModal && uploadTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">
                  {completeAfterUpload ? 'Concluir com foto' : 'Adicionar foto'}
                </h3>
                <p className="text-sm text-slate-400">{uploadTask.title}</p>
              </div>
              <button
                type="button"
                onClick={() => !uploading && setShowUploadModal(false)}
                className="rounded-2xl bg-slate-100 p-2 text-slate-500"
                disabled={uploading}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-500">Tipo de foto</span>
                <select
                  value={uploadCaptureKind}
                  onChange={(event) => setUploadCaptureKind(event.target.value as 'before' | 'after' | 'evidence')}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-800 outline-none"
                >
                  <option value="before">Antes</option>
                  <option value="after">Depois</option>
                  <option value="evidence">Evidencia</option>
                </select>
              </label>

              <label className="flex cursor-pointer items-center justify-center gap-3 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center transition-all hover:border-brand-primary hover:bg-brand-primary/5">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => void handleUploadFiles(event.target.files)}
                  className="hidden"
                  disabled={uploading}
                />
                <Upload className="h-5 w-5 text-slate-400" />
                <div>
                  <div className="text-sm font-bold text-slate-700">Selecionar imagens</div>
                  <div className="mt-1 text-xs text-slate-400">Compressao automatica, WebP quando suportado e limite de 1920 px.</div>
                </div>
              </label>

              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-400">
                  <span>Progresso</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div className="h-2 rounded-full bg-brand-primary transition-all" style={{width: `${uploadProgress}%`}} />
                </div>
                <div className="mt-3 text-sm text-slate-500">{uploadStatus || 'Aguardando imagens...'}</div>
              </div>

              {completeAfterUpload ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  A conclusao so sera gravada depois que pelo menos uma foto for enviada com sucesso.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {lightboxPhoto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <button type="button" onClick={() => setLightboxPhoto(null)} className="absolute right-4 top-4 rounded-2xl bg-white/10 p-3 text-white">
            <X className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-2 backdrop-blur">
            <button type="button" onClick={() => setLightboxScale((value) => Math.max(1, value - 0.25))} className="rounded-full bg-white/10 p-2 text-white">
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[72px] text-center text-sm font-bold text-white">{Math.round(lightboxScale * 100)}%</span>
            <button type="button" onClick={() => setLightboxScale((value) => Math.min(3, value + 0.25))} className="rounded-full bg-white/10 p-2 text-white">
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[88vh] max-w-[92vw] overflow-auto rounded-[28px] bg-white/5 p-3">
            {photoUrls[lightboxPhoto.id] ? (
              <img
                src={photoUrls[lightboxPhoto.id]}
                alt={lightboxPhoto.fileName}
                className="max-h-[82vh] max-w-[88vw] rounded-[24px] object-contain transition-transform duration-200"
                style={{transform: `scale(${lightboxScale})`, transformOrigin: 'center center'}}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
