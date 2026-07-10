import {supabase} from './supabase';
import {invalidateCollectionSnapshots} from './firestore';
import {Client, CrisisClientCase, CrisisHistoryEvent, CrisisTask, CrisisTaskPhoto} from '../types';

type Actor = {
  uid: string;
  name: string;
  empresaId?: string;
};

export type CrisisCaseListItem = CrisisClientCase & {
  client?: Pick<Client, 'id' | 'name' | 'phone' | 'city' | 'address'>;
};

type PaginatedResult<T> = {
  items: T[];
  total: number;
};

const CRISIS_FILES_BUCKET = 'crisis-files';

const createId = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
};

const ensureSuccess = <T>(result: {data: T; error: {message?: string} | null}) => {
  if (result.error) {
    throw new Error(result.error.message || 'Nao foi possivel concluir a operacao.');
  }
  return result.data;
};

const mapCrisisCase = (row: any): CrisisClientCase => ({
  id: row.id,
  empresaId: row.empresa_id,
  clientId: row.client_id,
  taskCount: Number(row.task_count || 0),
  completedTaskCount: Number(row.completed_task_count || 0),
  completionPercent: Number(row.completion_percent || 0),
  visualStatus: row.visual_status,
  createdByUid: row.created_by_uid || '',
  createdByName: row.created_by_name || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
  deletedAt: row.deleted_at || null,
  deletedByUid: row.deleted_by_uid || '',
  deletedByName: row.deleted_by_name || '',
});

const mapClientPreview = (row: any): Pick<Client, 'id' | 'name' | 'phone' | 'city' | 'address'> => ({
  id: row.id,
  name: row.name || '',
  phone: row.phone || '',
  city: row.city || '',
  address: row.address || '',
});

const mapTask = (row: any): CrisisTask => ({
  id: row.id,
  empresaId: row.empresa_id,
  crisisClientId: row.crisis_client_id,
  title: row.title || '',
  description: row.description || '',
  status: row.status,
  sortOrder: Number(row.sort_order || 0),
  scheduledFor: row.scheduled_for || null,
  scheduleStartTime: row.schedule_start_time || '',
  scheduleEndTime: row.schedule_end_time || '',
  scheduleNote: row.schedule_note || '',
  scheduledCalendarEventId: row.scheduled_calendar_event_id || '',
  scheduleUpdatedAt: row.schedule_updated_at || null,
  scheduleUpdatedByUid: row.schedule_updated_by_uid || '',
  scheduleUpdatedByName: row.schedule_updated_by_name || '',
  createdByUid: row.created_by_uid || '',
  createdByName: row.created_by_name || '',
  completedAt: row.completed_at || null,
  completedByUid: row.completed_by_uid || '',
  completedByName: row.completed_by_name || '',
  reopenedAt: row.reopened_at || null,
  reopenedByUid: row.reopened_by_uid || '',
  reopenedByName: row.reopened_by_name || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
  deletedAt: row.deleted_at || null,
  deletedByUid: row.deleted_by_uid || '',
  deletedByName: row.deleted_by_name || '',
});

const mapPhoto = (row: any): CrisisTaskPhoto => ({
  id: row.id,
  empresaId: row.empresa_id,
  crisisTaskId: row.crisis_task_id,
  bucketId: row.bucket_id,
  filePath: row.file_path,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes || 0),
  width: row.width || undefined,
  height: row.height || undefined,
  captureKind: row.capture_kind || undefined,
  createdByUid: row.created_by_uid || '',
  createdByName: row.created_by_name || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
  deletedAt: row.deleted_at || null,
  deletedByUid: row.deleted_by_uid || '',
  deletedByName: row.deleted_by_name || '',
});

const mapHistory = (row: any): CrisisHistoryEvent => ({
  id: row.id,
  empresaId: row.empresa_id,
  crisisClientId: row.crisis_client_id,
  crisisTaskId: row.crisis_task_id || undefined,
  eventType: row.event_type,
  message: row.message || '',
  metadata: row.metadata || {},
  userUid: row.user_uid || '',
  userName: row.user_name || '',
  createdAt: row.created_at || '',
});

export const listCrisisCases = async (
  page = 0,
  pageSize = 12,
  search = '',
): Promise<PaginatedResult<CrisisCaseListItem>> => {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let request = supabase
    .from('crisis_clients')
    .select('id, empresa_id, client_id, task_count, completed_task_count, completion_percent, visual_status, created_by_uid, created_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name', {count: 'exact'})
    .is('deleted_at', null)
    .order('updated_at', {ascending: false})
    .range(from, to);

  if (search.trim()) {
    const clientSearch = await supabase
      .from('clients')
      .select('id')
      .or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,city.ilike.%${search.trim()}%`)
      .limit(50);

    const matchingIds = ensureSuccess(clientSearch).map((row: any) => row.id).filter(Boolean);
    if (matchingIds.length === 0) {
      return {items: [], total: 0};
    }
    request = request.in('client_id', matchingIds);
  }

  const result = await request;
  const rows = ensureSuccess(result) || [];
  const cases = rows.map(mapCrisisCase);
  const clientIds = Array.from(new Set(cases.map((item) => item.clientId).filter(Boolean)));

  const clientsById = new Map<string, Pick<Client, 'id' | 'name' | 'phone' | 'city' | 'address'>>();
  if (clientIds.length) {
    const clientRows = ensureSuccess(await supabase
      .from('clients')
      .select('id, name, phone, city, address')
      .in('id', clientIds));
    clientRows.forEach((row: any) => clientsById.set(row.id, mapClientPreview(row)));
  }

  return {
    items: cases.map((item) => ({...item, client: clientsById.get(item.clientId)})),
    total: result.count || 0,
  };
};

export const searchClientsForCrisis = async (search = '', limit = 20) => {
  let request = supabase
    .from('clients')
    .select('id, name, phone, city, address')
    .order('name', {ascending: true})
    .limit(limit);

  if (search.trim()) {
    request = request.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,city.ilike.%${search.trim()}%`);
  }

  return ensureSuccess(await request).map(mapClientPreview);
};

export const createCrisisCase = async (clientId: string, actor: Actor) => {
  const payload = {
    id: createId(),
    empresa_id: actor.empresaId || 'dcoratto-main',
    client_id: clientId,
    created_by_uid: actor.uid,
    created_by_name: actor.name,
  };

  const inserted = ensureSuccess(await supabase
    .from('crisis_clients')
    .insert(payload)
    .select('id, empresa_id, client_id, task_count, completed_task_count, completion_percent, visual_status, created_by_uid, created_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .single());

  await addCrisisHistoryEvent({
    crisisClientId: inserted.id,
    eventType: 'case_created',
    message: `${actor.name} adicionou o cliente na Gestao de Crise`,
    actor,
    metadata: {clientId},
  });

  return mapCrisisCase(inserted);
};

export const getCrisisCase = async (crisisClientId: string) => {
  const row = ensureSuccess(await supabase
    .from('crisis_clients')
    .select('id, empresa_id, client_id, task_count, completed_task_count, completion_percent, visual_status, created_by_uid, created_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .eq('id', crisisClientId)
    .is('deleted_at', null)
    .single());

  const client = ensureSuccess(await supabase
    .from('clients')
    .select('id, name, phone, city, address')
    .eq('id', row.client_id)
    .single());

  return {...mapCrisisCase(row), client: mapClientPreview(client)};
};

export const listCrisisTasks = async (crisisClientId: string) => {
  const rows = ensureSuccess(await supabase
    .from('crisis_tasks')
    .select('id, empresa_id, crisis_client_id, title, description, status, sort_order, scheduled_for, schedule_start_time, schedule_end_time, schedule_note, scheduled_calendar_event_id, schedule_updated_at, schedule_updated_by_uid, schedule_updated_by_name, created_by_uid, created_by_name, completed_at, completed_by_uid, completed_by_name, reopened_at, reopened_by_uid, reopened_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .eq('crisis_client_id', crisisClientId)
    .is('deleted_at', null)
    .order('status', {ascending: true})
    .order('sort_order', {ascending: true})
    .order('created_at', {ascending: false}));

  return rows.map(mapTask);
};

export const createCrisisTask = async (
  crisisClientId: string,
  values: {title: string; description?: string},
  actor: Actor,
) => {
  const currentTasks = await listCrisisTasks(crisisClientId);
  const payload = {
    id: createId(),
    empresa_id: actor.empresaId || 'dcoratto-main',
    crisis_client_id: crisisClientId,
    title: values.title.trim(),
    description: values.description?.trim() || '',
    status: 'pending',
    sort_order: currentTasks.length,
    created_by_uid: actor.uid,
    created_by_name: actor.name,
  };

  const inserted = ensureSuccess(await supabase
    .from('crisis_tasks')
    .insert(payload)
    .select('id, empresa_id, crisis_client_id, title, description, status, sort_order, scheduled_for, schedule_start_time, schedule_end_time, schedule_note, scheduled_calendar_event_id, schedule_updated_at, schedule_updated_by_uid, schedule_updated_by_name, created_by_uid, created_by_name, completed_at, completed_by_uid, completed_by_name, reopened_at, reopened_by_uid, reopened_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .single());

  await addCrisisHistoryEvent({
    crisisClientId,
    crisisTaskId: inserted.id,
    eventType: 'task_created',
    message: `${actor.name} criou a tarefa "${payload.title}"`,
    actor,
  });

  return mapTask(inserted);
};

export const updateCrisisTask = async (
  taskId: string,
  crisisClientId: string,
  values: {title: string; description?: string},
  actor: Actor,
) => {
  const updated = ensureSuccess(await supabase
    .from('crisis_tasks')
    .update({
      title: values.title.trim(),
      description: values.description?.trim() || '',
    })
    .eq('id', taskId)
    .select('id, empresa_id, crisis_client_id, title, description, status, sort_order, scheduled_for, schedule_start_time, schedule_end_time, schedule_note, scheduled_calendar_event_id, schedule_updated_at, schedule_updated_by_uid, schedule_updated_by_name, created_by_uid, created_by_name, completed_at, completed_by_uid, completed_by_name, reopened_at, reopened_by_uid, reopened_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .single());

  if (updated.scheduled_calendar_event_id) {
    const caseRow = ensureSuccess(await supabase
      .from('crisis_clients')
      .select('client_id, clients(name)')
      .eq('id', crisisClientId)
      .single()) as {client_id?: string; clients?: {name?: string} | {name?: string}[]};

    const linkedClient = Array.isArray(caseRow.clients) ? caseRow.clients[0] : caseRow.clients;
    ensureSuccess(await supabase
      .from('calendar_events')
      .update({
        title: `Gestao de Crise — ${linkedClient?.name || 'Cliente'} — ${values.title.trim()}`,
      })
      .eq('id', updated.scheduled_calendar_event_id)
      .eq('crisis_task_id', taskId));

    invalidateCollectionSnapshots('calendarEvents');
  }

  await addCrisisHistoryEvent({
    crisisClientId,
    crisisTaskId: taskId,
    eventType: 'task_updated',
    message: `${actor.name} atualizou a tarefa "${values.title.trim()}"`,
    actor,
  });

  return mapTask(updated);
};

export const completeCrisisTask = async (taskId: string, crisisClientId: string, actor: Actor) => {
  const updated = ensureSuccess(await supabase
    .from('crisis_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by_uid: actor.uid,
      completed_by_name: actor.name,
    })
    .eq('id', taskId)
    .select('id, empresa_id, crisis_client_id, title, description, status, sort_order, scheduled_for, schedule_start_time, schedule_end_time, schedule_note, scheduled_calendar_event_id, schedule_updated_at, schedule_updated_by_uid, schedule_updated_by_name, created_by_uid, created_by_name, completed_at, completed_by_uid, completed_by_name, reopened_at, reopened_by_uid, reopened_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .single());

  await addCrisisHistoryEvent({
    crisisClientId,
    crisisTaskId: taskId,
    eventType: 'task_completed',
    message: `${actor.name} marcou a tarefa "${updated.title}" como concluida`,
    actor,
  });

  return mapTask(updated);
};

export const reopenCrisisTask = async (taskId: string, crisisClientId: string, actor: Actor) => {
  const updated = ensureSuccess(await supabase
    .from('crisis_tasks')
    .update({
      status: 'pending',
      reopened_at: new Date().toISOString(),
      reopened_by_uid: actor.uid,
      reopened_by_name: actor.name,
      completed_at: null,
      completed_by_uid: null,
      completed_by_name: null,
    })
    .eq('id', taskId)
    .select('id, empresa_id, crisis_client_id, title, description, status, sort_order, scheduled_for, schedule_start_time, schedule_end_time, schedule_note, scheduled_calendar_event_id, schedule_updated_at, schedule_updated_by_uid, schedule_updated_by_name, created_by_uid, created_by_name, completed_at, completed_by_uid, completed_by_name, reopened_at, reopened_by_uid, reopened_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .single());

  await addCrisisHistoryEvent({
    crisisClientId,
    crisisTaskId: taskId,
    eventType: 'task_reopened',
    message: `${actor.name} reabriu a tarefa "${updated.title}"`,
    actor,
  });

  return mapTask(updated);
};

export const softDeleteCrisisTask = async (taskId: string, crisisClientId: string, actor: Actor) => {
  const updated = ensureSuccess(await supabase
    .from('crisis_tasks')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_uid: actor.uid,
      deleted_by_name: actor.name,
    })
    .eq('id', taskId)
    .is('deleted_at', null)
    .select('title')
    .single());

  await addCrisisHistoryEvent({
    crisisClientId,
    crisisTaskId: taskId,
    eventType: 'task_deleted',
    message: `${actor.name} removeu a tarefa "${updated.title}"`,
    actor,
  });
};

export const scheduleCrisisTask = async (
  taskId: string,
  values: {
    scheduleDate: string;
    startTime?: string;
    endTime?: string;
    note?: string;
  },
  actor: Actor,
) => {
  const result = ensureSuccess(await supabase.rpc('upsert_crisis_task_schedule', {
    p_task_id: taskId,
    p_schedule_date: values.scheduleDate,
    p_start_time: values.startTime || null,
    p_end_time: values.endTime || null,
    p_schedule_note: values.note || null,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  }));

  invalidateCollectionSnapshots('calendarEvents');
  return result;
};

export const removeCrisisTaskSchedule = async (taskId: string, actor: Actor) => {
  const result = ensureSuccess(await supabase.rpc('remove_crisis_task_schedule', {
    p_task_id: taskId,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  }));

  invalidateCollectionSnapshots('calendarEvents');
  return result;
};

export const listCrisisTaskPhotos = async (
  crisisTaskId: string,
  page = 0,
  pageSize = 12,
): Promise<PaginatedResult<CrisisTaskPhoto>> => {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const result = await supabase
    .from('crisis_task_photos')
    .select('id, empresa_id, crisis_task_id, bucket_id, file_path, file_name, mime_type, size_bytes, width, height, capture_kind, created_by_uid, created_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name', {count: 'exact'})
    .eq('crisis_task_id', crisisTaskId)
    .is('deleted_at', null)
    .order('created_at', {ascending: false})
    .range(from, to);

  return {
    items: ensureSuccess(result).map(mapPhoto),
    total: result.count || 0,
  };
};

export const createCrisisPhotoRecord = async (
  crisisTaskId: string,
  crisisClientId: string,
  values: {
    filePath: string;
    fileName: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    sizeBytes: number;
    width?: number;
    height?: number;
    captureKind?: 'before' | 'after' | 'evidence';
  },
  actor: Actor,
) => {
  const inserted = ensureSuccess(await supabase
    .from('crisis_task_photos')
    .insert({
      id: createId(),
      empresa_id: actor.empresaId || 'dcoratto-main',
      crisis_task_id: crisisTaskId,
      bucket_id: CRISIS_FILES_BUCKET,
      file_path: values.filePath,
      file_name: values.fileName,
      mime_type: values.mimeType,
      size_bytes: values.sizeBytes,
      width: values.width || null,
      height: values.height || null,
      capture_kind: values.captureKind || null,
      created_by_uid: actor.uid,
      created_by_name: actor.name,
    })
    .select('id, empresa_id, crisis_task_id, bucket_id, file_path, file_name, mime_type, size_bytes, width, height, capture_kind, created_by_uid, created_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .single());

  await addCrisisHistoryEvent({
    crisisClientId,
    crisisTaskId,
    eventType: 'photo_added',
    message: `${actor.name} adicionou uma foto na tarefa`,
    actor,
    metadata: {fileName: values.fileName, captureKind: values.captureKind || 'evidence'},
  });

  return mapPhoto(inserted);
};

export const softDeleteCrisisPhoto = async (
  photo: CrisisTaskPhoto,
  crisisClientId: string,
  actor: Actor,
) => {
  ensureSuccess(await supabase
    .from('crisis_task_photos')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_uid: actor.uid,
      deleted_by_name: actor.name,
    })
    .eq('id', photo.id)
    .is('deleted_at', null)
    .select('id')
    .single());

  await addCrisisHistoryEvent({
    crisisClientId,
    crisisTaskId: photo.crisisTaskId,
    eventType: 'photo_removed',
    message: `${actor.name} removeu uma foto da tarefa`,
    actor,
    metadata: {fileName: photo.fileName},
  });
};

export const listCrisisHistory = async (
  crisisClientId: string,
  page = 0,
  pageSize = 20,
  crisisTaskId?: string,
): Promise<PaginatedResult<CrisisHistoryEvent>> => {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let request = supabase
    .from('crisis_history')
    .select('id, empresa_id, crisis_client_id, crisis_task_id, event_type, message, metadata, user_uid, user_name, created_at', {count: 'exact'})
    .eq('crisis_client_id', crisisClientId)
    .order('created_at', {ascending: false})
    .range(from, to);

  if (crisisTaskId) {
    request = request.eq('crisis_task_id', crisisTaskId);
  }

  const result = await request;
  return {
    items: ensureSuccess(result).map(mapHistory),
    total: result.count || 0,
  };
};

export const addCrisisHistoryEvent = async ({
  crisisClientId,
  crisisTaskId,
  eventType,
  message,
  actor,
  metadata,
}: {
  crisisClientId: string;
  crisisTaskId?: string;
  eventType: string;
  message: string;
  actor: Actor;
  metadata?: Record<string, unknown>;
}) => {
  ensureSuccess(await supabase
    .from('crisis_history')
    .insert({
      id: createId(),
      empresa_id: actor.empresaId || 'dcoratto-main',
      crisis_client_id: crisisClientId,
      crisis_task_id: crisisTaskId || null,
      event_type: eventType,
      message,
      metadata: metadata || {},
      user_uid: actor.uid,
      user_name: actor.name,
    }));
};

export const uploadCrisisImageBlob = async (path: string, blob: Blob, contentType: string) => {
  ensureSuccess(await supabase.storage
    .from(CRISIS_FILES_BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType,
      cacheControl: '3600',
    }));
};

export const createSignedCrisisPhotoUrl = async (filePath: string, expiresInSeconds = 3600) => {
  const result = await supabase.storage
    .from(CRISIS_FILES_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);

  return ensureSuccess(result).signedUrl;
};

export const removeCrisisImageObject = async (filePath: string) => {
  ensureSuccess(await supabase.storage
    .from(CRISIS_FILES_BUCKET)
    .remove([filePath]));
};
