import {dataUrlSize, readFileAsDataUrl} from './imageUtils';

const MAX_SOURCE_FILE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 600 * 1024;
const MIN_OUTPUT_BYTES = 200 * 1024;
const MAX_IMAGE_SIDE = 1920;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export type PreparedCrisisImage = {
  blob: Blob;
  mimeType: AllowedMimeType;
  width: number;
  height: number;
  sizeBytes: number;
  previewUrl: string;
  extension: 'jpg' | 'png' | 'webp';
};

const WEBP_SIGNATURE = ['RIFF', 'WEBP'];

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nao foi possivel abrir a imagem selecionada.'));
    image.src = source;
  });

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const detectMagicMimeType = async (file: File): Promise<AllowedMimeType | null> => {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';

  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff === WEBP_SIGNATURE[0] && webp === WEBP_SIGNATURE[1]) return 'image/webp';

  return null;
};

const supportsWebpExport = () => {
  const canvas = document.createElement('canvas');
  const exported = canvas.toDataURL('image/webp', 0.8);
  return exported.startsWith('data:image/webp');
};

const drawScaledCanvas = async (file: File) => {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nao foi possivel preparar a imagem para upload.');
  context.drawImage(image, 0, 0, width, height);
  return {canvas, width, height};
};

const exportOptimizedImage = async (
  canvas: HTMLCanvasElement,
  preferredMimeType: AllowedMimeType,
) => {
  const mimeType = preferredMimeType === 'image/webp' && !supportsWebpExport()
    ? 'image/jpeg'
    : preferredMimeType;

  const qualities = mimeType === 'image/png'
    ? [0.92]
    : [0.85, 0.82, 0.8, 0.78, 0.75];

  for (const quality of qualities) {
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const size = dataUrlSize(dataUrl);
    if (size <= MAX_OUTPUT_BYTES) {
      return {dataUrl, mimeType, size};
    }
  }

  const fallbackDataUrl = canvas.toDataURL(mimeType, qualities[qualities.length - 1]);
  return {dataUrl: fallbackDataUrl, mimeType, size: dataUrlSize(fallbackDataUrl)};
};

export const validateCrisisImageFile = async (file: File) => {
  if (!ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)) {
    throw new Error('Use apenas imagens JPEG, PNG ou WebP.');
  }

  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error('A imagem original esta muito pesada. Use um arquivo de ate 15 MB.');
  }

  const magicMimeType = await detectMagicMimeType(file);
  if (!magicMimeType || magicMimeType !== file.type) {
    throw new Error('O arquivo enviado nao corresponde a uma imagem valida.');
  }
};

export const prepareCrisisImageForUpload = async (file: File): Promise<PreparedCrisisImage> => {
  await validateCrisisImageFile(file);

  const {canvas, width, height} = await drawScaledCanvas(file);
  const preferredMimeType = file.type === 'image/png' ? 'image/png' : 'image/webp';
  const exported = await exportOptimizedImage(canvas, preferredMimeType);
  const blob = await dataUrlToBlob(exported.dataUrl);
  const extension = exported.mimeType === 'image/webp' ? 'webp' : exported.mimeType === 'image/png' ? 'png' : 'jpg';

  return {
    blob,
    mimeType: exported.mimeType,
    width,
    height,
    sizeBytes: blob.size,
    previewUrl: exported.dataUrl,
    extension,
  };
};

export const describeOptimizedImageSize = (sizeBytes: number) => {
  const sizeKb = Math.round(sizeBytes / 1024);
  if (sizeBytes < MIN_OUTPUT_BYTES) {
    return `${sizeKb} KB (leve)`;
  }
  if (sizeBytes <= MAX_OUTPUT_BYTES) {
    return `${sizeKb} KB`;
  }
  return `${sizeKb} KB (acima do ideal)`;
};
