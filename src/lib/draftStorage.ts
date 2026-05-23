type DraftEnvelope<T> = {
  __draft: true;
  savedAt: string;
  data: T;
};

const isDraftEnvelope = <T>(value: unknown): value is DraftEnvelope<T> =>
  Boolean(
    value &&
    typeof value === 'object' &&
    (value as DraftEnvelope<T>).__draft === true &&
    typeof (value as DraftEnvelope<T>).savedAt === 'string' &&
    'data' in (value as DraftEnvelope<T>),
  );

export const loadDraftMeta = <T>(key: string): {data: T | null; savedAt: string | null} => {
  if (typeof window === 'undefined') return {data: null, savedAt: null};

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {data: null, savedAt: null};
    const parsed = JSON.parse(raw) as T | DraftEnvelope<T>;

    if (isDraftEnvelope<T>(parsed)) {
      return {data: parsed.data, savedAt: parsed.savedAt};
    }

    return {data: parsed as T, savedAt: null};
  } catch (error) {
    console.warn(`Nao foi possivel ler o rascunho ${key}:`, error);
    return {data: null, savedAt: null};
  }
};

export const loadDraft = <T>(key: string): T | null => loadDraftMeta<T>(key).data;

export const saveDraft = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return null;

  try {
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(key, JSON.stringify({
      __draft: true,
      savedAt,
      data: value,
    }));
    return savedAt;
  } catch (error) {
    console.warn(`Nao foi possivel salvar o rascunho ${key}:`, error);
    return null;
  }
};

export const clearDraft = (key: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Nao foi possivel limpar o rascunho ${key}:`, error);
  }
};
