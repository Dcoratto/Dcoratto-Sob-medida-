export type DimensionKey = 'lengthMm' | 'depthMm' | 'thicknessMm';
export type CountertopModel = {schemaVersion: 1; type: 'rectangular_countertop'; dimensions: Record<DimensionKey, number>};
// Integer millimetres (0.1 cm precision); axes X=length, Y=thickness, Z=depth.
export const DIMENSION_LIMITS = {lengthMm: [100, 6000], depthMm: [100, 2500], thicknessMm: [10, 200]} as const;
export const DEFAULT_COUNTERTOP: CountertopModel = {schemaVersion: 1, type: 'rectangular_countertop', dimensions: {lengthMm: 2500, depthMm: 600, thicknessMm: 20}};
export const mmToCm = (mm: number) => mm / 10;
export const mmToScene = (mm: number) => mm / 1000;
export function parseCentimeters(text: string, key: DimensionKey): {mm?: number; error?: string} {
  if (!/^\d+(?:[.,]\d)?$/.test(text)) return {error: 'Informe centímetros com até uma casa decimal.'};
  const mm = Math.round(Number(text.replace(',', '.')) * 10);
  const [min, max] = DIMENSION_LIMITS[key];
  return Number.isSafeInteger(mm) && mm >= min && mm <= max ? {mm} : {error: `Use entre ${mmToCm(min)} e ${mmToCm(max)} cm.`};
}
export function validateCountertop(value: unknown): CountertopModel {
  const model = value as CountertopModel;
  if (!model || typeof model !== 'object' || Array.isArray(model) || Object.keys(model).sort().join(',') !== 'dimensions,schemaVersion,type' || model.schemaVersion !== 1 || model.type !== 'rectangular_countertop') throw new Error('Schema geométrico desconhecido.');
  const d = model.dimensions;
  if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).sort().join(',') !== 'depthMm,lengthMm,thicknessMm') throw new Error('Dimensões inválidas.');
  for (const key of Object.keys(DIMENSION_LIMITS) as DimensionKey[]) {
    const [min, max] = DIMENSION_LIMITS[key];
    if (!Number.isSafeInteger(d[key]) || d[key] < min || d[key] > max) throw new Error('Dimensões fora dos limites ou precisão inválida.');
  }
  return {schemaVersion: 1, type: 'rectangular_countertop', dimensions: {lengthMm:d.lengthMm,depthMm:d.depthMm,thicknessMm:d.thicknessMm}};
}
export const serializeCountertop = (model: CountertopModel) => JSON.stringify(validateCountertop(model));
export function deserializeCountertop(json: string) {
  if (new TextEncoder().encode(json).length > 1024) throw new Error('Modelo excede 1 KiB.');
  return validateCountertop(JSON.parse(json));
}
export const experimentalArea = (model: CountertopModel) => model.dimensions.lengthMm * model.dimensions.depthMm / 1_000_000;
export const topOutline = (model: CountertopModel) => ({width: model.dimensions.lengthMm, height: model.dimensions.depthMm});
export const solidDimensions = (model: CountertopModel) => [mmToScene(model.dimensions.lengthMm), mmToScene(model.dimensions.thicknessMm), mmToScene(model.dimensions.depthMm)] as const;
export const hasPendingDrawing = (model: CountertopModel, saved: string | null) => serializeCountertop(model) !== saved;
// A response acknowledges precisely the submitted model, never edits made while it was in flight.
export const acknowledgeDrawing = (submitted: CountertopModel, current: CountertopModel) => ({saved: serializeCountertop(submitted), pending: serializeCountertop(submitted) !== serializeCountertop(current)});
