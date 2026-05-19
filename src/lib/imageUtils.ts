const DEFAULT_MAX_STORED_IMAGE_BYTES = 850 * 1024;
const DEFAULT_IMAGE_MAX_SIDE = 900;

type OptimizeImageOptions = {
  maxBytes?: number;
  maxSide?: number;
  qualities?: number[];
  mimeType?: 'image/webp' | 'image/jpeg' | 'image/png';
  removeWhiteBackground?: boolean;
};

type RuntimeWebpOptions = {
  maxSide?: number;
  quality?: number;
  removeWhiteBackground?: boolean;
};

const runtimeCache = new Map<string, Promise<string>>();

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });

export const dataUrlSize = (dataUrl: string) => Math.ceil((dataUrl.length * 3) / 4);

const loadImageElement = (source: string, crossOrigin: 'anonymous' | '' = '') =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem selecionada.'));
    img.src = source;
  });

const stripWhiteBackground = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const imageData = context.getImageData(0, 0, width, height);
  const {data} = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red > 242 && green > 242 && blue > 242) {
      data[index + 3] = 0;
    }
  }
  context.putImageData(imageData, 0, 0);
};

const drawImageToCanvas = (
  image: HTMLImageElement,
  {
    maxSide = DEFAULT_IMAGE_MAX_SIDE,
    removeWhiteBackground = false,
  }: {maxSide?: number; removeWhiteBackground?: boolean},
) => {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível preparar a imagem.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (removeWhiteBackground) {
    stripWhiteBackground(context, canvas.width, canvas.height);
  }

  return canvas;
};

export const optimizeImageFile = async (
  file: File,
  {
    maxBytes = DEFAULT_MAX_STORED_IMAGE_BYTES,
    maxSide = DEFAULT_IMAGE_MAX_SIDE,
    qualities = [0.9, 0.82, 0.74, 0.66, 0.58],
    mimeType = 'image/webp',
    removeWhiteBackground = false,
  }: OptimizeImageOptions = {},
) => {
  const source = await readFileAsDataUrl(file);
  const image = await loadImageElement(source);
  const canvas = drawImageToCanvas(image, {maxSide, removeWhiteBackground});

  for (const quality of qualities) {
    const dataUrl = canvas.toDataURL(mimeType, quality);
    if (dataUrlSize(dataUrl) <= maxBytes) {
      return dataUrl;
    }
  }

  throw new Error('A imagem ficou muito pesada. Tente uma imagem menor ou mais simples.');
};

export const convertImageUrlToWebp = async (
  source: string,
  {
    maxSide = 1600,
    quality = 0.9,
    removeWhiteBackground = false,
  }: RuntimeWebpOptions = {},
) => {
  if (!source) return '';
  if (source.startsWith('data:image/webp')) return source;

  const cacheKey = JSON.stringify({source, maxSide, quality, removeWhiteBackground});
  if (!runtimeCache.has(cacheKey)) {
    runtimeCache.set(cacheKey, (async () => {
      try {
        const image = await loadImageElement(source, 'anonymous');
        const canvas = drawImageToCanvas(image, {maxSide, removeWhiteBackground});
        return canvas.toDataURL('image/webp', quality);
      } catch {
        return source;
      }
    })());
  }

  return runtimeCache.get(cacheKey)!;
};
