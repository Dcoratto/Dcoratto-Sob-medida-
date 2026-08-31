import {supabase} from './supabase';
import type {
  Employee,
  Vehicle,
  VehicleFuelLevel,
  VehicleOccurrence,
  VehicleOccurrenceSeverity,
  VehicleOperationalOverview,
  VehiclePurpose,
  VehicleStatus,
  VehicleUsageSession,
} from '../types';

export type VehicleActor = {
  uid: string;
  name: string;
  empresaId?: string;
};

export type VehicleReferenceOption = {
  id: string;
  clientId: string;
  clientName: string;
  environment: string;
  status: string;
};

export type VehicleEmployeeOption = {
  id: string;
  name: string;
  displayName: string;
  role: string;
  status: string;
};

export type VehicleDraft = {
  id?: string;
  internalName: string;
  brand: string;
  model: string;
  plate: string;
  year: string;
  vehicleType: string;
  status: VehicleStatus;
  currentOdometerKm: string;
  registrationDueDate: string;
  relevantDueDate: string;
  documentationNotes: string;
  notes: string;
  photoUrl: string;
  thumbnailUrl: string;
  mediumUrl: string;
  originalUrl: string;
};

export type VehicleUsageDraft = {
  employeeId?: string;
  vehicleId: string;
  purposeKey: string;
  clientId?: string | null;
  quoteId?: string | null;
  startNotes?: string;
  startOdometerKm: number;
  startFuelLevel: VehicleFuelLevel;
  startChecklist: Record<string, boolean>;
  occurrenceSeverity?: VehicleOccurrenceSeverity | null;
  occurrenceDescription?: string;
  occurrencePhotoUrl?: string;
  occurrenceThumbnailUrl?: string;
  occurrenceMediumUrl?: string;
  occurrenceOriginalUrl?: string;
  startRequestKey?: string;
};

export type VehicleReturnDraft = {
  sessionId: string;
  endOdometerKm: number;
  endFuelLevel: VehicleFuelLevel;
  endChecklist: Record<string, boolean>;
  endNotes?: string;
  finalVehicleStatus?: VehicleStatus | null;
  finishRequestKey?: string;
  occurrenceSeverity?: VehicleOccurrenceSeverity | null;
  occurrenceDescription?: string;
  occurrencePhotoUrl?: string;
  occurrenceThumbnailUrl?: string;
  occurrenceMediumUrl?: string;
  occurrenceOriginalUrl?: string;
};

export type VehicleOccurrenceDraft = {
  vehicleId: string;
  stage: 'SAIDA' | 'DEVOLUCAO' | 'AVULSA';
  severity: VehicleOccurrenceSeverity;
  description: string;
  usageSessionId?: string;
  photoUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
};

const throwIfError = (error: {message?: string} | null) => {
  if (error) throw new Error(error.message || 'Não foi possível concluir a operação.');
};

const sanitizeSearch = (value: string) => value.trim().replace(/[%_,()]/g, '');

const mapVehicle = (row: any): Vehicle => ({
  id: row.vehicle_id || row.id,
  empresaId: row.empresa_id,
  internalName: row.internal_name,
  brand: row.brand || null,
  model: row.model || null,
  plate: row.plate || null,
  year: row.year == null ? null : Number(row.year),
  vehicleType: row.vehicle_type,
  status: row.vehicle_status || row.status,
  currentOdometerKm: Number(row.current_odometer_km) || 0,
  notes: row.vehicle_notes ?? row.notes ?? null,
  photoUrl: row.photo_url || null,
  thumbnailUrl: row.thumbnail_url || null,
  mediumUrl: row.medium_url || null,
  originalUrl: row.original_url || null,
  registrationDueDate: row.registration_due_date || null,
  relevantDueDate: row.relevant_due_date || null,
  documentationNotes: row.documentation_notes || null,
  createdByUid: row.created_by_uid || null,
  createdByName: row.created_by_name || null,
  updatedByUid: row.updated_by_uid || null,
  updatedByName: row.updated_by_name || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapOccurrence = (row: any): VehicleOccurrence => ({
  id: row.id,
  empresaId: row.empresa_id,
  vehicleId: row.vehicle_id,
  usageSessionId: row.usage_session_id || null,
  stage: row.stage,
  severity: row.severity,
  description: row.description,
  photoUrl: row.photo_url || null,
  thumbnailUrl: row.thumbnail_url || null,
  mediumUrl: row.medium_url || null,
  originalUrl: row.original_url || null,
  preventsUse: Boolean(row.prevents_use),
  reportedByUid: row.reported_by_uid || null,
  reportedByName: row.reported_by_name || null,
  createdAt: row.created_at,
});

const mapSession = (row: any): VehicleUsageSession => ({
  id: row.id,
  empresaId: row.empresa_id,
  vehicleId: row.vehicle_id,
  employeeId: row.employee_id,
  actorUid: row.actor_uid,
  actorName: row.actor_name,
  purposeKey: row.purpose_key,
  purposeLabel: row.purpose_label,
  clientId: row.client_id || null,
  quoteId: row.quote_id || null,
  clientNameSnapshot: row.client_name_snapshot || null,
  quoteLabelSnapshot: row.quote_label_snapshot || null,
  startNotes: row.start_notes || null,
  endNotes: row.end_notes || null,
  startOdometerKm: Number(row.start_odometer_km) || 0,
  endOdometerKm: row.end_odometer_km == null ? null : Number(row.end_odometer_km),
  distanceKm: row.distance_km == null ? null : Number(row.distance_km),
  startFuelLevel: row.start_fuel_level,
  endFuelLevel: row.end_fuel_level || null,
  startChecklist: row.start_checklist || {},
  endChecklist: row.end_checklist || null,
  status: row.status,
  startedAt: row.started_at,
  endedAt: row.ended_at || null,
  returnActorUid: row.return_actor_uid || null,
  returnActorName: row.return_actor_name || null,
  finalVehicleStatus: row.final_vehicle_status || null,
  startRequestKey: row.start_request_key || null,
  finishRequestKey: row.finish_request_key || null,
  vehicle: row.vehicle ? {
    id: row.vehicle.id,
    internalName: row.vehicle.internal_name,
    vehicleType: row.vehicle.vehicle_type,
    status: row.vehicle.status,
    currentOdometerKm: Number(row.vehicle.current_odometer_km) || 0,
    plate: row.vehicle.plate || null,
    thumbnailUrl: row.vehicle.thumbnail_url || null,
  } : null,
  employee: row.employee ? {
    id: row.employee.id,
    name: row.employee.name,
    displayName: row.employee.display_name || undefined,
    role: row.employee.role,
    status: row.employee.status || undefined,
  } : null,
  client: row.client ? {
    id: row.client.id,
    name: row.client.name,
    city: row.client.city || undefined,
  } : null,
  quote: row.quote ? {
    id: row.quote.id,
    environment: row.quote.environment || undefined,
    clientName: row.quote.client_name || undefined,
    status: row.quote.status || undefined,
  } : null,
  occurrences: Array.isArray(row.occurrences) ? row.occurrences.map(mapOccurrence) : undefined,
});

const mapPurpose = (row: any): VehiclePurpose => ({
  id: row.id,
  empresaId: row.empresa_id,
  purposeKey: row.purpose_key,
  label: row.label,
  requiresClientLink: Boolean(row.requires_client_link),
  active: Boolean(row.active),
  sortOrder: Number(row.sort_order) || 0,
});

export const createVehicleDraft = (vehicle?: Vehicle): VehicleDraft => ({
  id: vehicle?.id,
  internalName: vehicle?.internalName || '',
  brand: vehicle?.brand || '',
  model: vehicle?.model || '',
  plate: vehicle?.plate || '',
  year: vehicle?.year ? String(vehicle.year) : '',
  vehicleType: vehicle?.vehicleType || '',
  status: vehicle?.status || 'DISPONIVEL',
  currentOdometerKm: vehicle ? String(vehicle.currentOdometerKm) : '0',
  registrationDueDate: vehicle?.registrationDueDate || '',
  relevantDueDate: vehicle?.relevantDueDate || '',
  documentationNotes: vehicle?.documentationNotes || '',
  notes: vehicle?.notes || '',
  photoUrl: vehicle?.photoUrl || '',
  thumbnailUrl: vehicle?.thumbnailUrl || '',
  mediumUrl: vehicle?.mediumUrl || '',
  originalUrl: vehicle?.originalUrl || '',
});

export const listVehicleOperationalOverview = async (search = ''): Promise<VehicleOperationalOverview[]> => {
  let request = supabase
    .from('vehicle_operational_overview')
    .select([
      'vehicle_id',
      'empresa_id',
      'internal_name',
      'brand',
      'model',
      'plate',
      'year',
      'vehicle_type',
      'vehicle_status',
      'current_odometer_km',
      'vehicle_notes',
      'photo_url',
      'thumbnail_url',
      'medium_url',
      'original_url',
      'registration_due_date',
      'relevant_due_date',
      'documentation_notes',
      'current_session_id',
      'current_employee_id',
      'current_employee_name',
      'current_employee_display_name',
      'current_employee_role',
      'current_actor_name',
      'current_purpose_key',
      'current_purpose_label',
      'current_client_id',
      'current_client_name',
      'current_quote_id',
      'current_quote_label',
      'current_start_odometer_km',
      'current_start_fuel_level',
      'current_started_at',
      'last_session_id',
      'last_employee_id',
      'last_employee_name',
      'last_employee_display_name',
      'last_actor_name',
      'last_purpose_key',
      'last_purpose_label',
      'last_client_id',
      'last_client_name',
      'last_quote_id',
      'last_quote_label',
      'last_start_odometer_km',
      'last_end_odometer_km',
      'last_distance_km',
      'last_started_at',
      'last_ended_at',
      'open_occurrence_count',
      'month_usage_count',
      'month_distance_km',
    ].join(','))
    .order('internal_name', {ascending: true});

  const normalized = sanitizeSearch(search);
  if (normalized) {
    request = request.or(`internal_name.ilike.%${normalized}%,brand.ilike.%${normalized}%,model.ilike.%${normalized}%,plate.ilike.%${normalized}%,vehicle_type.ilike.%${normalized}%`);
  }

  const {data, error} = await request;
  throwIfError(error);
  return (data || []).map((row: any) => ({
    vehicle: mapVehicle(row),
    currentSession: row.current_session_id ? {
      id: row.current_session_id,
      vehicleId: row.vehicle_id,
      employeeId: row.current_employee_id,
      actorUid: '',
      actorName: row.current_actor_name || row.current_employee_display_name || row.current_employee_name || '',
      purposeKey: row.current_purpose_key,
      purposeLabel: row.current_purpose_label,
      clientId: row.current_client_id || null,
      quoteId: row.current_quote_id || null,
      clientNameSnapshot: row.current_client_name || null,
      quoteLabelSnapshot: row.current_quote_label || null,
      startOdometerKm: Number(row.current_start_odometer_km) || 0,
      startFuelLevel: row.current_start_fuel_level,
      startChecklist: {},
      status: 'ATIVA',
      startedAt: row.current_started_at,
      vehicle: {
        id: row.vehicle_id,
        internalName: row.internal_name,
        vehicleType: row.vehicle_type,
        status: row.vehicle_status,
        currentOdometerKm: Number(row.current_odometer_km) || 0,
        plate: row.plate || null,
        thumbnailUrl: row.thumbnail_url || null,
      },
      employee: row.current_employee_id ? {
        id: row.current_employee_id,
        name: row.current_employee_name || '',
        displayName: row.current_employee_display_name || undefined,
        role: row.current_employee_role || '',
      } : null,
      client: row.current_client_id ? {
        id: row.current_client_id,
        name: row.current_client_name || '',
      } : null,
      quote: row.current_quote_id ? {
        id: row.current_quote_id,
        environment: row.current_quote_label || undefined,
        clientName: row.current_client_name || undefined,
        status: 'Orçamento' as const,
      } : null,
    } : null,
    lastSession: row.last_session_id ? {
      id: row.last_session_id,
      vehicleId: row.vehicle_id,
      employeeId: row.last_employee_id,
      actorUid: '',
      actorName: row.last_actor_name || row.last_employee_display_name || row.last_employee_name || '',
      purposeKey: row.last_purpose_key,
      purposeLabel: row.last_purpose_label,
      clientId: row.last_client_id || null,
      quoteId: row.last_quote_id || null,
      clientNameSnapshot: row.last_client_name || null,
      quoteLabelSnapshot: row.last_quote_label || null,
      startOdometerKm: Number(row.last_start_odometer_km) || 0,
      endOdometerKm: row.last_end_odometer_km == null ? null : Number(row.last_end_odometer_km),
      distanceKm: row.last_distance_km == null ? null : Number(row.last_distance_km),
      startFuelLevel: 'METADE',
      startChecklist: {},
      status: 'CONCLUIDA',
      startedAt: row.last_started_at,
      endedAt: row.last_ended_at || null,
      vehicle: {
        id: row.vehicle_id,
        internalName: row.internal_name,
        vehicleType: row.vehicle_type,
        status: row.vehicle_status,
        currentOdometerKm: Number(row.current_odometer_km) || 0,
        plate: row.plate || null,
        thumbnailUrl: row.thumbnail_url || null,
      },
      employee: row.last_employee_id ? {
        id: row.last_employee_id,
        name: row.last_employee_name || '',
        displayName: row.last_employee_display_name || undefined,
        role: '',
      } : null,
      client: row.last_client_id ? {
        id: row.last_client_id,
        name: row.last_client_name || '',
      } : null,
      quote: row.last_quote_id ? {
        id: row.last_quote_id,
        environment: row.last_quote_label || undefined,
        clientName: row.last_client_name || undefined,
        status: 'Orçamento' as const,
      } : null,
    } : null,
    openOccurrenceCount: Number(row.open_occurrence_count) || 0,
    monthUsageCount: Number(row.month_usage_count) || 0,
    monthDistanceKm: Number(row.month_distance_km) || 0,
  }));
};

export const listVehiclePurposes = async (): Promise<VehiclePurpose[]> => {
  const {data, error} = await supabase
    .from('vehicle_purpose_catalog')
    .select('id,empresa_id,purpose_key,label,requires_client_link,active,sort_order')
    .eq('active', true)
    .order('sort_order', {ascending: true})
    .order('label', {ascending: true});
  throwIfError(error);
  return (data || []).map(mapPurpose);
};

export const listVehicleEmployees = async (search = ''): Promise<VehicleEmployeeOption[]> => {
  let request = supabase
    .from('employees')
    .select('id,name,display_name,role,status')
    .eq('active', true)
    .order('display_name', {ascending: true})
    .order('name', {ascending: true});
  const normalized = sanitizeSearch(search);
  if (normalized) {
    request = request.or(`name.ilike.%${normalized}%,display_name.ilike.%${normalized}%,role.ilike.%${normalized}%`);
  }
  const {data, error} = await request;
  throwIfError(error);
  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    displayName: row.display_name || row.name,
    role: row.role || '',
    status: row.status || 'ATIVO',
  }));
};

export const searchVehicleReferences = async (search = ''): Promise<VehicleReferenceOption[]> => {
  let request = supabase
    .from('quotes')
    .select('id,client_id,client_name,environment,status,created_at')
    .order('created_at', {ascending: false})
    .limit(20);
  const normalized = sanitizeSearch(search);
  if (normalized) {
    request = request.or(`client_name.ilike.%${normalized}%,environment.ilike.%${normalized}%`);
  }
  const {data, error} = await request;
  throwIfError(error);
  return (data || []).map((row: any) => ({
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name || 'Cliente',
    environment: row.environment || 'Sem ambiente',
    status: row.status || '',
  }));
};

export const listVehicleUsageHistory = async (options: {
  vehicleId?: string;
  employeeId?: string;
  status?: 'ATIVA' | 'CONCLUIDA' | '';
  purposeKey?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
} = {}): Promise<VehicleUsageSession[]> => {
  let request = supabase
    .from('vehicle_usage_sessions')
    .select('id,empresa_id,vehicle_id,employee_id,actor_uid,actor_name,purpose_key,purpose_label,client_id,quote_id,client_name_snapshot,quote_label_snapshot,start_notes,end_notes,start_odometer_km,end_odometer_km,distance_km,start_fuel_level,end_fuel_level,start_checklist,end_checklist,status,started_at,ended_at,return_actor_uid,return_actor_name,final_vehicle_status,start_request_key,finish_request_key,vehicle:vehicles(id,internal_name,vehicle_type,status,current_odometer_km,plate,thumbnail_url),employee:employees(id,name,display_name,role,status),client:clients(id,name,city),quote:quotes(id,environment,client_name,status)')
    .order('started_at', {ascending: false})
    .limit(Math.min(200, Math.max(1, options.limit || 60)));
  if (options.vehicleId) request = request.eq('vehicle_id', options.vehicleId);
  if (options.employeeId) request = request.eq('employee_id', options.employeeId);
  if (options.status) request = request.eq('status', options.status);
  if (options.purposeKey) request = request.eq('purpose_key', options.purposeKey);
  if (options.dateFrom) request = request.gte('started_at', `${options.dateFrom}T00:00:00`);
  if (options.dateTo) request = request.lte('started_at', `${options.dateTo}T23:59:59.999`);
  const {data, error} = await request;
  throwIfError(error);
  const sessions = (data || []).map(mapSession);
  if (!sessions.length) return sessions;

  const sessionIds = sessions.map((item) => item.id);
  const {data: occurrencesData, error: occurrencesError} = await supabase
    .from('vehicle_occurrences')
    .select('id,empresa_id,vehicle_id,usage_session_id,stage,severity,description,photo_url,thumbnail_url,medium_url,original_url,prevents_use,reported_by_uid,reported_by_name,created_at')
    .in('usage_session_id', sessionIds)
    .order('created_at', {ascending: false});
  throwIfError(occurrencesError);
  const occurrencesBySession = new Map<string, VehicleOccurrence[]>();
  for (const occurrence of (occurrencesData || []).map(mapOccurrence)) {
    const key = occurrence.usageSessionId || '';
    occurrencesBySession.set(key, [...(occurrencesBySession.get(key) || []), occurrence]);
  }
  return sessions.map((session) => ({
    ...session,
    occurrences: occurrencesBySession.get(session.id) || [],
  }));
};

export const saveVehicle = async (input: VehicleDraft, actor: VehicleActor): Promise<Vehicle> => {
  if (!input.id && !actor.empresaId) {
    throw new Error('Empresa não identificada para cadastrar o veículo.');
  }

  const payload = {
    internal_name: input.internalName.trim(),
    brand: input.brand.trim() || null,
    model: input.model.trim() || null,
    plate: input.plate.trim().toUpperCase() || null,
    year: input.year ? Number(input.year) : null,
    vehicle_type: input.vehicleType.trim(),
    status: input.status,
    current_odometer_km: Number(input.currentOdometerKm) || 0,
    registration_due_date: input.registrationDueDate || null,
    relevant_due_date: input.relevantDueDate || null,
    documentation_notes: input.documentationNotes.trim() || null,
    notes: input.notes.trim() || null,
    photo_url: input.photoUrl || null,
    thumbnail_url: input.thumbnailUrl || null,
    medium_url: input.mediumUrl || null,
    original_url: input.originalUrl || null,
    updated_by_uid: actor.uid || null,
    updated_by_name: actor.name || 'Usuário',
  };

  const request = input.id
    ? supabase.from('vehicles').update(payload).eq('id', input.id)
    : supabase.from('vehicles').insert({
      ...payload,
      empresa_id: actor.empresaId,
      created_by_uid: actor.uid || null,
      created_by_name: actor.name || 'Usuário',
    });

  const {data, error} = await request
    .select('id,empresa_id,internal_name,brand,model,plate,year,vehicle_type,status,current_odometer_km,notes,photo_url,thumbnail_url,medium_url,original_url,registration_due_date,relevant_due_date,documentation_notes,created_by_uid,created_by_name,updated_by_uid,updated_by_name,created_at,updated_at')
    .single();
  throwIfError(error);
  return mapVehicle(data);
};

export const startVehicleUsage = async (input: VehicleUsageDraft, actor: VehicleActor) => {
  const {data, error} = await supabase.rpc('start_vehicle_usage', {
    p_vehicle_id: input.vehicleId,
    p_employee_id: input.employeeId || null,
    p_purpose_key: input.purposeKey,
    p_client_id: input.clientId || null,
    p_quote_id: input.quoteId || null,
    p_start_notes: input.startNotes || null,
    p_start_odometer_km: input.startOdometerKm,
    p_start_fuel_level: input.startFuelLevel,
    p_start_checklist: input.startChecklist,
    p_start_request_key: input.startRequestKey || null,
    p_actor_name: actor.name,
    p_occurrence_severity: input.occurrenceSeverity || null,
    p_occurrence_description: input.occurrenceDescription || null,
    p_occurrence_photo_url: input.occurrencePhotoUrl || null,
    p_occurrence_thumbnail_url: input.occurrenceThumbnailUrl || null,
    p_occurrence_medium_url: input.occurrenceMediumUrl || null,
    p_occurrence_original_url: input.occurrenceOriginalUrl || null,
  });
  throwIfError(error);
  return mapSession(data);
};

export const finishVehicleUsage = async (input: VehicleReturnDraft, actor: VehicleActor) => {
  const {data, error} = await supabase.rpc('finish_vehicle_usage', {
    p_session_id: input.sessionId,
    p_end_odometer_km: input.endOdometerKm,
    p_end_fuel_level: input.endFuelLevel,
    p_end_checklist: input.endChecklist,
    p_end_notes: input.endNotes || null,
    p_final_vehicle_status: input.finalVehicleStatus || null,
    p_finish_request_key: input.finishRequestKey || null,
    p_actor_name: actor.name,
    p_occurrence_severity: input.occurrenceSeverity || null,
    p_occurrence_description: input.occurrenceDescription || null,
    p_occurrence_photo_url: input.occurrencePhotoUrl || null,
    p_occurrence_thumbnail_url: input.occurrenceThumbnailUrl || null,
    p_occurrence_medium_url: input.occurrenceMediumUrl || null,
    p_occurrence_original_url: input.occurrenceOriginalUrl || null,
  });
  throwIfError(error);
  return mapSession(data);
};

export const reportVehicleOccurrence = async (input: VehicleOccurrenceDraft, actor: VehicleActor) => {
  const {data, error} = await supabase.rpc('report_vehicle_occurrence', {
    p_vehicle_id: input.vehicleId,
    p_stage: input.stage,
    p_severity: input.severity,
    p_description: input.description,
    p_photo_url: input.photoUrl || null,
    p_thumbnail_url: input.thumbnailUrl || null,
    p_medium_url: input.mediumUrl || null,
    p_original_url: input.originalUrl || null,
    p_usage_session_id: input.usageSessionId || null,
    p_actor_name: actor.name,
  });
  throwIfError(error);
  return mapOccurrence(data);
};
