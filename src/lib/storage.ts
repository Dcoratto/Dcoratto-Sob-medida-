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

type ImageVariantSource = {
  imageUrl?: string;
  photoUrl?: string;
  logoUrl?: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  originalUrl?: string;
};

const resolveBucket = (path: string) => {
  if (path.startsWith('materials/')) return 'materials-images';
  if (path.startsWith('inventory/')) return 'inventory-images';
  if (path.startsWith('fixture-manuals/')) return 'fixture-files';
  if (path.startsWith('fixtures/')) return 'fixture-files';
  if (path.startsWith('profiles/')) return 'company-files';
  if (path.startsWith('settings/')) return 'company-files';
  if (path.startsWith('logos/')) return 'company-files';
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

export const storagePath = (...segments: string[]) =>
  segments
    .map((segment) => String(segment || '').trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

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

export const uploadDataUrl = async (reference: StorageReference, dataUrl: string): Promise<UploadResult> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return uploadBytes(reference, blob);
};

export const getDownloadURL = async (reference: StorageReference) => {
  if (reference.publicUrl?.startsWith('data:') || (reference.publicUrl && !reference.publicUrl.includes('/storage/v1/object/public/'))) {
    return reference.publicUrl;
  }

  const {data} = supabase.storage.from(reference.bucket).getPublicUrl(reference.path);
  return data.publicUrl;
};

export const deleteObject = async (reference: StorageReference) => {
  if (reference.publicUrl?.startsWith('data:')) {
    return;
  }

  if (reference.publicUrl && !reference.publicUrl.includes('/storage/v1/object/public/')) {
    return;
  }

  if (reference.path.startsWith('data:')) {
    return;
  }

  const {error} = await supabase.storage.from(reference.bucket).remove([reference.path]);
  if (error) throw error;
};

export const uploadFileAsDataUrl = (file: File) => readFileAsDataUrl(file);

export const imageVariantUrl = (
  source: ImageVariantSource | undefined,
  variant: 'thumbnail' | 'medium' | 'original' = 'thumbnail',
) => {
  if (!source) return '';
  if (variant === 'thumbnail') {
    return source.thumbnailUrl || source.mediumUrl || source.imageUrl || source.photoUrl || source.logoUrl || source.originalUrl || '';
  }
  if (variant === 'medium') {
    return source.mediumUrl || source.imageUrl || source.photoUrl || source.thumbnailUrl || source.logoUrl || source.originalUrl || '';
  }
  return source.originalUrl || source.imageUrl || source.photoUrl || source.logoUrl || source.mediumUrl || source.thumbnailUrl || '';
};
