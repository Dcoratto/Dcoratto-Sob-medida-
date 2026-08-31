import {supabase} from './supabase';
import type {
  Client,
  Employee,
  EmployeeActivityPause,
  EmployeeActivitySession,
  EmployeeAttendanceRecord,
  EmployeeFunction,
  EmployeeOperationalOverview,
  EmployeeRole,
  EmployeeStatus,
  EmployeeWorkSchedule,
  ProductionStep,
  Quote,
} from '../types';

export type WorkforceActor = {
  uid: string;
  name: string;
};

export type EmployeeFunctionCatalogItem = {
  key: string;
  label: string;
  linkedProductionStep?: ProductionStep | null;
  sortOrder: number;
};

export type EmployeeProfileDraft = {
  id?: string;
  name: string;
  displayName: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  admissionDate: string;
  phone: string;
  notes: string;
  photoUrl: string;
  thumbnailUrl: string;
  mediumUrl: string;
  originalUrl: string;
  functions: Array<{
    functionKey: string;
    functionLabel: string;
    linkedProductionStep?: ProductionStep | null;
    isPrimary?: boolean;
  }>;
  schedule: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    notes?: string;
  }>;
};

export type EmployeeAttendanceDraft = {
  employeeId: string;
  workDate: string;
  status: EmployeeAttendanceRecord['status'];
  checkInAt?: string | null;
  breakStartAt?: string | null;
  breakEndAt?: string | null;
  checkOutAt?: string | null;
  notes?: string;
};

export type EmployeeActivityDraft = {
  employeeId: string;
  clientId: string;
  quoteId: string;
  functionKey: string;
  pieceId?: string;
  pieceLabel?: string;
  notes?: string;
};

export type EmployeeActivityTarget = {
  id: string;
  clientId: string;
  clientName: string;
  environment: string;
  status: string;
  pieces: Array<{id: string; label: string}>;
};

type OverviewRow = {
  employee_id: string;
  empresa_id: string;
  employee_name: string;
  employee_display_name: string;
  employee_role: string;
  employee_status: EmployeeStatus;
  employee_active: boolean;
  employee_phone?: string | null;
  admission_date?: string | null;
  employee_notes?: string | null;
  photo_url?: string | null;
  thumbnail_url?: string | null;
  medium_url?: string | null;
  original_url?: string | null;
  function_assignments?: Array<{
    id: string;
    employeeId: string;
    functionKey: string;
    functionLabel: string;
    linkedProductionStep?: ProductionStep | null;
    isPrimary?: boolean;
  }> | null;
  attendance_id?: string | null;
  attendance_work_date?: string | null;
  attendance_status?: EmployeeAttendanceRecord['status'] | null;
  attendance_check_in_at?: string | null;
  attendance_break_start_at?: string | null;
  attendance_break_end_at?: string | null;
  attendance_check_out_at?: string | null;
  attendance_worked_minutes?: number | null;
  attendance_expected_minutes?: number | null;
  attendance_overtime_minutes?: number | null;
  current_session_id?: string | null;
  current_session_status?: EmployeeActivitySession['status'] | null;
  current_function_key?: string | null;
  current_function_label?: string | null;
  current_linked_production_step?: ProductionStep | null;
  current_client_id?: string | null;
  current_client_name?: string | null;
  current_quote_id?: string | null;
  current_quote_label?: string | null;
  current_piece_id?: string | null;
  current_piece_label?: string | null;
  current_started_at?: string | null;
  current_active_pause_started_at?: string | null;
  current_paused_total_seconds?: number | null;
  current_productive_minutes?: number | null;
  today_worked_minutes?: number | null;
  today_productive_minutes?: number | null;
  today_idle_minutes?: number | null;
  today_overtime_minutes?: number | null;
  today_completed_activities?: number | null;
  month_worked_minutes?: number | null;
  month_productive_minutes?: number | null;
  month_idle_minutes?: number | null;
  month_overtime_minutes?: number | null;
  month_completed_activities?: number | null;
};

const ensureSuccess = <T>(result: {data: T; error: {message?: string} | null}) => {
  if (result.error) throw new Error(result.error.message || 'Não foi possível concluir a operação.');
  return result.data;
};

const mapEmployee = (row: OverviewRow): Employee => ({
  id: row.employee_id,
  empresaId: row.empresa_id,
  name: row.employee_name,
  displayName: row.employee_display_name,
  role: row.employee_role,
  status: row.employee_status,
  admissionDate: row.admission_date || undefined,
  phone: row.employee_phone || undefined,
  notes: row.employee_notes || undefined,
  photoUrl: row.photo_url || undefined,
  thumbnailUrl: row.thumbnail_url || undefined,
  mediumUrl: row.medium_url || undefined,
  originalUrl: row.original_url || undefined,
  active: Boolean(row.employee_active),
});

const mapFunctions = (row: OverviewRow): EmployeeFunction[] =>
  (row.function_assignments || []).map((item) => ({
    id: item.id,
    employeeId: item.employeeId,
    functionKey: item.functionKey,
    functionLabel: item.functionLabel,
    linkedProductionStep: item.linkedProductionStep || undefined,
    isPrimary: Boolean(item.isPrimary),
  }));

const mapAttendance = (row: OverviewRow): EmployeeAttendanceRecord | null => {
  if (!row.attendance_id || !row.attendance_work_date || !row.attendance_status) return null;
  return {
    id: row.attendance_id,
    employeeId: row.employee_id,
    workDate: row.attendance_work_date,
    status: row.attendance_status,
    checkInAt: row.attendance_check_in_at || null,
    breakStartAt: row.attendance_break_start_at || null,
    breakEndAt: row.attendance_break_end_at || null,
    checkOutAt: row.attendance_check_out_at || null,
    workedMinutes: Number(row.attendance_worked_minutes) || 0,
    expectedMinutes: Number(row.attendance_expected_minutes) || 0,
    overtimeMinutes: Number(row.attendance_overtime_minutes) || 0,
  };
};

const mapCurrentSession = (row: OverviewRow): EmployeeActivitySession | null => {
  if (!row.current_session_id || !row.current_session_status || !row.current_function_key || !row.current_function_label || !row.current_started_at) {
    return null;
  }

  return {
    id: row.current_session_id,
    employeeId: row.employee_id,
    clientId: row.current_client_id || null,
    quoteId: row.current_quote_id || null,
    functionKey: row.current_function_key,
    functionLabel: row.current_function_label,
    linkedProductionStep: row.current_linked_production_step || undefined,
    pieceId: row.current_piece_id || null,
    pieceLabel: row.current_piece_label || null,
    status: row.current_session_status,
    startedAt: row.current_started_at,
    activePauseStartedAt: row.current_active_pause_started_at || null,
    pausedTotalSeconds: Number(row.current_paused_total_seconds) || 0,
    productiveSeconds: (Number(row.current_productive_minutes) || 0) * 60,
    client: row.current_client_name ? {id: row.current_client_id || '', name: row.current_client_name, city: ''} : null,
    quote: row.current_quote_id ? {id: row.current_quote_id, clientName: row.current_client_name || undefined, environment: row.current_quote_label || undefined} : null,
  };
};

export const listEmployeeOperationalOverview = async (search = ''): Promise<EmployeeOperationalOverview[]> => {
  let request = supabase
    .from('employee_operational_overview')
    .select([
      'employee_id',
      'empresa_id',
      'employee_name',
      'employee_display_name',
      'employee_role',
      'employee_status',
      'employee_active',
      'employee_phone',
      'admission_date',
      'employee_notes',
      'photo_url',
      'thumbnail_url',
      'medium_url',
      'original_url',
      'function_assignments',
      'attendance_id',
      'attendance_work_date',
      'attendance_status',
      'attendance_check_in_at',
      'attendance_break_start_at',
      'attendance_break_end_at',
      'attendance_check_out_at',
      'attendance_worked_minutes',
      'attendance_expected_minutes',
      'attendance_overtime_minutes',
      'current_session_id',
      'current_session_status',
      'current_function_key',
      'current_function_label',
      'current_linked_production_step',
      'current_client_id',
      'current_client_name',
      'current_quote_id',
      'current_quote_label',
      'current_piece_id',
      'current_piece_label',
      'current_started_at',
      'current_active_pause_started_at',
      'current_paused_total_seconds',
      'current_productive_minutes',
      'today_worked_minutes',
      'today_productive_minutes',
      'today_idle_minutes',
      'today_overtime_minutes',
      'today_completed_activities',
      'month_worked_minutes',
      'month_productive_minutes',
      'month_idle_minutes',
      'month_overtime_minutes',
      'month_completed_activities',
    ].join(','))
    .order('employee_display_name', {ascending: true});

  const normalized = search.trim().replace(/[%_,()]/g, '');
  if (normalized) {
    request = request.or(`employee_name.ilike.%${normalized}%,employee_display_name.ilike.%${normalized}%,employee_role.ilike.%${normalized}%`);
  }

  const rows = ensureSuccess(await request) as unknown as OverviewRow[];
  return rows.map((row) => ({
    employee: mapEmployee(row),
    functions: mapFunctions(row),
    attendanceToday: mapAttendance(row),
    currentSession: mapCurrentSession(row),
    today: {
      workedMinutes: Number(row.today_worked_minutes) || 0,
      productiveMinutes: Number(row.today_productive_minutes) || 0,
      idleMinutes: Number(row.today_idle_minutes) || 0,
      overtimeMinutes: Number(row.today_overtime_minutes) || 0,
      completedActivities: Number(row.today_completed_activities) || 0,
    },
    month: {
      workedMinutes: Number(row.month_worked_minutes) || 0,
      productiveMinutes: Number(row.month_productive_minutes) || 0,
      idleMinutes: Number(row.month_idle_minutes) || 0,
      overtimeMinutes: Number(row.month_overtime_minutes) || 0,
      completedActivities: Number(row.month_completed_activities) || 0,
    },
  }));
};

export const listEmployeeFunctionCatalog = async (): Promise<EmployeeFunctionCatalogItem[]> => {
  const rows = ensureSuccess(await supabase
    .from('employee_function_catalog')
    .select('key,label,linked_production_step,sort_order')
    .eq('active', true)
    .order('sort_order', {ascending: true})
    .order('label', {ascending: true})) as Array<{
      key: string;
      label: string;
      linked_production_step?: ProductionStep | null;
      sort_order: number;
    }>;

  return rows.map((item) => ({
    key: item.key,
    label: item.label,
    linkedProductionStep: item.linked_production_step || undefined,
    sortOrder: Number(item.sort_order) || 0,
  }));
};

export const listEmployeeSchedules = async (employeeId: string): Promise<EmployeeWorkSchedule[]> => {
  if (!employeeId) return [];
  const rows = ensureSuccess(await supabase
    .from('employee_work_schedules')
    .select('id,empresa_id,employee_id,weekday,is_working_day,start_time,end_time,break_minutes,expected_minutes,notes,created_at,updated_at')
    .eq('employee_id', employeeId)
    .order('weekday', {ascending: true})) as Array<any>;

  return rows.map((item) => ({
    id: item.id,
    empresaId: item.empresa_id,
    employeeId: item.employee_id,
    weekday: Number(item.weekday) || 0,
    isWorkingDay: Boolean(item.is_working_day),
    startTime: item.start_time || null,
    endTime: item.end_time || null,
    breakMinutes: Number(item.break_minutes) || 0,
    expectedMinutes: Number(item.expected_minutes) || 0,
    notes: item.notes || null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
};

export const listEmployeeAttendanceHistory = async (employeeId: string, limit = 45): Promise<EmployeeAttendanceRecord[]> => {
  if (!employeeId) return [];
  const rows = ensureSuccess(await supabase
    .from('employee_attendance_records')
    .select('id,empresa_id,employee_id,work_date,status,check_in_at,break_start_at,break_end_at,check_out_at,worked_minutes,expected_minutes,overtime_minutes,notes,created_by_uid,created_by_name,updated_by_uid,updated_by_name,created_at,updated_at')
    .eq('employee_id', employeeId)
    .order('work_date', {ascending: false})
    .limit(limit)) as Array<any>;

  return rows.map((item) => ({
    id: item.id,
    empresaId: item.empresa_id,
    employeeId: item.employee_id,
    workDate: item.work_date,
    status: item.status,
    checkInAt: item.check_in_at || null,
    breakStartAt: item.break_start_at || null,
    breakEndAt: item.break_end_at || null,
    checkOutAt: item.check_out_at || null,
    workedMinutes: Number(item.worked_minutes) || 0,
    expectedMinutes: Number(item.expected_minutes) || 0,
    overtimeMinutes: Number(item.overtime_minutes) || 0,
    notes: item.notes || null,
    createdByUid: item.created_by_uid || undefined,
    createdByName: item.created_by_name || undefined,
    updatedByUid: item.updated_by_uid || undefined,
    updatedByName: item.updated_by_name || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
};

export const listEmployeeActivityHistory = async (options: {
  employeeId: string;
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  functionKey?: string;
  limit?: number;
}) => {
  if (!options.employeeId) return [] as EmployeeActivitySession[];

  let request = supabase
    .from('employee_activity_sessions')
    .select('id,empresa_id,employee_id,client_id,quote_id,function_key,function_label,linked_production_step,piece_id,piece_label,notes,completion_notes,status,started_at,ended_at,active_pause_started_at,paused_total_seconds,productive_seconds,created_by_uid,created_by_name,updated_at,created_at,client:clients(id,name,city),quote:quotes(id,client_name,environment,status)')
    .eq('employee_id', options.employeeId)
    .order('started_at', {ascending: false})
    .limit(Math.min(200, Math.max(1, options.limit || 60)));

  if (options.dateFrom) request = request.gte('started_at', `${options.dateFrom}T00:00:00`);
  if (options.dateTo) request = request.lte('started_at', `${options.dateTo}T23:59:59.999`);
  if (options.clientId) request = request.eq('client_id', options.clientId);
  if (options.functionKey) request = request.eq('function_key', options.functionKey);

  const rows = ensureSuccess(await request) as Array<any>;
  return rows.map((item) => ({
    id: item.id,
    empresaId: item.empresa_id,
    employeeId: item.employee_id,
    clientId: item.client_id || null,
    quoteId: item.quote_id || null,
    functionKey: item.function_key,
    functionLabel: item.function_label,
    linkedProductionStep: item.linked_production_step || undefined,
    pieceId: item.piece_id || null,
    pieceLabel: item.piece_label || null,
    notes: item.notes || null,
    completionNotes: item.completion_notes || null,
    status: item.status,
    startedAt: item.started_at,
    endedAt: item.ended_at || null,
    activePauseStartedAt: item.active_pause_started_at || null,
    pausedTotalSeconds: Number(item.paused_total_seconds) || 0,
    productiveSeconds: Number(item.productive_seconds) || 0,
    createdByUid: item.created_by_uid || undefined,
    createdByName: item.created_by_name || undefined,
    updatedAt: item.updated_at,
    createdAt: item.created_at,
    client: item.client ? {id: item.client.id, name: item.client.name, city: item.client.city || ''} as Pick<Client, 'id' | 'name' | 'city'> : null,
    quote: item.quote ? {id: item.quote.id, clientName: item.quote.client_name, environment: item.quote.environment, status: item.quote.status} as Pick<Quote, 'id' | 'clientName' | 'environment' | 'status'> : null,
  }));
};

export const listEmployeeActivityPauses = async (sessionId: string): Promise<EmployeeActivityPause[]> => {
  if (!sessionId) return [];
  const rows = ensureSuccess(await supabase
    .from('employee_activity_pauses')
    .select('id,empresa_id,session_id,started_at,ended_at,notes,started_by_uid,started_by_name,ended_by_uid,ended_by_name,created_at,updated_at')
    .eq('session_id', sessionId)
    .order('started_at', {ascending: true})) as Array<any>;

  return rows.map((item) => ({
    id: item.id,
    empresaId: item.empresa_id,
    sessionId: item.session_id,
    startedAt: item.started_at,
    endedAt: item.ended_at || null,
    notes: item.notes || null,
    startedByUid: item.started_by_uid || undefined,
    startedByName: item.started_by_name || undefined,
    endedByUid: item.ended_by_uid || undefined,
    endedByName: item.ended_by_name || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
};

export const saveEmployeeProfile = async (input: EmployeeProfileDraft, actor: WorkforceActor) => {
  const data = ensureSuccess(await supabase.rpc('save_employee_profile', {
    p_employee_id: input.id || null,
    p_name: input.name,
    p_display_name: input.displayName,
    p_role: input.role,
    p_status: input.status,
    p_admission_date: input.admissionDate || null,
    p_phone: input.phone || null,
    p_notes: input.notes || null,
    p_photo_url: input.photoUrl || null,
    p_thumbnail_url: input.thumbnailUrl || null,
    p_medium_url: input.mediumUrl || null,
    p_original_url: input.originalUrl || null,
    p_created_by_uid: actor.uid,
    p_created_by_name: actor.name,
    p_functions: input.functions,
    p_schedule: input.schedule,
  }));
  return String(data || '');
};

export const saveEmployeeAttendance = async (input: EmployeeAttendanceDraft, actor: WorkforceActor) => {
  const data = ensureSuccess(await supabase.rpc('save_employee_attendance', {
    p_employee_id: input.employeeId,
    p_work_date: input.workDate,
    p_status: input.status,
    p_check_in_at: input.checkInAt || null,
    p_break_start_at: input.breakStartAt || null,
    p_break_end_at: input.breakEndAt || null,
    p_check_out_at: input.checkOutAt || null,
    p_notes: input.notes || null,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  })) as any;

  return {
    id: data.id,
    empresaId: data.empresa_id,
    employeeId: data.employee_id,
    workDate: data.work_date,
    status: data.status,
    checkInAt: data.check_in_at || null,
    breakStartAt: data.break_start_at || null,
    breakEndAt: data.break_end_at || null,
    checkOutAt: data.check_out_at || null,
    workedMinutes: Number(data.worked_minutes) || 0,
    expectedMinutes: Number(data.expected_minutes) || 0,
    overtimeMinutes: Number(data.overtime_minutes) || 0,
    notes: data.notes || null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } as EmployeeAttendanceRecord;
};

const mapSessionRow = (data: any): EmployeeActivitySession => ({
  id: data.id,
  empresaId: data.empresa_id,
  employeeId: data.employee_id,
  clientId: data.client_id || null,
  quoteId: data.quote_id || null,
  functionKey: data.function_key,
  functionLabel: data.function_label,
  linkedProductionStep: data.linked_production_step || undefined,
  pieceId: data.piece_id || null,
  pieceLabel: data.piece_label || null,
  notes: data.notes || null,
  completionNotes: data.completion_notes || null,
  status: data.status,
  startedAt: data.started_at,
  endedAt: data.ended_at || null,
  activePauseStartedAt: data.active_pause_started_at || null,
  pausedTotalSeconds: Number(data.paused_total_seconds) || 0,
  productiveSeconds: Number(data.productive_seconds) || 0,
  createdByUid: data.created_by_uid || undefined,
  createdByName: data.created_by_name || undefined,
  updatedAt: data.updated_at,
  createdAt: data.created_at,
});

export const startEmployeeActivity = async (input: EmployeeActivityDraft, actor: WorkforceActor) => {
  const data = ensureSuccess(await supabase.rpc('start_employee_activity', {
    p_employee_id: input.employeeId,
    p_client_id: input.clientId,
    p_quote_id: input.quoteId,
    p_function_key: input.functionKey,
    p_piece_id: input.pieceId || null,
    p_piece_label: input.pieceLabel || null,
    p_notes: input.notes || null,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  })) as any;
  return mapSessionRow(data);
};

export const pauseEmployeeActivity = async (sessionId: string, actor: WorkforceActor, notes = '') => {
  const data = ensureSuccess(await supabase.rpc('pause_employee_activity', {
    p_session_id: sessionId,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
    p_notes: notes || null,
  })) as any;
  return mapSessionRow(data);
};

export const resumeEmployeeActivity = async (sessionId: string, actor: WorkforceActor) => {
  const data = ensureSuccess(await supabase.rpc('resume_employee_activity', {
    p_session_id: sessionId,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  })) as any;
  return mapSessionRow(data);
};

export const finishEmployeeActivity = async (sessionId: string, actor: WorkforceActor, completionNotes = '') => {
  const data = ensureSuccess(await supabase.rpc('finish_employee_activity', {
    p_session_id: sessionId,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
    p_completion_notes: completionNotes || null,
  })) as any;
  return mapSessionRow(data);
};

export const listActivityTargets = async (search = ''): Promise<EmployeeActivityTarget[]> => {
  let request = supabase
    .from('quotes')
    .select('id,client_id,client_name,environment,status,pieces,created_at')
    .order('created_at', {ascending: false})
    .limit(30);

  const normalized = search.trim().replace(/[%_,()]/g, '');
  if (normalized) {
    request = request.or(`client_name.ilike.%${normalized}%,environment.ilike.%${normalized}%`);
  }

  const rows = ensureSuccess(await request) as Array<any>;
  return rows.map((item) => ({
    id: item.id,
    clientId: item.client_id,
    clientName: item.client_name || 'Cliente',
    environment: item.environment || 'Sem ambiente',
    status: item.status || '',
    pieces: Array.isArray(item.pieces)
      ? item.pieces
        .filter((piece: any) => piece && piece.id)
        .map((piece: any) => ({id: String(piece.id), label: String(piece.name || piece.id)}))
      : [],
  }));
};
