import {repairTextDeep} from './utils';
import {supabase} from './supabase';

type TableName = string;
type QueryDirection = 'asc' | 'desc';
type QueryOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

type QueryWhereClause = {
  type: 'where';
  field: string;
  operator: QueryOperator;
  value: unknown;
};

type QueryOrderByClause = {
  type: 'orderBy';
  field: string;
  direction: QueryDirection;
};

type QueryLimitClause = {
  type: 'limit';
  value: number;
};

type QueryClause = QueryWhereClause | QueryOrderByClause | QueryLimitClause;

type CollectionReference = {
  kind: 'collection';
  table: TableName;
};

type DocumentReference = {
  kind: 'document';
  table: TableName;
  id: string;
};

type QueryReference = {
  kind: 'query';
  table: TableName;
  clauses: QueryClause[];
};

type BatchOperation =
  | {type: 'delete'; ref: DocumentReference}
  | {type: 'set'; ref: DocumentReference; data: object; options?: {merge?: boolean}}
  | {type: 'update'; ref: DocumentReference; data: object};

type SnapshotListener<T> = (snapshot: T) => void;
type SnapshotErrorListener = (error: unknown) => void;

type ArrayUnionMarker = {
  __type: 'arrayUnion';
  values: unknown[];
};

type ServerTimestampMarker = {
  __type: 'serverTimestamp';
};

type TableConfig = {
  table: string;
  timestampFields?: string[];
  numericFields?: string[];
  ignoredFields?: string[];
  includeUidFromId?: boolean;
  fromDb?: (field: string, value: unknown) => unknown;
  toDb?: (field: string, value: unknown) => unknown;
};

const TABLE_CONFIG: Record<string, TableConfig> = {
  auditLogs: {table: 'audit_logs', timestampFields: ['createdAt']},
  calendarEvents: {table: 'calendar_events', timestampFields: ['date', 'createdAt', 'updatedAt']},
  clients: {
    table: 'clients',
    timestampFields: ['createdAt', 'updatedAt'],
    toDb: (field, value) => {
      if (field === 'condominiumId') {
        const normalized = String(value || '').trim();
        return normalized || null;
      }
      return value;
    },
  },
  condominiums: {table: 'condominiums', timestampFields: ['createdAt', 'updatedAt']},
  dashboardNotes: {table: 'dashboard_notes', timestampFields: ['createdAt', 'updatedAt']},
  employees: {table: 'employees', timestampFields: ['createdAt', 'updatedAt']},
  fixtureCatalog: {
    table: 'fixture_catalog',
    timestampFields: ['createdAt', 'updatedAt'],
    numericFields: ['width', 'depth', 'height', 'diameter'],
  },
  inventory: {
    table: 'inventory',
    timestampFields: ['lostAt', 'createdAt', 'updatedAt'],
    numericFields: ['length', 'width', 'thickness', 'area', 'cost', 'minimumSalePrice'],
    fromDb: (field, value) => {
      if (field !== 'rackId' || typeof value !== 'string') return value;
      const match = value.match(/^rack_(\d+)$/);
      return match ? `Cavalete ${match[1]}` : value;
    },
    toDb: (field, value) => {
      if (field !== 'rackId' || typeof value !== 'string') return value;
      const match = value.match(/^Cavalete\s+(\d+)$/i);
      return match ? `rack_${match[1]}` : value || null;
    },
  },
  inventoryPurchases: {
    table: 'inventory_purchases',
    timestampFields: ['expectedDeliveryDate', 'purchasedAt', 'receivedAt', 'createdAt', 'updatedAt'],
    numericFields: ['length', 'width', 'thickness', 'area', 'cost', 'minimumSalePrice', 'purchaseIndex', 'purchaseQuantity'],
  },
  inventoryReservations: {
    table: 'inventory_reservations',
    timestampFields: ['createdAt', 'updatedAt'],
    numericFields: ['area'],
  },
  materials: {
    table: 'materials',
    timestampFields: ['createdAt', 'updatedAt'],
    numericFields: ['pricePerM2', 'baseCostPerM2', 'baseMinimumSalePerM2', 'marginPercentage'],
  },
  profiles: {table: 'profiles', timestampFields: ['createdAt', 'updatedAt'], ignoredFields: ['uid'], includeUidFromId: true},
  quotes: {
    table: 'quotes',
    timestampFields: ['validityDate', 'measurementDate', 'deliveryDate', 'createdAt', 'updatedAt'],
    numericFields: ['deliveryDays', 'totalArea', 'totalPrice'],
  },
  settings: {
    table: 'settings',
    timestampFields: ['createdAt', 'updatedAt'],
    numericFields: ['defaultValidity', 'laborRatePerLinearMeter', 'defaultFrontonHeight', 'defaultSkirtHeight', 'defaultTurnHeight'],
  },
  systemEvents: {table: 'system_events', timestampFields: ['createdAt']},
  userMaterialPrices: {
    table: 'user_material_prices',
    timestampFields: ['createdAt', 'updatedAt'],
    numericFields: ['baseCostPerM2', 'baseMinimumSalePerM2', 'marginPercentage', 'pricePerM2', 'finalPricePerM2'],
  },
  users: {table: 'users', timestampFields: ['createdAt', 'updatedAt'], ignoredFields: ['uid'], includeUidFromId: true},
  yardRacks: {
    table: 'yard_racks',
    timestampFields: ['createdAt', 'updatedAt'],
    numericFields: ['sortOrder', 'positionX', 'positionY'],
  },
};

const listenersByTable = new Map<string, Set<() => void>>();

const POLL_INTERVAL_MS = 10000;

const camelToSnake = (value: string) =>
  value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

const snakeToCamel = (value: string) =>
  value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

const getTableConfig = (collectionName: string): TableConfig =>
  TABLE_CONFIG[collectionName] || {table: camelToSnake(collectionName)};

const getCollectionNameFromTable = (tableName: string) => {
  const entry = Object.entries(TABLE_CONFIG).find(([, config]) => config.table === tableName);
  return entry?.[0] || snakeToCamel(tableName);
};

const isRetryableTransportError = (error: unknown) => {
  const message = String((error as {message?: string})?.message || error || '').toLowerCase();
  return [
    'failed to fetch',
    'networkerror',
    'network request failed',
    'load failed',
    'fetch failed',
    'gateway timeout',
  ].some((snippet) => message.includes(snippet));
};

const isRetryableAuthError = (error: unknown) => {
  const message = String((error as {message?: string; code?: string; details?: string})?.message || (error as {code?: string})?.code || error || '').toLowerCase();
  const details = String((error as {details?: string})?.details || '').toLowerCase();
  return [
    'jwt expired',
    'invalid jwt',
    'auth session missing',
    'refresh token',
    'token has expired',
    'session_not_found',
    'session not found',
    'invalid claim',
  ].some((snippet) => message.includes(snippet) || details.includes(snippet));
};

const refreshAuthSession = async () => {
  const {data: sessionData} = await supabase.auth.getSession();
  const refreshToken = sessionData.session?.refresh_token;
  if (!refreshToken) return;
  await supabase.auth.refreshSession({refresh_token: refreshToken});
};

const withSupabaseRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (isRetryableAuthError(error)) {
      try {
        await refreshAuthSession();
        return await operation();
      } catch (retryError) {
        throw retryError;
      }
    }

    if (isRetryableTransportError(error)) {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      return await operation();
    }

    throw error;
  }
};

const normalizeTopLevelValueForDb = (table: string, field: string, value: unknown) => {
  const config = getTableConfig(table);
  const transformedValue = config.toDb ? config.toDb(field, value) : value;
  if (transformedValue instanceof Date) {
    return transformedValue.toISOString();
  }
  if (transformedValue && typeof transformedValue === 'object') {
    if (transformedValue instanceof Timestamp) {
      return transformedValue.toDate().toISOString();
    }
    if ((transformedValue as ServerTimestampMarker).__type === 'serverTimestamp') {
      return new Date().toISOString();
    }
  }
  return transformedValue;
};

const normalizeTopLevelValueFromDb = (table: string, field: string, value: unknown) => {
  const config = getTableConfig(table);
  const transformedValue = config.fromDb ? config.fromDb(field, value) : value;
  if (transformedValue == null) return transformedValue;

  if (config.numericFields?.includes(field) && transformedValue !== '') {
    const numericValue = Number(transformedValue);
    return Number.isNaN(numericValue) ? transformedValue : numericValue;
  }

  if (config.timestampFields?.includes(field) && typeof transformedValue === 'string') {
    return new Timestamp(new Date(transformedValue));
  }

  return repairTextDeep(transformedValue);
};

const mapRowFromDb = (table: string, row: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {};
  const config = getTableConfig(table);
  if (config.includeUidFromId && typeof row.id === 'string') {
    mapped.uid = row.id;
  }
  for (const [field, value] of Object.entries(row)) {
    if (field === 'id') continue;
    const key = snakeToCamel(field);
    mapped[key] = normalizeTopLevelValueFromDb(table, key, value);
  }
  return mapped;
};

const mapDataToDb = (table: string, data: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {};
  const config = getTableConfig(table);
  for (const [field, value] of Object.entries(data)) {
    if (field === 'id' || typeof value === 'undefined' || config.ignoredFields?.includes(field)) continue;
    const key = camelToSnake(field);
    mapped[key] = normalizeTopLevelValueForDb(table, field, value);
  }
  return mapped;
};

const applyManagedTimestamps = (
  table: string,
  data: Record<string, unknown>,
  options?: {merge?: boolean; existingData?: Record<string, unknown> | undefined},
) => {
  const config = getTableConfig(table);
  if (!config.timestampFields?.length) return data;

  const nextData = {...data};
  const hasCreatedAt = config.timestampFields.includes('createdAt');
  const hasUpdatedAt = config.timestampFields.includes('updatedAt');
  const existingData = options?.existingData || {};

  if (hasCreatedAt && !options?.merge && typeof nextData.createdAt === 'undefined') {
    nextData.createdAt = serverTimestamp();
  }

  if (hasCreatedAt && options?.merge && typeof nextData.createdAt === 'undefined' && typeof existingData.createdAt !== 'undefined') {
    nextData.createdAt = existingData.createdAt;
  }

  if (hasUpdatedAt && typeof nextData.updatedAt === 'undefined') {
    nextData.updatedAt = serverTimestamp();
  }

  return nextData;
};

const generateId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({length: 20}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const unwrapTimestampValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => unwrapTimestampValue(entry));
  }
  if (value && typeof value === 'object') {
    if ((value as ArrayUnionMarker).__type === 'arrayUnion') {
      return value;
    }
    if ((value as ServerTimestampMarker).__type === 'serverTimestamp') {
      return new Date().toISOString();
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, unwrapTimestampValue(nestedValue)]),
    );
  }
  return value;
};

const applyArrayUnionMarkers = (currentData: Record<string, unknown>, nextData: Record<string, unknown>) => {
  const resolvedData: Record<string, unknown> = {...nextData};
  for (const [field, value] of Object.entries(nextData)) {
    const unwrappedValue = unwrapTimestampValue(value);
    if ((unwrappedValue as ArrayUnionMarker)?.__type === 'arrayUnion') {
      const existing = Array.isArray(currentData[field]) ? currentData[field] as unknown[] : [];
      resolvedData[field] = [...existing, ...(unwrappedValue as ArrayUnionMarker).values.map((entry) => unwrapTimestampValue(entry))];
    } else {
      resolvedData[field] = unwrappedValue;
    }
  }
  return resolvedData;
};

const notifyTableListeners = (table: string) => {
  listenersByTable.get(table)?.forEach((listener) => listener());
};

const registerTableListener = (table: string, listener: () => void) => {
  const current = listenersByTable.get(table) || new Set<() => void>();
  current.add(listener);
  listenersByTable.set(table, current);
  return () => {
    current.delete(listener);
    if (current.size === 0) listenersByTable.delete(table);
  };
};

const buildSelectQuery = (table: string, clauses: QueryClause[] = []) => {
  let request = supabase.from(getTableConfig(table).table).select('*');
  clauses.forEach((clause) => {
    const field = camelToSnake(clause.type === 'limit' ? 'id' : clause.field);
    if (clause.type === 'where') {
      const value = normalizeTopLevelValueForDb(table, clause.field, clause.value);
      switch (clause.operator) {
        case '==':
          request = request.eq(field, value as never);
          break;
        case '!=':
          request = request.neq(field, value as never);
          break;
        case '>':
          request = request.gt(field, value as never);
          break;
        case '>=':
          request = request.gte(field, value as never);
          break;
        case '<':
          request = request.lt(field, value as never);
          break;
        case '<=':
          request = request.lte(field, value as never);
          break;
      }
    }
    if (clause.type === 'orderBy') {
      request = request.order(field, {ascending: clause.direction !== 'desc'});
    }
    if (clause.type === 'limit') {
      request = request.limit(clause.value);
    }
  });
  return request;
};

const fetchRows = async (target: CollectionReference | QueryReference) => {
  const clauses = target.kind === 'query' ? target.clauses : [];
  const {data, error} = await withSupabaseRetry(() => buildSelectQuery(target.table, clauses));
  if (error) throw error;
  return (data || []).map((row) => new QueryDocumentSnapshot(target.table, row.id as string, mapRowFromDb(target.table, row as Record<string, unknown>)));
};

const fetchDocument = async (target: DocumentReference) => {
  const {data, error} = await withSupabaseRetry(() => supabase.from(getTableConfig(target.table).table).select('*').eq('id', target.id).maybeSingle());
  if (error) throw error;
  if (!data) return new DocumentSnapshot(target, null);
  return new DocumentSnapshot(target, mapRowFromDb(target.table, data as Record<string, unknown>));
};

export class Timestamp {
  private readonly internalDate: Date;

  constructor(value: Date | string | number) {
    this.internalDate = value instanceof Date ? value : new Date(value);
  }

  static now() {
    return new Timestamp(new Date());
  }

  static fromDate(date: Date) {
    return new Timestamp(date);
  }

  toDate() {
    return new Date(this.internalDate);
  }

  toMillis() {
    return this.internalDate.getTime();
  }

  toJSON() {
    return this.internalDate.toISOString();
  }
}

export class DocumentSnapshot {
  readonly id: string;
  readonly ref: DocumentReference;
  private readonly payload: Record<string, unknown> | null;

  constructor(ref: DocumentReference, payload: Record<string, unknown> | null) {
    this.ref = ref;
    this.id = ref.id;
    this.payload = payload;
  }

  exists() {
    return !!this.payload;
  }

  data() {
    return this.payload ? {...this.payload} : undefined;
  }
}

export class QueryDocumentSnapshot {
  readonly id: string;
  readonly ref: DocumentReference;
  private readonly payload: Record<string, unknown>;

  constructor(table: string, id: string, payload: Record<string, unknown>) {
    this.id = id;
    this.ref = {kind: 'document', table, id};
    this.payload = payload;
  }

  data() {
    return {...this.payload};
  }
}

export class QuerySnapshot {
  readonly docs: QueryDocumentSnapshot[];

  constructor(docs: QueryDocumentSnapshot[]) {
    this.docs = docs;
  }
}

export const db = {provider: 'supabase'} as const;

export const collection = (_db: typeof db, collectionName: string): CollectionReference => ({
  kind: 'collection',
  table: collectionName,
});

export const doc = (...args: [typeof db, string, string] | [CollectionReference] | [CollectionReference, string]): DocumentReference => {
  if (args[0] && typeof args[0] === 'object' && 'kind' in args[0] && args[0].kind === 'collection') {
    const collectionRef = args[0];
    const documentId = typeof args[1] === 'string' ? args[1] : generateId();
    return {kind: 'document', table: collectionRef.table, id: documentId};
  }

  const [, collectionName, id] = args as [typeof db, string, string];
  return {kind: 'document', table: collectionName, id};
};

export const where = (field: string, operator: QueryOperator, value: unknown): QueryWhereClause => ({
  type: 'where',
  field,
  operator,
  value,
});

export const orderBy = (field: string, direction: QueryDirection = 'asc'): QueryOrderByClause => ({
  type: 'orderBy',
  field,
  direction,
});

export const limit = (value: number): QueryLimitClause => ({
  type: 'limit',
  value,
});

export const query = (reference: CollectionReference | QueryReference, ...clauses: QueryClause[]): QueryReference => ({
  kind: 'query',
  table: reference.table,
  clauses: [...(reference.kind === 'query' ? reference.clauses : []), ...clauses],
});

export const serverTimestamp = (): ServerTimestampMarker => ({
  __type: 'serverTimestamp',
});

export const arrayUnion = (...values: unknown[]): ArrayUnionMarker => ({
  __type: 'arrayUnion',
  values,
});

export const getDoc = async (reference: DocumentReference) => fetchDocument(reference);

export const getDocs = async (reference: CollectionReference | QueryReference) => new QuerySnapshot(await fetchRows(reference));

export function onSnapshot(
  reference: DocumentReference,
  onNext: SnapshotListener<DocumentSnapshot>,
  onError?: SnapshotErrorListener,
): () => void;
export function onSnapshot(
  reference: CollectionReference | QueryReference,
  onNext: SnapshotListener<QuerySnapshot>,
  onError?: SnapshotErrorListener,
): () => void;
export function onSnapshot(
  reference: DocumentReference | CollectionReference | QueryReference,
  onNext: SnapshotListener<any>,
  onError?: SnapshotErrorListener,
) {
  const table = reference.table;
  let cancelled = false;

  const load = async () => {
    try {
      const snapshot = reference.kind === 'document'
        ? await fetchDocument(reference)
        : new QuerySnapshot(await fetchRows(reference));
      if (!cancelled) onNext(snapshot);
    } catch (error) {
      if (!cancelled) onError?.(error);
    }
  };

  void load();
  const unsubscribeTable = registerTableListener(table, () => {
    void load();
  });
  const interval = window.setInterval(() => {
    void load();
  }, POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    unsubscribeTable();
    window.clearInterval(interval);
  };
}

export const addDoc = async (reference: CollectionReference, data: object) => {
  const ref = doc(reference);
  await setDoc(ref, data);
  return ref;
};

export const setDoc = async (reference: DocumentReference, data: object, options?: {merge?: boolean}) => {
  let payload = data as Record<string, unknown>;
  let currentData: Record<string, unknown> | undefined;

  if (options?.merge) {
    const current = await getDoc(reference);
    currentData = current.data() || {};
    payload = applyArrayUnionMarkers(currentData, data as Record<string, unknown>);
  } else {
    payload = applyArrayUnionMarkers({}, data as Record<string, unknown>);
  }

  payload = applyManagedTimestamps(reference.table, payload, {merge: options?.merge, existingData: currentData});
  const mapped = mapDataToDb(reference.table, payload);
  const {error} = await withSupabaseRetry(() => supabase.from(getTableConfig(reference.table).table).upsert({id: reference.id, ...mapped}, {onConflict: 'id'}));
  if (error) throw error;
  notifyTableListeners(reference.table);
};

export const updateDoc = async (reference: DocumentReference, data: object) => {
  const current = await getDoc(reference);
  if (!current.exists()) {
    throw new Error(`Documento ${reference.table}/${reference.id} não encontrado.`);
  }

  const currentData = current.data() || {};
  let payload = applyArrayUnionMarkers(currentData, data as Record<string, unknown>);
  payload = applyManagedTimestamps(reference.table, payload, {merge: true, existingData: currentData});
  const mapped = mapDataToDb(reference.table, payload);
  const {error} = await withSupabaseRetry(() => supabase.from(getTableConfig(reference.table).table).update(mapped).eq('id', reference.id));
  if (error) throw error;
  notifyTableListeners(reference.table);
};

export const deleteDoc = async (reference: DocumentReference) => {
  const {error} = await withSupabaseRetry(() => supabase.from(getTableConfig(reference.table).table).delete().eq('id', reference.id));
  if (error) throw error;
  notifyTableListeners(reference.table);
};

export const writeBatch = (_db: typeof db) => {
  const operations: BatchOperation[] = [];

  return {
    delete(reference: DocumentReference) {
      operations.push({type: 'delete', ref: reference});
    },
    set(reference: DocumentReference, data: object, options?: {merge?: boolean}) {
      operations.push({type: 'set', ref: reference, data, options});
    },
    update(reference: DocumentReference, data: object) {
      operations.push({type: 'update', ref: reference, data});
    },
    async commit() {
      for (const operation of operations) {
        if (operation.type === 'delete') await deleteDoc(operation.ref);
        if (operation.type === 'set') await setDoc(operation.ref, operation.data, operation.options);
        if (operation.type === 'update') await updateDoc(operation.ref, operation.data);
      }
    },
  };
};

export const getTableName = (collectionName: string) => getTableConfig(collectionName).table;
export const getCollectionName = (tableName: string) => getCollectionNameFromTable(tableName);
