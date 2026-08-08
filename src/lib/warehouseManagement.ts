import {supabase} from './supabase';

export type WarehouseItemType = 'CONSUMIVEL' | 'FERRAMENTA';
export type WarehouseMovementType = 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'DEVOLUCAO';
export type WarehouseToolStatus = 'DISPONIVEL' | 'EM_USO' | 'MANUTENCAO' | 'DANIFICADA' | 'INATIVA';
export type WarehousePurchaseStatus = 'PENDENTE' | 'SOLICITADO' | 'COMPRADO' | 'RECEBIDO' | 'CANCELADO';

export type WarehouseActor = {uid: string; name: string; empresaId: string};
export type WarehouseReferenceOption = {id: string; name: string; detail?: string; clientId?: string};

export type WarehouseProduct = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  itemType: WarehouseItemType;
  unit: string;
  currentQuantity: number;
  minimumQuantity: number;
  physicalLocation: string;
  defaultSupplierId?: string | null;
  unitCost?: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseMovement = {
  id: string;
  productId: string;
  movementType: WarehouseMovementType;
  quantity: number;
  previousQuantity: number;
  resultingQuantity: number;
  unitCostSnapshot?: number | null;
  totalCostSnapshot?: number | null;
  employeeId?: string | null;
  clientId?: string | null;
  workQuoteId?: string | null;
  quoteId?: string | null;
  reason: string;
  notes?: string | null;
  performedByName: string;
  createdAt: string;
  product?: {name: string; category: string; unit: string} | null;
  employee?: {name: string} | null;
  client?: {name: string} | null;
  work?: {environment: string; client_name: string} | null;
};

export type WarehouseTool = {
  id: string;
  productId: string;
  assetCode: string;
  serialNumber?: string | null;
  condition: string;
  status: WarehouseToolStatus;
  notes?: string | null;
  currentEmployeeId?: string | null;
  currentClientId?: string | null;
  currentWorkQuoteId?: string | null;
  checkedOutAt?: string | null;
  expectedReturnAt?: string | null;
  active: boolean;
  product?: {name: string} | null;
  employee?: {name: string} | null;
  client?: {name: string} | null;
  work?: {environment: string; client_name: string} | null;
};

export type WarehousePurchase = {
  id: string;
  productId: string;
  requestedQuantity: number;
  suggestedQuantity?: number | null;
  supplierId?: string | null;
  status: WarehousePurchaseStatus;
  notes?: string | null;
  requestedByName: string;
  requestedAt: string;
  receivedAt?: string | null;
  product?: {name: string; unit: string; current_quantity: number; minimum_quantity: number} | null;
};

export type WarehouseToolMovement = {
  id: string;
  movementType: 'RETIRADA' | 'DEVOLUCAO' | 'ALTERACAO_STATUS';
  previousStatus: string;
  resultingStatus: string;
  reason?: string | null;
  notes?: string | null;
  performedByName: string;
  createdAt: string;
  employee?: {name: string} | null;
  client?: {name: string} | null;
  work?: {environment: string; client_name: string} | null;
};

export type WarehouseWorkConsumption = {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
  withdrawals: Array<{
    date: string;
    quantity: number;
    unitCost: number | null;
    totalCost: number | null;
    employee: string | null;
    performedBy: string;
  }>;
};

export type WarehouseSummary = {
  totalProducts: number;
  belowMinimum: number;
  outOfStock: number;
  borrowedTools: number;
  pendingPurchases: number;
  movementsToday: number;
};

const throwIfError = (error: {message?: string} | null) => {
  if (error) throw new Error(error.message || 'Nao foi possivel concluir a operacao.');
};

const productFromRow = (row: any): WarehouseProduct => ({
  id: row.id,
  name: row.name,
  description: row.description,
  category: row.category,
  itemType: row.item_type,
  unit: row.unit,
  currentQuantity: Number(row.current_quantity) || 0,
  minimumQuantity: Number(row.minimum_quantity) || 0,
  physicalLocation: row.physical_location || '',
  defaultSupplierId: row.default_supplier_id,
  unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
  active: Boolean(row.active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const movementFromRow = (row: any): WarehouseMovement => ({
  id: row.id,
  productId: row.product_id,
  movementType: row.movement_type,
  quantity: Number(row.quantity) || 0,
  previousQuantity: Number(row.previous_quantity) || 0,
  resultingQuantity: Number(row.resulting_quantity) || 0,
  unitCostSnapshot: row.unit_cost_snapshot == null ? null : Number(row.unit_cost_snapshot),
  totalCostSnapshot: row.total_cost_snapshot == null ? null : Number(row.total_cost_snapshot),
  employeeId: row.employee_id,
  clientId: row.client_id,
  workQuoteId: row.work_quote_id,
  quoteId: row.quote_id,
  reason: row.reason,
  notes: row.notes,
  performedByName: row.performed_by_name,
  createdAt: row.created_at,
  product: row.product,
  employee: row.employee,
  client: row.client,
  work: row.work,
});

export const getWarehouseSummary = async (): Promise<WarehouseSummary> => {
  const {data, error} = await supabase.rpc('warehouse_dashboard_summary');
  throwIfError(error);
  const value = (data || {}) as Record<string, number>;
  return {
    totalProducts: Number(value.total_products) || 0,
    belowMinimum: Number(value.below_minimum) || 0,
    outOfStock: Number(value.out_of_stock) || 0,
    borrowedTools: Number(value.borrowed_tools) || 0,
    pendingPurchases: Number(value.pending_purchases) || 0,
    movementsToday: Number(value.movements_today) || 0,
  };
};

export const listWarehouseProducts = async (options: {
  page?: number;
  pageSize?: number;
  search?: string;
  itemType?: WarehouseItemType | '';
  category?: string;
  activeOnly?: boolean;
} = {}) => {
  const page = Math.max(0, options.page || 0);
  const pageSize = Math.min(50, Math.max(1, options.pageSize || 12));
  let request = supabase
    .from('warehouse_products')
    .select('id,name,description,category,item_type,unit,current_quantity,minimum_quantity,physical_location,default_supplier_id,unit_cost,active,created_at,updated_at', {count: 'exact'})
    .order('active', {ascending: false})
    .order('name')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (options.activeOnly !== false) request = request.eq('active', true);
  if (options.itemType) request = request.eq('item_type', options.itemType);
  if (options.category) request = request.eq('category', options.category);
  const search = options.search?.trim();
  if (search) request = request.or(`name.ilike.%${search.replace(/[%_,()]/g, '')}%,category.ilike.%${search.replace(/[%_,()]/g, '')}%`);
  const {data, error, count} = await request;
  throwIfError(error);
  return {items: (data || []).map(productFromRow), total: count || 0};
};

export const listWarehouseAlerts = async () => {
  const {data, error} = await supabase
    .from('warehouse_products')
    .select('id,name,category,unit,current_quantity,minimum_quantity,active')
    .eq('active', true)
    .order('current_quantity')
    .limit(40);
  throwIfError(error);
  return (data || []).map(productFromRow).filter((item) => item.currentQuantity <= item.minimumQuantity * 1.25).slice(0, 12);
};

export const saveWarehouseProduct = async (
  input: Omit<WarehouseProduct, 'id' | 'currentQuantity' | 'createdAt' | 'updatedAt'> & {id?: string},
  actor: WarehouseActor,
) => {
  const sharedPayload = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    category: input.category.trim(),
    unit: input.unit.trim(),
    minimum_quantity: input.minimumQuantity,
    physical_location: input.physicalLocation.trim(),
    default_supplier_id: input.defaultSupplierId || null,
    unit_cost: input.unitCost ?? null,
    active: input.active,
  };
  const request = input.id
    ? supabase.from('warehouse_products').update(sharedPayload).eq('id', input.id)
    : supabase.from('warehouse_products').insert({...sharedPayload, empresa_id: actor.empresaId, item_type: input.itemType, created_by_uid: actor.uid});
  const {data, error} = await request.select('id,name,description,category,item_type,unit,current_quantity,minimum_quantity,physical_location,default_supplier_id,unit_cost,active,created_at,updated_at').single();
  throwIfError(error);
  return productFromRow(data);
};

export const deactivateWarehouseProduct = async (id: string) => {
  const {error} = await supabase.from('warehouse_products').update({active: false}).eq('id', id);
  throwIfError(error);
};

export const recordWarehouseMovement = async (input: {
  productId: string;
  movementType: WarehouseMovementType;
  quantity: number;
  employeeId?: string;
  clientId?: string;
  workQuoteId?: string;
  quoteId?: string;
  reason: string;
  notes?: string;
}, actor: WarehouseActor) => {
  const {data, error} = await supabase.rpc('warehouse_record_movement', {
    p_product_id: input.productId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_employee_id: input.employeeId || null,
    p_client_id: input.clientId || null,
    p_work_quote_id: input.workQuoteId || null,
    p_quote_id: input.quoteId || null,
    p_reason: input.reason.trim(),
    p_notes: input.notes?.trim() || null,
    p_performed_by_name: actor.name,
  });
  throwIfError(error);
  return movementFromRow(data);
};

export const listWarehouseMovements = async (options: {
  page?: number;
  pageSize?: number;
  movementType?: WarehouseMovementType | '';
  productId?: string;
  employeeId?: string;
  clientId?: string;
  workQuoteId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) => {
  const page = Math.max(0, options.page || 0);
  const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
  let request = supabase
    .from('warehouse_movements')
    .select('id,product_id,movement_type,quantity,previous_quantity,resulting_quantity,unit_cost_snapshot,total_cost_snapshot,employee_id,client_id,work_quote_id,quote_id,reason,notes,performed_by_name,created_at,product:warehouse_products!warehouse_movements_product_fk(name,category,unit),employee:employees(name),client:clients(name),work:quotes!warehouse_movements_work_quote_id_fkey(environment,client_name)', {count: 'exact'})
    .order('created_at', {ascending: false})
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (options.movementType) request = request.eq('movement_type', options.movementType);
  if (options.productId) request = request.eq('product_id', options.productId);
  if (options.employeeId) request = request.eq('employee_id', options.employeeId);
  if (options.clientId) request = request.eq('client_id', options.clientId);
  if (options.workQuoteId) request = request.eq('work_quote_id', options.workQuoteId);
  if (options.category) request = request.eq('product.category', options.category);
  if (options.dateFrom) request = request.gte('created_at', `${options.dateFrom}T00:00:00-03:00`);
  if (options.dateTo) request = request.lte('created_at', `${options.dateTo}T23:59:59-03:00`);
  const {data, error, count} = await request;
  throwIfError(error);
  return {items: (data || []).map(movementFromRow), total: count || 0};
};

export const searchWarehouseProducts = async (search = '', type?: WarehouseItemType) => {
  const result = await listWarehouseProducts({search, itemType: type || '', pageSize: 30});
  return result.items;
};

export const searchWarehouseClients = async (search = ''): Promise<WarehouseReferenceOption[]> => {
  let request = supabase.from('clients').select('id,name,city,neighborhood').order('name').limit(20);
  const normalized = search.trim().replace(/[%_,()]/g, '');
  if (normalized) request = request.ilike('name', `%${normalized}%`);
  const {data, error} = await request;
  throwIfError(error);
  return (data || []).map((item) => ({id: item.id, name: item.name, detail: [item.city, item.neighborhood].filter(Boolean).join(' - ')}));
};

export const listWarehouseEmployees = async (): Promise<WarehouseReferenceOption[]> => {
  const {data, error} = await supabase.from('employees').select('id,name,role').eq('active', true).order('name').limit(100);
  throwIfError(error);
  return (data || []).map((item) => ({id: item.id, name: item.name, detail: item.role}));
};

export const listWarehouseClientProjects = async (clientId: string): Promise<WarehouseReferenceOption[]> => {
  if (!clientId) return [];
  const {data, error} = await supabase
    .from('quotes')
    .select('id,environment,status,client_id,created_at')
    .eq('client_id', clientId)
    .order('created_at', {ascending: false})
    .limit(50);
  throwIfError(error);
  return (data || []).map((item) => ({id: item.id, name: item.environment || 'Sem ambiente', detail: item.status, clientId: item.client_id}));
};

export const createWarehouseTool = async (input: {
  productId: string;
  assetCode: string;
  serialNumber?: string;
  condition: string;
  notes?: string;
}, actor: WarehouseActor) => {
  const {data, error} = await supabase.from('warehouse_tools').insert({
    empresa_id: actor.empresaId,
    product_id: input.productId,
    asset_code: input.assetCode.trim(),
    serial_number: input.serialNumber?.trim() || null,
    condition: input.condition.trim(),
    notes: input.notes?.trim() || null,
    active: true,
    created_by_uid: actor.uid,
  }).select('id,product_id,asset_code,serial_number,condition,status,notes,current_employee_id,current_client_id,current_work_quote_id,checked_out_at,expected_return_at,active').single();
  throwIfError(error);
  return toolFromRow(data);
};

const toolFromRow = (row: any): WarehouseTool => ({
  id: row.id,
  productId: row.product_id,
  assetCode: row.asset_code,
  serialNumber: row.serial_number,
  condition: row.condition,
  status: row.status,
  notes: row.notes,
  currentEmployeeId: row.current_employee_id,
  currentClientId: row.current_client_id,
  currentWorkQuoteId: row.current_work_quote_id,
  checkedOutAt: row.checked_out_at,
  expectedReturnAt: row.expected_return_at,
  active: Boolean(row.active),
  product: row.product,
  employee: row.employee,
  client: row.client,
  work: row.work,
});

export const listWarehouseTools = async (options: {page?: number; pageSize?: number; search?: string; status?: WarehouseToolStatus | ''} = {}) => {
  const page = Math.max(0, options.page || 0);
  const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
  let request = supabase
    .from('warehouse_tools')
    .select('id,product_id,asset_code,serial_number,condition,status,notes,current_employee_id,current_client_id,current_work_quote_id,checked_out_at,expected_return_at,active,product:warehouse_products!warehouse_tools_product_fk(name),employee:employees!warehouse_tools_current_employee_id_fkey(name),client:clients!warehouse_tools_current_client_id_fkey(name),work:quotes!warehouse_tools_current_work_quote_id_fkey(environment,client_name)', {count: 'exact'})
    .eq('active', true)
    .order('asset_code')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (options.status) request = request.eq('status', options.status);
  const search = options.search?.trim().replace(/[%_,()]/g, '');
  if (search) request = request.or(`asset_code.ilike.%${search}%,serial_number.ilike.%${search}%`);
  const {data, error, count} = await request;
  throwIfError(error);
  return {items: (data || []).map(toolFromRow), total: count || 0};
};

export const checkoutWarehouseTool = async (input: {
  toolId: string;
  employeeId: string;
  clientId?: string;
  workQuoteId?: string;
  expectedReturnAt?: string;
  notes?: string;
}, actor: WarehouseActor) => {
  const {data, error} = await supabase.rpc('warehouse_checkout_tool', {
    p_tool_id: input.toolId,
    p_employee_id: input.employeeId,
    p_client_id: input.clientId || null,
    p_work_quote_id: input.workQuoteId || null,
    p_expected_return_at: input.expectedReturnAt || null,
    p_notes: input.notes?.trim() || null,
    p_performed_by_name: actor.name,
  });
  throwIfError(error);
  return toolFromRow(data);
};

export const returnWarehouseTool = async (toolId: string, condition: string, notes: string, actor: WarehouseActor) => {
  const {data, error} = await supabase.rpc('warehouse_return_tool', {
    p_tool_id: toolId,
    p_condition: condition.trim(),
    p_notes: notes.trim() || null,
    p_performed_by_name: actor.name,
  });
  throwIfError(error);
  return toolFromRow(data);
};

export const listWarehouseToolHistory = async (toolId: string): Promise<WarehouseToolMovement[]> => {
  const {data, error} = await supabase
    .from('warehouse_tool_movements')
    .select('id,movement_type,previous_status,resulting_status,reason,notes,performed_by_name,created_at,employee:employees(name),client:clients(name),work:quotes!warehouse_tool_movements_work_quote_id_fkey(environment,client_name)')
    .eq('tool_id', toolId)
    .order('created_at', {ascending: false})
    .limit(50);
  throwIfError(error);
  return (data || []).map((row: any) => ({
    id: row.id,
    movementType: row.movement_type,
    previousStatus: row.previous_status,
    resultingStatus: row.resulting_status,
    reason: row.reason,
    notes: row.notes,
    performedByName: row.performed_by_name,
    createdAt: row.created_at,
    employee: row.employee,
    client: row.client,
    work: row.work,
  }));
};

export const getWarehouseWorkConsumption = async (workQuoteId: string): Promise<WarehouseWorkConsumption[]> => {
  if (!workQuoteId) return [];
  const {data, error} = await supabase.rpc('warehouse_work_consumption', {p_work_quote_id: workQuoteId});
  throwIfError(error);
  return (data || []).map((row: any) => ({
    productId: row.product_id,
    productName: row.product_name,
    category: row.category,
    unit: row.unit,
    totalQuantity: Number(row.total_quantity) || 0,
    totalCost: Number(row.total_cost) || 0,
    withdrawals: Array.isArray(row.withdrawals) ? row.withdrawals.map((item: any) => ({
      date: item.date,
      quantity: Number(item.quantity) || 0,
      unitCost: item.unit_cost == null ? null : Number(item.unit_cost),
      totalCost: item.total_cost == null ? null : Number(item.total_cost),
      employee: item.employee,
      performedBy: item.performed_by,
    })) : [],
  }));
};

const purchaseFromRow = (row: any): WarehousePurchase => ({
  id: row.id,
  productId: row.product_id,
  requestedQuantity: Number(row.requested_quantity) || 0,
  suggestedQuantity: row.suggested_quantity == null ? null : Number(row.suggested_quantity),
  supplierId: row.supplier_id,
  status: row.status,
  notes: row.notes,
  requestedByName: row.requested_by_name,
  requestedAt: row.requested_at,
  receivedAt: row.received_at,
  product: row.product,
});

export const createWarehousePurchase = async (input: {
  productId: string;
  quantity: number;
  suggestedQuantity?: number;
  supplierId?: string;
  notes?: string;
}, actor: WarehouseActor) => {
  const {data, error} = await supabase.from('warehouse_purchase_items').insert({
    empresa_id: actor.empresaId,
    product_id: input.productId,
    requested_quantity: input.quantity,
    suggested_quantity: input.suggestedQuantity || null,
    supplier_id: input.supplierId || null,
    status: 'PENDENTE',
    notes: input.notes?.trim() || null,
    requested_by_uid: actor.uid,
    requested_by_name: actor.name,
  }).select('id,product_id,requested_quantity,suggested_quantity,supplier_id,status,notes,requested_by_name,requested_at,received_at').single();
  throwIfError(error);
  return purchaseFromRow(data);
};

export const listWarehousePurchases = async (options: {page?: number; pageSize?: number; status?: WarehousePurchaseStatus | ''} = {}) => {
  const page = Math.max(0, options.page || 0);
  const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
  let request = supabase
    .from('warehouse_purchase_items')
    .select('id,product_id,requested_quantity,suggested_quantity,supplier_id,status,notes,requested_by_name,requested_at,received_at,product:warehouse_products!warehouse_purchase_items_product_fk(name,unit,current_quantity,minimum_quantity)', {count: 'exact'})
    .order('requested_at', {ascending: false})
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (options.status) request = request.eq('status', options.status);
  const {data, error, count} = await request;
  throwIfError(error);
  return {items: (data || []).map(purchaseFromRow), total: count || 0};
};

export const updateWarehousePurchaseStatus = async (id: string, status: Exclude<WarehousePurchaseStatus, 'RECEBIDO'>) => {
  const {error} = await supabase.from('warehouse_purchase_items').update({status}).eq('id', id);
  throwIfError(error);
};

export const receiveWarehousePurchase = async (id: string, quantity: number, actor: WarehouseActor) => {
  const {data, error} = await supabase.rpc('warehouse_receive_purchase', {
    p_purchase_id: id,
    p_received_quantity: quantity,
    p_performed_by_name: actor.name,
  });
  throwIfError(error);
  return purchaseFromRow(data);
};
