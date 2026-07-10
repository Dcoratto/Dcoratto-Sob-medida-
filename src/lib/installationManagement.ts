import {supabase} from './supabase';
import {
  Client,
  Employee,
  Installation,
  InstallationChecklistItem,
  InstallationChecklistPhoto,
  InstallationHistoryEvent,
  Quote,
} from '../types';

type Actor = {
  uid: string;
  name: string;
  empresaId?: string;
};

export type InstallationListItem = Installation & {
  client?: Pick<Client, 'id' | 'name' | 'phone' | 'address' | 'city'>;
  installer?: Pick<Employee, 'id' | 'name' | 'role'>;
  quote?: Pick<Quote, 'id' | 'environment' | 'status' | 'totalPrice'>;
};

export type InstallationProjectOption = {
  quoteId: string;
  clientId: string;
  clientName: string;
  environment: string;
  status: string;
  address: string;
};

type PaginatedResult<T> = {
  items: T[];
  total: number;
};

type InstallationChecklistTemplateItem = {
  templateKey: string;
  groupKey: string;
  groupLabel: string;
  title: string;
  sortOrder: number;
  required: boolean;
};

const INSTALLATION_FILES_BUCKET = 'installation-files';

const ensureSuccess = <T>(result: {data: T; error: {message?: string} | null}) => {
  if (result.error) {
    throw new Error(result.error.message || 'Nao foi possivel concluir a operacao.');
  }
  return result.data;
};

const mapInstallation = (row: any): Installation => ({
  id: row.id,
  empresaId: row.empresa_id,
  clientId: row.client_id,
  quoteId: row.quote_id,
  installerEmployeeId: row.installer_employee_id || '',
  installationDate: row.installation_date || '',
  notes: row.notes || '',
  status: row.status,
  totalItems: Number(row.total_items || 0),
  completedItems: Number(row.completed_items || 0),
  completionPercent: Number(row.completion_percent || 0),
  finalizedAt: row.finalized_at || null,
  finalizedByUid: row.finalized_by_uid || '',
  finalizedByName: row.finalized_by_name || '',
  createdByUid: row.created_by_uid || '',
  createdByName: row.created_by_name || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
  deletedAt: row.deleted_at || null,
  deletedByUid: row.deleted_by_uid || '',
  deletedByName: row.deleted_by_name || '',
});

const mapChecklistItem = (row: any): InstallationChecklistItem => ({
  id: row.id,
  empresaId: row.empresa_id,
  installationId: row.installation_id,
  templateKey: row.template_key,
  groupKey: row.group_key,
  groupLabel: row.group_label,
  title: row.title,
  sortOrder: Number(row.sort_order || 0),
  required: Boolean(row.required),
  checked: Boolean(row.checked),
  observation: row.observation || '',
  photoCount: Number(row.photo_count || 0),
  checkedAt: row.checked_at || null,
  checkedByUid: row.checked_by_uid || '',
  checkedByName: row.checked_by_name || '',
  uncheckedAt: row.unchecked_at || null,
  uncheckedByUid: row.unchecked_by_uid || '',
  uncheckedByName: row.unchecked_by_name || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const mapChecklistPhoto = (row: any): InstallationChecklistPhoto => ({
  id: row.id,
  empresaId: row.empresa_id,
  installationId: row.installation_id,
  checklistItemId: row.checklist_item_id,
  bucketId: row.bucket_id,
  filePath: row.file_path,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes || 0),
  width: row.width || undefined,
  height: row.height || undefined,
  createdByUid: row.created_by_uid || '',
  createdByName: row.created_by_name || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
  deletedAt: row.deleted_at || null,
  deletedByUid: row.deleted_by_uid || '',
  deletedByName: row.deleted_by_name || '',
});

const mapHistoryEvent = (row: any): InstallationHistoryEvent => ({
  id: row.id,
  empresaId: row.empresa_id,
  installationId: row.installation_id,
  checklistItemId: row.checklist_item_id || undefined,
  eventType: row.event_type,
  message: row.message,
  metadata: row.metadata || {},
  userUid: row.user_uid || '',
  userName: row.user_name || '',
  createdAt: row.created_at || '',
});

const mapClientPreview = (row: any): Pick<Client, 'id' | 'name' | 'phone' | 'address' | 'city'> => ({
  id: row.id,
  name: row.name || '',
  phone: row.phone || '',
  address: row.address || '',
  city: row.city || '',
});

const mapEmployeePreview = (row: any): Pick<Employee, 'id' | 'name' | 'role'> => ({
  id: row.id,
  name: row.name || '',
  role: row.role || 'Instalador',
});

const mapQuotePreview = (row: any): Pick<Quote, 'id' | 'environment' | 'status' | 'totalPrice'> => ({
  id: row.id,
  environment: row.environment || '',
  status: row.status || '',
  totalPrice: Number(row.total_price || 0),
});

export const INSTALLATION_CHECKLIST_TEMPLATE: InstallationChecklistTemplateItem[] = [
  {templateKey: 'initial_project', groupKey: 'initial', groupLabel: 'Conferência inicial', title: 'Conferir projeto executivo', sortOrder: 1, required: true},
  {templateKey: 'initial_measures', groupKey: 'initial', groupLabel: 'Conferência inicial', title: 'Conferir medidas finais', sortOrder: 2, required: true},
  {templateKey: 'initial_materials', groupKey: 'initial', groupLabel: 'Conferência inicial', title: 'Conferir materiais', sortOrder: 3, required: true},
  {templateKey: 'initial_pieces', groupKey: 'initial', groupLabel: 'Conferência inicial', title: 'Conferir quantidade de peças', sortOrder: 4, required: true},
  {templateKey: 'initial_finish', groupKey: 'initial', groupLabel: 'Conferência inicial', title: 'Conferir acabamento', sortOrder: 5, required: true},
  {templateKey: 'transport_damage', groupKey: 'transport', groupLabel: 'Transporte', title: 'Peças chegaram sem avarias', sortOrder: 6, required: true},
  {templateKey: 'transport_pieces', groupKey: 'transport', groupLabel: 'Transporte', title: 'Conferência de todas as peças', sortOrder: 7, required: true},
  {templateKey: 'transport_tools', groupKey: 'transport', groupLabel: 'Transporte', title: 'Ferramentas completas', sortOrder: 8, required: true},
  {templateKey: 'install_countertops', groupKey: 'installation', groupLabel: 'Instalação', title: 'Bancadas instaladas', sortOrder: 9, required: true},
  {templateKey: 'install_rodabanca', groupKey: 'installation', groupLabel: 'Instalação', title: 'Rodabanca instalada', sortOrder: 10, required: true},
  {templateKey: 'install_rodape', groupKey: 'installation', groupLabel: 'Instalação', title: 'Rodapé instalado', sortOrder: 11, required: true},
  {templateKey: 'install_frontao', groupKey: 'installation', groupLabel: 'Instalação', title: 'Frontão instalado', sortOrder: 12, required: true},
  {templateKey: 'install_panels', groupKey: 'installation', groupLabel: 'Instalação', title: 'Painéis instalados', sortOrder: 13, required: true},
  {templateKey: 'install_sink', groupKey: 'installation', groupLabel: 'Instalação', title: 'Cuba instalada', sortOrder: 14, required: true},
  {templateKey: 'install_cooktop', groupKey: 'installation', groupLabel: 'Instalação', title: 'Cooktop instalado', sortOrder: 15, required: true},
  {templateKey: 'install_faucet', groupKey: 'installation', groupLabel: 'Instalação', title: 'Torneira instalada', sortOrder: 16, required: true},
  {templateKey: 'install_niches', groupKey: 'installation', groupLabel: 'Instalação', title: 'Nichos instalados', sortOrder: 17, required: true},
  {templateKey: 'install_thresholds', groupKey: 'installation', groupLabel: 'Instalação', title: 'Soleiras instaladas', sortOrder: 18, required: true},
  {templateKey: 'install_drip_edges', groupKey: 'installation', groupLabel: 'Instalação', title: 'Pingadeiras instaladas', sortOrder: 19, required: true},
  {templateKey: 'install_stairs', groupKey: 'installation', groupLabel: 'Instalação', title: 'Escadas instaladas', sortOrder: 20, required: true},
  {templateKey: 'install_table', groupKey: 'installation', groupLabel: 'Instalação', title: 'Mesa instalada', sortOrder: 21, required: true},
  {templateKey: 'install_gourmet', groupKey: 'installation', groupLabel: 'Instalação', title: 'Área gourmet instalada', sortOrder: 22, required: true},
  {templateKey: 'leveling_level', groupKey: 'leveling', groupLabel: 'Nivelamento', title: 'Nivelado', sortOrder: 23, required: true},
  {templateKey: 'leveling_square', groupKey: 'leveling', groupLabel: 'Nivelamento', title: 'Esquadro conferido', sortOrder: 24, required: true},
  {templateKey: 'leveling_alignment', groupKey: 'leveling', groupLabel: 'Nivelamento', title: 'Alinhamento conferido', sortOrder: 25, required: true},
  {templateKey: 'leveling_silicone', groupKey: 'leveling', groupLabel: 'Nivelamento', title: 'Silicone aplicado', sortOrder: 26, required: true},
  {templateKey: 'leveling_finish', groupKey: 'leveling', groupLabel: 'Nivelamento', title: 'Acabamentos finalizados', sortOrder: 27, required: true},
  {templateKey: 'cleanup_cleaned', groupKey: 'cleanup', groupLabel: 'Limpeza', title: 'Limpeza realizada', sortOrder: 28, required: true},
  {templateKey: 'cleanup_protection', groupKey: 'cleanup', groupLabel: 'Limpeza', title: 'Proteção removida', sortOrder: 29, required: true},
  {templateKey: 'cleanup_environment', groupKey: 'cleanup', groupLabel: 'Limpeza', title: 'Ambiente limpo', sortOrder: 30, required: true},
  {templateKey: 'delivery_client_checked', groupKey: 'delivery', groupLabel: 'Entrega', title: 'Cliente conferiu', sortOrder: 31, required: true},
  {templateKey: 'delivery_client_approved', groupKey: 'delivery', groupLabel: 'Entrega', title: 'Cliente aprovou', sortOrder: 32, required: true},
  {templateKey: 'delivery_final_photos', groupKey: 'delivery', groupLabel: 'Entrega', title: 'Fotos finais', sortOrder: 33, required: true},
  {templateKey: 'delivery_done', groupKey: 'delivery', groupLabel: 'Entrega', title: 'Entrega concluída', sortOrder: 34, required: true},
];

export const listInstallations = async (
  page = 0,
  pageSize = 12,
  search = '',
): Promise<PaginatedResult<InstallationListItem>> => {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let request = supabase
    .from('installations')
    .select('id, empresa_id, client_id, quote_id, installer_employee_id, installation_date, notes, status, total_items, completed_items, completion_percent, finalized_at, finalized_by_uid, finalized_by_name, created_by_uid, created_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name', {count: 'exact'})
    .is('deleted_at', null)
    .order('installation_date', {ascending: false})
    .range(from, to);

  if (search.trim()) {
    const searchRows = ensureSuccess(await supabase
      .from('clients')
      .select('id')
      .or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,address.ilike.%${search.trim()}%`)
      .limit(50));
    const ids = searchRows.map((row: any) => row.id).filter(Boolean);
    if (ids.length === 0) return {items: [], total: 0};
    request = request.in('client_id', ids);
  }

  const result = await request;
  const installations = ensureSuccess(result).map(mapInstallation);
  const clientIds = Array.from(new Set(installations.map((item) => item.clientId).filter(Boolean)));
  const employeeIds = Array.from(new Set(installations.map((item) => item.installerEmployeeId).filter(Boolean)));
  const quoteIds = Array.from(new Set(installations.map((item) => item.quoteId).filter(Boolean)));

  const clientsById = new Map<string, Pick<Client, 'id' | 'name' | 'phone' | 'address' | 'city'>>();
  const employeesById = new Map<string, Pick<Employee, 'id' | 'name' | 'role'>>();
  const quotesById = new Map<string, Pick<Quote, 'id' | 'environment' | 'status' | 'totalPrice'>>();

  if (clientIds.length) {
    ensureSuccess(await supabase.from('clients').select('id, name, phone, address, city').in('id', clientIds))
      .forEach((row: any) => clientsById.set(row.id, mapClientPreview(row)));
  }

  if (employeeIds.length) {
    ensureSuccess(await supabase.from('employees').select('id, name, role').in('id', employeeIds))
      .forEach((row: any) => employeesById.set(row.id, mapEmployeePreview(row)));
  }

  if (quoteIds.length) {
    ensureSuccess(await supabase.from('quotes').select('id, environment, status, total_price').in('id', quoteIds))
      .forEach((row: any) => quotesById.set(row.id, mapQuotePreview(row)));
  }

  return {
    items: installations.map((item) => ({
      ...item,
      client: clientsById.get(item.clientId),
      installer: item.installerEmployeeId ? employeesById.get(item.installerEmployeeId) : undefined,
      quote: quotesById.get(item.quoteId),
    })),
    total: result.count || 0,
  };
};

export const searchProjectOptionsForInstallation = async (search = '', limit = 20): Promise<InstallationProjectOption[]> => {
  const normalizedSearch = search.trim();
  let clientsRequest = supabase
    .from('clients')
    .select('id, name, address, city, phone')
    .order('name', {ascending: true})
    .limit(Math.max(limit * 3, 60));

  if (normalizedSearch) {
    clientsRequest = clientsRequest.or(
      `name.ilike.%${normalizedSearch}%,address.ilike.%${normalizedSearch}%,city.ilike.%${normalizedSearch}%,phone.ilike.%${normalizedSearch}%`,
    );
  }

  const clients = ensureSuccess(await clientsRequest);
  const clientIds = clients.map((row: any) => row.id).filter(Boolean);
  if (clientIds.length === 0) return [];

  const [quotes, activeInstallations] = await Promise.all([
    ensureSuccess(await supabase
      .from('quotes')
      .select('id, client_id, client_name, environment, status, created_at')
      .in('client_id', clientIds)
      .order('created_at', {ascending: false})),
    ensureSuccess(await supabase
      .from('installations')
      .select('quote_id')
      .in('client_id', clientIds)
      .is('deleted_at', null)),
  ]);

  const usedQuoteIds = new Set(
    activeInstallations
      .map((row: any) => row.quote_id)
      .filter(Boolean),
  );

  const quotesByClientId = new Map<string, any[]>();
  quotes.forEach((row: any) => {
    if (!row.client_id || usedQuoteIds.has(row.id)) return;
    const current = quotesByClientId.get(row.client_id) || [];
    current.push(row);
    quotesByClientId.set(row.client_id, current);
  });

  const filteredClients = clients
    .map((client: any) => {
      const availableQuotes = quotesByClientId.get(client.id) || [];
      if (availableQuotes.length === 0) return null;

      let selectedQuote = availableQuotes[0];
      if (normalizedSearch) {
        const matchedQuote = availableQuotes.find((quote) =>
          [quote.client_name, quote.environment, quote.status]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch.toLowerCase())),
        );
        selectedQuote = matchedQuote || availableQuotes[0];
      }

      return {
        quoteId: selectedQuote.id,
        clientId: client.id,
        clientName: client.name || selectedQuote.client_name || '',
        environment: selectedQuote.environment || 'Sem ambiente',
        status: selectedQuote.status || '',
        address: client.address || '',
      } satisfies InstallationProjectOption;
    })
    .filter(Boolean) as InstallationProjectOption[];

  return filteredClients.slice(0, limit);
};

export const listInstallerEmployees = async () => {
  const rows = ensureSuccess(await supabase
    .from('employees')
    .select('id, name, role')
    .in('role', ['Instalador', 'Entregador'])
    .eq('active', true)
    .order('name', {ascending: true}));

  return rows.map(mapEmployeePreview);
};

export const createInstallation = async (
  payload: {
    clientId: string;
    quoteId: string;
    installerEmployeeId?: string;
    installationDate: string;
    notes?: string;
  },
  actor: Actor,
) => {
  const result = await supabase.rpc('create_installation_with_checklist', {
    p_client_id: payload.clientId,
    p_quote_id: payload.quoteId,
    p_installation_date: new Date(`${payload.installationDate}T12:00:00`).toISOString(),
    p_installer_employee_id: payload.installerEmployeeId || null,
    p_notes: payload.notes || null,
    p_created_by_uid: actor.uid,
    p_created_by_name: actor.name,
    p_checklist_items: INSTALLATION_CHECKLIST_TEMPLATE,
  });

  return ensureSuccess(result);
};

export const getInstallationDetail = async (installationId: string) => {
  const row = ensureSuccess(await supabase
    .from('installations')
    .select('id, empresa_id, client_id, quote_id, installer_employee_id, installation_date, notes, status, total_items, completed_items, completion_percent, finalized_at, finalized_by_uid, finalized_by_name, created_by_uid, created_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name')
    .eq('id', installationId)
    .is('deleted_at', null)
    .single());

  const installation = mapInstallation(row);
  const [clientRow, quoteRow, employeeRow] = await Promise.all([
    supabase.from('clients').select('id, name, phone, address, city, notes').eq('id', installation.clientId).single(),
    supabase.from('quotes').select('id, environment, status, total_price, commercial_notes').eq('id', installation.quoteId).single(),
    installation.installerEmployeeId
      ? supabase.from('employees').select('id, name, role').eq('id', installation.installerEmployeeId).single()
      : Promise.resolve({data: null, error: null}),
  ]);

  return {
    installation,
    client: clientRow.data ? {...mapClientPreview(clientRow.data), notes: clientRow.data.notes || ''} : null,
    quote: quoteRow.data ? {...mapQuotePreview(quoteRow.data), commercialNotes: quoteRow.data.commercial_notes || ''} : null,
    installer: employeeRow.data ? mapEmployeePreview(employeeRow.data) : null,
  };
};

export const listInstallationChecklistItems = async (installationId: string) => {
  const rows = ensureSuccess(await supabase
    .from('installation_checklist_items')
    .select('id, empresa_id, installation_id, template_key, group_key, group_label, title, sort_order, required, checked, observation, photo_count, checked_at, checked_by_uid, checked_by_name, unchecked_at, unchecked_by_uid, unchecked_by_name, created_at, updated_at')
    .eq('installation_id', installationId)
    .order('sort_order', {ascending: true}));
  return rows.map(mapChecklistItem);
};

export const updateInstallationChecklistItem = async (
  itemId: string,
  checked: boolean,
  observation: string,
  actor: Actor,
) => {
  return ensureSuccess(await supabase.rpc('update_installation_checklist_item', {
    p_item_id: itemId,
    p_checked: checked,
    p_observation: observation || null,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  }));
};

export const listInstallationChecklistPhotos = async (
  checklistItemId: string,
  page = 0,
  pageSize = 12,
): Promise<PaginatedResult<InstallationChecklistPhoto>> => {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const result = await supabase
    .from('installation_checklist_photos')
    .select('id, empresa_id, installation_id, checklist_item_id, bucket_id, file_path, file_name, mime_type, size_bytes, width, height, created_by_uid, created_by_name, created_at, updated_at, deleted_at, deleted_by_uid, deleted_by_name', {count: 'exact'})
    .eq('checklist_item_id', checklistItemId)
    .is('deleted_at', null)
    .order('created_at', {ascending: false})
    .range(from, to);

  return {
    items: ensureSuccess(result).map(mapChecklistPhoto),
    total: result.count || 0,
  };
};

export const listInstallationHistory = async (
  installationId: string,
  checklistItemId?: string,
  page = 0,
  pageSize = 20,
): Promise<PaginatedResult<InstallationHistoryEvent>> => {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  let request = supabase
    .from('installation_history')
    .select('id, empresa_id, installation_id, checklist_item_id, event_type, message, metadata, user_uid, user_name, created_at', {count: 'exact'})
    .eq('installation_id', installationId)
    .order('created_at', {ascending: false})
    .range(from, to);

  if (checklistItemId) request = request.eq('checklist_item_id', checklistItemId);

  const result = await request;
  return {
    items: ensureSuccess(result).map(mapHistoryEvent),
    total: result.count || 0,
  };
};

export const uploadInstallationImageBlob = async (path: string, blob: Blob, contentType: string) => {
  return ensureSuccess(await supabase.storage
    .from(INSTALLATION_FILES_BUCKET)
    .upload(path, blob, {upsert: true, contentType, cacheControl: '3600'}));
};

export const createInstallationPhotoRecord = async (
  itemId: string,
  values: {
    filePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
  },
  actor: Actor,
) => {
  return ensureSuccess(await supabase.rpc('add_installation_checklist_photo_record', {
    p_checklist_item_id: itemId,
    p_file_path: values.filePath,
    p_file_name: values.fileName,
    p_mime_type: values.mimeType,
    p_size_bytes: values.sizeBytes,
    p_width: values.width || null,
    p_height: values.height || null,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  }));
};

export const createSignedInstallationPhotoUrl = async (filePath: string, expiresInSeconds = 3600) => {
  const result = await supabase.storage
    .from(INSTALLATION_FILES_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);
  return ensureSuccess(result).signedUrl;
};

export const softDeleteInstallationPhoto = async (photoId: string, actor: Actor) => {
  return ensureSuccess(await supabase.rpc('remove_installation_checklist_photo_record', {
    p_photo_id: photoId,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  }));
};

export const removeInstallationImageObject = async (filePath: string) => {
  return ensureSuccess(await supabase.storage.from(INSTALLATION_FILES_BUCKET).remove([filePath]));
};

export const finalizeInstallation = async (installationId: string, actor: Actor) => {
  return ensureSuccess(await supabase.rpc('finalize_installation', {
    p_installation_id: installationId,
    p_actor_uid: actor.uid,
    p_actor_name: actor.name,
  }));
};
