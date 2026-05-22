import {supabase} from './supabase';
import {readFileAsDataUrl} from './imageUtils';

type StorageReference = {
  bucket: string;
  path: string;
  publicUrl?: string;
};

type UploadResult = {
  ref: StorageReference;
};

const resolveBucket = (path: string) => {
  if (path.startsWith('inventory/')) return 'inventory-images';
  if (path.startsWith('fixture-manuals/')) return 'fixture-files';
  if (path.startsWith('fixtures/')) return 'fixture-files';
  return 'company-files';
};

const parseSupabasePublicUrl = (url: string): StorageReference | null => {
  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const storagePath = parsed.pathname.slice(markerIndex + marker.length);
    const [bucket, ...parts] = storagePath.split('/');
    if (!bucket || parts.length === 0) return null;
    return {
      bucket,
      path: parts.join('/'),
      publicUrl: url,
    };
  } catch {
    return null;
  }
};

export const storage = {provider: 'supabase'} as const;

export const ref = (_storage: typeof storage, pathOrUrl: string): StorageReference => {
  const parsed = pathOrUrl.startsWith('http') ? parseSupabasePublicUrl(pathOrUrl) : null;
  if (parsed) return parsed;

  return {
    bucket: resolveBucket(pathOrUrl),
    path: pathOrUrl.replace(/^\/+/, ''),
    publicUrl: pathOrUrl.startsWith('http') ? pathOrUrl : undefined,
  };
};

export const uploadBytes = async (reference: StorageReference, file: File | Blob): Promise<UploadResult> => {
  const {error} = await supabase.storage
    .from(reference.bucket)
    .upload(reference.path, file, {
      upsert: true,
      contentType: (file as File).type || undefined,
    });

  if (error) {
    throw error;
  }

  return {ref: reference};
};

export const getDownloadURL = async (reference: StorageReference) => {
  if (reference.publicUrl?.startsWith('data:') || (reference.publicUrl && !reference.publicUrl.includes('/storage/v1/object/public/'))) {
    return reference.publicUrl;
  }

  const {data} = supabase.storage.from(reference.bucket).getPublicUrl(reference.path);
  return data.publicUrl;
};

export const deleteObject = async (reference: StorageReference) => {
  if (reference.publicUrl && !reference.publicUrl.includes('/storage/v1/object/public/')) {
    return;
  }

  const {error} = await supabase.storage.from(reference.bucket).remove([reference.path]);
  if (error) throw error;
};

export const uploadFileAsDataUrl = (file: File) => readFileAsDataUrl(file);

