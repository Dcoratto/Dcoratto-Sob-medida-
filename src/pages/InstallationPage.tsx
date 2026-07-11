import React from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ImagePlus,
  Loader2,
  MapPin,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {cn} from '../lib/utils';
import {
  createInstallation,
  createInstallationPhotoRecord,
  createSignedInstallationPhotoUrl,
  finalizeInstallation,
  getInstallationDetail,
  listInstallationChecklistItems,
  listInstallationChecklistPhotos,
  listInstallationHistory,
  listInstallations,
  listInstallerEmployees,
  searchProjectOptionsForInstallation,
  softDeleteInstallationPhoto,
  updateInstallationChecklistItem,
  uploadInstallationImageBlob,
  type InstallationListItem,
  type InstallationProjectOption,
} from '../lib/installationManagement';
import {describeOptimizedInstallationImageSize, prepareInstallationImageForUpload} from '../lib/installationImages';
import {Employee, InstallationChecklistItem, InstallationChecklistPhoto, InstallationHistoryEvent} from '../types';

const LIST_PAGE_SIZE = 12;
const PHOTOS_PAGE_SIZE = 12;
const HISTORY_PAGE_SIZE = 20;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

const installationStatusMeta = {
  pending: {label: 'Pendente', badge: 'bg-amber-50 text-amber-700 border-amber-200'},
  in_progress: {label: 'Em andamento', badge: 'bg-blue-50 text-blue-700 border-blue-200'},
  completed: {label: 'Concluida', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'},
} as const;

const StatusBadge: React.FC<{status: keyof typeof installationStatusMeta}> = ({status}) => (
  <span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-bold', installationStatusMeta[status].badge)}>
    {installationStatusMeta[status].label}
  </span>
);

const EmptyState: React.FC<{title: string; body: string; action?: React.ReactNode}> = ({title, body, action}) => (
  <div className="rounded-[28px] border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
      <ClipboardCheck className="h-6 w-6" />
    </div>
    <h3 className="mt-4 text-lg font-display font-bold text-slate-900">{title}</h3>
    <p className="mt-2 text-sm text-slate-500">{body}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

const ProgressBar: React.FC<{percent: number}> = ({percent}) => (
  <div>
    <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">
      <span>Progresso</span>
      <span>{percent}%</span>
    </div>
    <div className="h-2 rounded-full bg-slate-100">
      <div className="h-2 rounded-full bg-brand-primary transition-all" style={{width: `${percent}%`}} />
    </div>
  </div>
);

type InstallationDetailState = {
  installation: InstallationListItem | null;
  client: {id: string; name: string; phone: string; address: string; city: string; notes?: string} | null;
  quote: {id: string; environment: string; status: string; totalPrice: number; commercialNotes?: string} | null;
  installer: Pick<Employee, 'id' | 'name' | 'role'> | null;
};

export const InstallationPage: React.FC = () => {
  const {accessUser, profile, user, hasPermission} = useAuth();
  const canCreate = hasPermission('projeto', 'criar') || hasPermission('cliente', 'editarDados');
  const canEdit = hasPermission('projeto', 'editar') || hasPermission('cliente', 'editarDados');
  const canUpload = hasPermission('cliente', 'anexarArquivos');
  const actor = React.useMemo(() => ({
    uid: accessUser?.uid || user?.id || '',
    name: accessUser?.nome || profile?.name || user?.email?.split('@')[0] || 'Usuario',
    empresaId: accessUser?.empresaId || profile?.empresaId,
  }), [accessUser, profile, user]);

  const [search, setSearch] = React.useState('');
  const [installations, setInstallations] = React.useState<InstallationListItem[]>([]);
  const [totalInstallations, setTotalInstallations] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [loadingList, setLoadingList] = React.useState(true);

  const [selectedInstallationId, setSelectedInstallationId] = React.useState('');
  const [detail, setDetail] = React.useState<InstallationDetailState>({installation: null, client: null, quote: null, installer: null});
  const [checklistItems, setChecklistItems] = React.useState<InstallationChecklistItem[]>([]);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [savingItemId, setSavingItemId] = React.useState('');
  const [selectedItemId, setSelectedItemId] = React.useState('');

  const [itemPhotos, setItemPhotos] = React.useState<InstallationChecklistPhoto[]>([]);
  const [itemPhotosTotal, setItemPhotosTotal] = React.useState(0);
  const [photosPage, setPhotosPage] = React.useState(0);
  const [loadingPhotos, setLoadingPhotos] = React.useState(false);
  const [photoUrls, setPhotoUrls] = React.useState<Record<string, string>>({});

  const [historyItems, setHistoryItems] = React.useState<InstallationHistoryEvent[]>([]);
  const [historyTotal, setHistoryTotal] = React.useState(0);
  const [historyPage, setHistoryPage] = React.useState(0);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  const [feedback, setFeedback] = React.useState<{type: 'success' | 'error'; message: string} | null>(null);

  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [projectSearch, setProjectSearch] = React.useState('');
  const [projectOptions, setProjectOptions] = React.useState<InstallationProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = React.useState(false);
  const [installerOptions, setInstallerOptions] = React.useState<Pick<Employee, 'id' | 'name' | 'role'>[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState('');
  const [selectedInstallerId, setSelectedInstallerId] = React.useState('');
  const [installationDate, setInstallationDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [installationNotes, setInstallationNotes] = React.useState('');
  const [creatingInstallation, setCreatingInstallation] = React.useState(false);

  const [showUploadModal, setShowUploadModal] = React.useState(false);
  const [uploadItem, setUploadItem] = React.useState<InstallationChecklistItem | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadStatus, setUploadStatus] = React.useState('');

  const [lightboxPhoto, setLightboxPhoto] = React.useState<InstallationChecklistPhoto | null>(null);
  const [lightboxScale, setLightboxScale] = React.useState(1);

  const selectedItem = React.useMemo(
    () => checklistItems.find((item) => item.id === selectedItemId) || null,
    [checklistItems, selectedItemId],
  );

  const groupedChecklist = React.useMemo(() => {
    const grouped = new Map<string, {groupLabel: string; items: InstallationChecklistItem[]}>();
    checklistItems.forEach((item) => {
      const current = grouped.get(item.groupKey) || {groupLabel: item.groupLabel, items: []};
      current.items.push(item);
      grouped.set(item.groupKey, current);
    });
    return Array.from(grouped.entries()).map(([groupKey, value]) => ({groupKey, ...value}));
  }, [checklistItems]);

  const activeSelectedPhotos = React.useMemo(
    () => itemPhotos.filter((photo) => photo.checklistItemId === selectedItemId),
    [itemPhotos, selectedItemId],
  );

  const loadInstallations = React.useCallback(async (nextPage = 0, append = false, searchText = search) => {
    setLoadingList(true);
    try {
      const result = await listInstallations(nextPage, LIST_PAGE_SIZE, searchText);
      setTotalInstallations(result.total);
      setPage(nextPage);
      setInstallations((current) => append ? [...current, ...result.items.filter((item) => !current.some((entry) => entry.id === item.id))] : result.items);
      const nextSelectedId = selectedInstallationId && result.items.some((item) => item.id === selectedInstallationId)
        ? selectedInstallationId
        : result.items[0]?.id || '';
      if (nextSelectedId) setSelectedInstallationId(nextSelectedId);
      else {
        setSelectedInstallationId('');
        setDetail({installation: null, client: null, quote: null, installer: null});
        setChecklistItems([]);
        setSelectedItemId('');
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar as instalacoes.'});
    } finally {
      setLoadingList(false);
    }
  }, [search, selectedInstallationId]);

  const loadDetail = React.useCallback(async (installationId: string) => {
    if (!installationId) return;
    setLoadingDetail(true);
    try {
      const [detailResult, items] = await Promise.all([
        getInstallationDetail(installationId),
        listInstallationChecklistItems(installationId),
      ]);
      setDetail({
        installation: {
          ...detailResult.installation,
          client: detailResult.client || undefined,
          installer: detailResult.installer || undefined,
          quote: detailResult.quote || undefined,
        },
        client: detailResult.client,
        quote: detailResult.quote,
        installer: detailResult.installer,
      });
      setChecklistItems(items);
      setInstallations((current) => current.map((item) => item.id === installationId
        ? {
            ...item,
            ...detailResult.installation,
            client: detailResult.client || item.client,
            installer: detailResult.installer || item.installer,
            quote: detailResult.quote || item.quote,
          }
        : item));
      setSelectedItemId((current) => current && items.some((item) => item.id === current) ? current : (items[0]?.id || ''));
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar a instalacao.'});
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadPhotos = React.useCallback(async (itemId: string, nextPage = 0, append = false) => {
    if (!itemId) {
      setItemPhotos([]);
      setItemPhotosTotal(0);
      return;
    }
    setLoadingPhotos(true);
    try {
      const result = await listInstallationChecklistPhotos(itemId, nextPage, PHOTOS_PAGE_SIZE);
      setPhotosPage(nextPage);
      setItemPhotos((current) => {
        const withoutCurrent = current.filter((photo) => photo.checklistItemId !== itemId);
        const merged = append ? [...current.filter((photo) => photo.checklistItemId === itemId), ...result.items] : result.items;
        return [...withoutCurrent, ...Array.from(new Map(merged.map((photo) => [photo.id, photo])).values())];
      });
      setItemPhotosTotal(result.total);
      const missing = result.items.filter((photo) => !photoUrls[photo.id]);
      if (missing.length) {
        const signed = await Promise.all(missing.map(async (photo) => ({id: photo.id, url: await createSignedInstallationPhotoUrl(photo.filePath)})));
        setPhotoUrls((current) => {
          const next = {...current};
          signed.forEach((entry) => {
            next[entry.id] = entry.url;
          });
          return next;
        });
      }
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar as fotos do item.'});
    } finally {
      setLoadingPhotos(false);
    }
  }, [photoUrls]);

  const loadHistory = React.useCallback(async (installationId: string, itemId?: string, nextPage = 0, append = false) => {
    if (!installationId) {
      setHistoryItems([]);
      setHistoryTotal(0);
      return;
    }
    setLoadingHistory(true);
    try {
      const result = await listInstallationHistory(installationId, itemId, nextPage, HISTORY_PAGE_SIZE);
      setHistoryPage(nextPage);
      setHistoryTotal(result.total);
      setHistoryItems((current) => append ? [...current, ...result.items.filter((item) => !current.some((entry) => entry.id === item.id))] : result.items);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel carregar o historico da instalacao.'});
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  React.useEffect(() => {
    void loadInstallations(0, false, search);
  }, [loadInstallations, search]);

  React.useEffect(() => {
    if (!selectedInstallationId) return;
    void loadDetail(selectedInstallationId);
  }, [loadDetail, selectedInstallationId]);

  React.useEffect(() => {
    if (!selectedInstallationId || !selectedItemId) return;
    void loadPhotos(selectedItemId, 0, false);
    void loadHistory(selectedInstallationId, selectedItemId, 0, false);
  }, [loadHistory, loadPhotos, selectedInstallationId, selectedItemId]);

  React.useEffect(() => {
    if (!showCreateModal) return;
    void (async () => {
      setLoadingProjects(true);
      try {
        const [projects, installers] = await Promise.all([
          searchProjectOptionsForInstallation(projectSearch, 20),
          listInstallerEmployees(),
        ]);
        setProjectOptions(projects);
        setInstallerOptions(installers);
      } catch (error) {
        setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel preparar o cadastro de instalacao.'});
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, [projectSearch, showCreateModal]);

  const handleToggleItem = async (item: InstallationChecklistItem) => {
    setSavingItemId(item.id);
    try {
      await updateInstallationChecklistItem(item.id, !item.checked, item.observation || '', actor);
      await loadDetail(selectedInstallationId);
      await loadHistory(selectedInstallationId, selectedItemId || undefined, 0, false);
      setFeedback({type: 'success', message: item.checked ? 'Item reaberto.' : 'Item marcado com sucesso.'});
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel atualizar o checklist.'});
    } finally {
      setSavingItemId('');
    }
  };

  const handleObservationBlur = async (item: InstallationChecklistItem, observation: string) => {
    if ((item.observation || '') === observation) return;
    setSavingItemId(item.id);
    try {
      await updateInstallationChecklistItem(item.id, item.checked, observation, actor);
      await loadDetail(selectedInstallationId);
      await loadHistory(selectedInstallationId, item.id, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel salvar a observacao.'});
    } finally {
      setSavingItemId('');
    }
  };

  const handleCreateInstallation = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedProject = projectOptions.find((item) => item.optionId === selectedProjectId);
    if (!selectedProject) {
      setFeedback({type: 'error', message: 'Selecione um cliente para criar a instalacao.'});
      return;
    }
    if (!selectedProject.quoteId || !selectedProject.hasAvailableQuote) {
      setFeedback({type: 'error', message: 'Este cliente ainda nao possui obra disponivel para vinculacao na instalacao.'});
      return;
    }
    setCreatingInstallation(true);
    try {
      const installationId = await createInstallation({
        clientId: selectedProject.clientId,
        quoteId: selectedProject.quoteId,
        installerEmployeeId: selectedInstallerId || undefined,
        installationDate,
        notes: installationNotes,
      }, actor);
      setFeedback({type: 'success', message: 'Instalacao criada com sucesso.'});
      setShowCreateModal(false);
      setSelectedProjectId('');
      setSelectedInstallerId('');
      setInstallationNotes('');
      await loadInstallations(0, false, search);
      setSelectedInstallationId(installationId);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel criar a instalacao.'});
    } finally {
      setCreatingInstallation(false);
    }
  };

  const openUploadModal = (item: InstallationChecklistItem) => {
    setUploadItem(item);
    setShowUploadModal(true);
    setUploadProgress(0);
    setUploadStatus('');
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files?.length || !uploadItem || !detail.installation || !detail.client) return;
    setUploading(true);
    setUploadProgress(5);
    setUploadStatus('Validando imagens...');
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const prepared = await prepareInstallationImageForUpload(file);
        setUploadProgress(20 + Math.round((index / files.length) * 35));
        setUploadStatus(`Enviando ${index + 1} de ${files.length} (${describeOptimizedInstallationImageSize(prepared.sizeBytes)})...`);
        const fileName = `${Date.now()}-${index + 1}.${prepared.extension}`;
        const filePath = `instalacoes/${detail.client.id}/${uploadItem.id}/${fileName}`;
        await uploadInstallationImageBlob(filePath, prepared.blob, prepared.mimeType);
        await createInstallationPhotoRecord(uploadItem.id, {
          filePath,
          fileName,
          mimeType: prepared.mimeType,
          sizeBytes: prepared.sizeBytes,
          width: prepared.width,
          height: prepared.height,
        }, actor);
      }
      setUploadProgress(100);
      setUploadStatus('Upload concluido.');
      setFeedback({type: 'success', message: 'Fotos adicionadas ao item do checklist.'});
      setShowUploadModal(false);
      await loadDetail(selectedInstallationId);
      await loadPhotos(uploadItem.id, 0, false);
      await loadHistory(selectedInstallationId, uploadItem.id, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel enviar as fotos.'});
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photo: InstallationChecklistPhoto) => {
    if (!window.confirm('Remover esta foto do item?')) return;
    try {
      await softDeleteInstallationPhoto(photo.id, actor);
      setFeedback({type: 'success', message: 'Foto removida.'});
      await loadDetail(selectedInstallationId);
      await loadPhotos(photo.checklistItemId, 0, false);
      await loadHistory(selectedInstallationId, photo.checklistItemId, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel remover a foto.'});
    }
  };

  const handleFinalizeInstallation = async () => {
    if (!selectedInstallationId) return;
    try {
      await finalizeInstallation(selectedInstallationId, actor);
      setFeedback({type: 'success', message: 'Instalacao concluida com sucesso.'});
      await loadDetail(selectedInstallationId);
      await loadHistory(selectedInstallationId, selectedItemId || undefined, 0, false);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message || 'Nao foi possivel concluir a instalacao.'});
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Instalação</h1>
          <p className="mt-1 text-sm text-slate-500">Acompanhamento completo da montagem com checklist, fotos e histórico em tempo real.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-[240px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar instalação"
              className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
          {canCreate ? (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-primary/20"
            >
              <Plus className="h-4 w-4" />
              Adicionar Instalação
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
                <h2 className="text-lg font-display font-bold text-slate-900">Obras em instalação</h2>
                <p className="text-xs text-slate-400">{totalInstallations} registro(s)</p>
              </div>
              <button
                type="button"
                onClick={() => void loadInstallations(0, false, search)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <RefreshCcw className={cn('h-4 w-4', loadingList && 'animate-spin')} />
              </button>
            </div>
            <div className="space-y-3">
              {loadingList && installations.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">Carregando instalações...</div>
              ) : null}
              {!loadingList && installations.length === 0 ? (
                <EmptyState title="Nenhuma instalação cadastrada" body="Crie uma instalação para acompanhar checklist, evidências e progresso da obra." />
              ) : null}
              {installations.map((installation) => (
                <button
                  key={installation.id}
                  type="button"
                  onClick={() => setSelectedInstallationId(installation.id)}
                  className={cn(
                    'w-full rounded-[24px] border p-4 text-left transition-all',
                    selectedInstallationId === installation.id ? 'border-brand-primary bg-brand-primary/5 shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/80',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-900">{installation.client?.name || 'Cliente'}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{installation.client?.address || 'Endereço não informado'}</p>
                    </div>
                    <StatusBadge status={installation.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data</div>
                      <div className="mt-1 font-bold text-slate-900">{formatDate(installation.installationDate as string)}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Equipe</div>
                      <div className="mt-1 font-bold text-slate-900">{installation.installer?.name || 'Não definida'}</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <ProgressBar percent={installation.completionPercent} />
                  </div>
                </button>
              ))}
              {installations.length < totalInstallations ? (
                <button
                  type="button"
                  onClick={() => void loadInstallations(page + 1, true, search)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Carregar mais
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {!detail.installation ? (
            <EmptyState title="Selecione uma instalação" body="Escolha uma obra da lista para abrir os dados do cliente, checklist, fotos e histórico." />
          ) : (
            <>
              <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-display font-bold text-slate-900">{detail.client?.name || 'Cliente'}</h2>
                      <StatusBadge status={detail.installation.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                      <span>{detail.client?.phone || 'Telefone não informado'}</span>
                      <span>{formatDate(detail.installation.installationDate as string)}</span>
                      <span>{detail.installer?.name || 'Equipe não definida'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:min-w-[280px]">
                    <ProgressBar percent={detail.installation.completionPercent} />
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void handleFinalizeInstallation()}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Concluir instalação
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.1fr),minmax(360px,0.9fr)]">
                <div className="space-y-6">
                  <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-5">
                      <h3 className="text-xl font-display font-bold text-slate-900">Dados da instalação</h3>
                      <p className="text-sm text-slate-400">Cliente, endereço, projeto relacionado e observações gerais.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <InfoCard icon={User} label="Cliente" value={detail.client?.name || 'Não informado'} />
                      <InfoCard icon={Phone} label="Telefone" value={detail.client?.phone || 'Não informado'} />
                      <InfoCard icon={CalendarDays} label="Data da instalação" value={formatDate(detail.installation.installationDate as string)} />
                      <InfoCard icon={User} label="Equipe responsável" value={detail.installer?.name || 'Não definida'} />
                      <InfoCard icon={MapPin} label="Endereço" value={detail.client?.address || 'Não informado'} wide />
                      <InfoCard icon={ClipboardCheck} label="Projeto relacionado" value={detail.quote ? `${detail.quote.environment || 'Sem ambiente'} • ${detail.quote.status}` : 'Não informado'} wide />
                    </div>
                    {(detail.installation.notes || detail.quote?.commercialNotes || detail.client?.notes) ? (
                      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                        <div className="font-bold text-slate-800">Observações</div>
                        <div className="mt-2 space-y-2">
                          {detail.installation.notes ? <p>{detail.installation.notes}</p> : null}
                          {detail.quote?.commercialNotes ? <p>{detail.quote.commercialNotes}</p> : null}
                          {detail.client?.notes ? <p>{detail.client.notes}</p> : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-display font-bold text-slate-900">Checklist</h3>
                        <p className="text-sm text-slate-400">Marcação rápida com observação, fotos e responsável por item.</p>
                      </div>
                      {loadingDetail ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : null}
                    </div>

                    <div className="space-y-6">
                      {groupedChecklist.map((group) => (
                        <div key={group.groupKey} className="space-y-3">
                          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{group.groupLabel}</div>
                          <div className="space-y-3">
                            {group.items.map((item) => (
                              <div
                                key={item.id}
                                className={cn(
                                  'rounded-[24px] border p-4 transition-all',
                                  selectedItemId === item.id ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-100 bg-white hover:border-slate-200',
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleItem(item)}
                                    disabled={savingItemId === item.id || !canEdit}
                                    className={cn(
                                      'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all',
                                      item.checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent',
                                      !canEdit && 'opacity-60',
                                    )}
                                  >
                                    {savingItemId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  </button>
                                  <button type="button" onClick={() => setSelectedItemId(item.id)} className="min-w-0 flex-1 text-left">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-sm font-bold text-slate-900">{item.title}</div>
                                      {item.required ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">Obrigatório</span> : null}
                                      {item.photoCount > 0 ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">{item.photoCount} foto(s)</span> : null}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-400">
                                      {item.checked ? `Marcado por ${item.checkedByName || 'Usuario'} em ${formatDateTime(item.checkedAt as string)}` : `Última atualização ${formatDateTime(item.updatedAt as string)}`}
                                    </div>
                                  </button>
                                </div>
                                <div className="mt-3">
                                  <textarea
                                    defaultValue={item.observation || ''}
                                    onBlur={(event) => void handleObservationBlur(item, event.target.value)}
                                    placeholder="Observação opcional..."
                                    className="min-h-[84px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-brand-primary/20"
                                  />
                                </div>
                                <div className="mt-3 flex justify-end">
                                  {canUpload ? (
                                    <button
                                      type="button"
                                      onClick={() => openUploadModal(item)}
                                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                                    >
                                      <ImagePlus className="h-4 w-4" />
                                      Fotos
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
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
                        <h3 className="text-xl font-display font-bold text-slate-900">{selectedItem?.title || 'Selecione um item'}</h3>
                        <p className="text-sm text-slate-400">Fotos e histórico do item selecionado.</p>
                      </div>
                    </div>

                    {!selectedItem ? (
                      <EmptyState title="Nenhum item selecionado" body="Toque em um item do checklist para acompanhar fotos e histórico." />
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Fotos</h4>
                            {canUpload ? (
                              <button
                                type="button"
                                onClick={() => openUploadModal(selectedItem)}
                                className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                              >
                                <Upload className="h-4 w-4" />
                                Adicionar foto
                              </button>
                            ) : null}
                          </div>
                          {loadingPhotos && activeSelectedPhotos.length === 0 ? (
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Carregando fotos...</div>
                          ) : null}
                          {!loadingPhotos && activeSelectedPhotos.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                              Ainda não existem fotos neste item.
                            </div>
                          ) : null}
                          {activeSelectedPhotos.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                              {activeSelectedPhotos.map((photo) => (
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
                                    ) : null}
                                  </button>
                                  <div className="flex items-center justify-between gap-2 p-3">
                                    <div className="min-w-0 text-[11px] text-slate-400">{formatDateTime(photo.createdAt as string)}</div>
                                    {canUpload ? (
                                      <button type="button" onClick={() => void handleDeletePhoto(photo)} className="text-red-500 hover:text-red-600">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {activeSelectedPhotos.length < itemPhotosTotal ? (
                            <button
                              type="button"
                              onClick={() => void loadPhotos(selectedItem.id, photosPage + 1, true)}
                              className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                            >
                              Carregar mais fotos
                            </button>
                          ) : null}
                        </div>

                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Histórico</h4>
                            {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                          </div>
                          <div className="space-y-3">
                            {historyItems.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                                Nenhum evento registrado ainda.
                              </div>
                            ) : historyItems.map((entry) => (
                              <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                <div className="text-sm font-semibold text-slate-800">{entry.message}</div>
                                <div className="mt-1 text-xs text-slate-400">{entry.userName || 'Usuario'} • {formatDateTime(entry.createdAt as string)}</div>
                              </div>
                            ))}
                          </div>
                          {historyItems.length < historyTotal ? (
                            <button
                              type="button"
                              onClick={() => void loadHistory(selectedInstallationId, selectedItem.id, historyPage + 1, true)}
                              className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                            >
                              Carregar mais histórico
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

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Nova instalação</h3>
                <p className="text-sm text-slate-400">Vincule a instalação a uma obra já existente no sistema.</p>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-2xl bg-slate-100 p-2 text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInstallation} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-500">Buscar obra</span>
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    placeholder="Cliente, ambiente ou endereco"
                    className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                  />
                </div>
              </label>

              <div className="max-h-[28vh] space-y-3 overflow-y-auto pr-1">
                {loadingProjects ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Buscando clientes...</div>
                ) : projectOptions.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Nenhum cliente encontrado.</div>
                ) : projectOptions.map((project) => (
                  <button
                    key={project.optionId}
                    type="button"
                    onClick={() => setSelectedProjectId(project.optionId)}
                    className={cn(
                      'w-full rounded-[24px] border p-4 text-left transition-all',
                      selectedProjectId === project.optionId ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-100 bg-white hover:border-slate-200',
                      !project.hasAvailableQuote && 'opacity-80',
                    )}
                  >
                    <div className="font-bold text-slate-900">{project.clientName}</div>
                    <div className="mt-1 text-sm text-slate-500">{project.environment}</div>
                    <div className="mt-1 text-xs text-slate-400">{project.address || 'Endereço não informado'}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {project.status ? (
                        <div className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          {project.status}
                        </div>
                      ) : null}
                      {!project.hasAvailableQuote ? (
                        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          Sem obra disponivel
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-500">Data da instalação</span>
                  <input
                    type="date"
                    value={installationDate}
                    onChange={(event) => setInstallationDate(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-500">Instalador responsável</span>
                  <select
                    value={selectedInstallerId}
                    onChange={(event) => setSelectedInstallerId(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none"
                  >
                    <option value="">Selecionar equipe</option>
                    {installerOptions.map((installer) => (
                      <option key={installer.id} value={installer.id}>{installer.name} • {installer.role}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-500">Observações</span>
                <textarea
                  value={installationNotes}
                  onChange={(event) => setInstallationNotes(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none"
                />
              </label>

              <button
                type="submit"
                disabled={creatingInstallation}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {creatingInstallation ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Criar instalação
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showUploadModal && uploadItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Fotos do checklist</h3>
                <p className="text-sm text-slate-400">{uploadItem.title}</p>
              </div>
              <button type="button" onClick={() => !uploading && setShowUploadModal(false)} className="rounded-2xl bg-slate-100 p-2 text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
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
                  <div className="mt-1 text-xs text-slate-400">Compressão automática, WebP quando suportado e tamanho otimizado para uso em campo.</div>
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

const InfoCard = ({
  icon: Icon,
  label,
  value,
  wide = false,
}: {
  icon: React.ComponentType<{className?: string}>;
  label: string;
  value: string;
  wide?: boolean;
}) => (
  <div className={cn('rounded-2xl bg-slate-50 p-4', wide && 'md:col-span-2')}>
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</div>
        <div className="mt-1 break-words font-semibold text-slate-800">{value}</div>
      </div>
    </div>
  </div>
);
