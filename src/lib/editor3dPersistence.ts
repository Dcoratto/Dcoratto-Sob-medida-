import {supabase} from './supabase';
import {validateCountertop, type CountertopModel} from './editor3dModel';
export const EDITOR3D_ENABLED = import.meta.env.VITE_EDITOR3D_BETA === 'true';
export type DrawingRecord = {id: string; quote_id: string; piece_id: string; schema_version: 1; model: CountertopModel; revision: number; created_at: string; updated_at: string};
const savedDrawings = new Map<string, DrawingRecord>();
const keyFor = (userId: string, quoteId: string, pieceId: string) => JSON.stringify([userId, quoteId, pieceId]);
export const cachedDrawing = (userId: string, quoteId: string, pieceId: string) => savedDrawings.get(keyFor(userId, quoteId, pieceId));
function cache(userId: string, record: DrawingRecord) {
  if (savedDrawings.size >= 32) savedDrawings.delete(savedDrawings.keys().next().value!);
  savedDrawings.set(keyFor(userId, record.quote_id, record.piece_id), record);
}
export async function editor3dAccess() {
  const {data, error} = await supabase.rpc('quote_editor3d_access');
  if (error) throw error;
  return data === true;
}
export async function loadDrawing(userId: string, quoteId: string, pieceId: string): Promise<DrawingRecord | null> {
  const {data, error} = await supabase.rpc('quote_piece_drawing_get', {p_quote_id: quoteId, p_piece_id: pieceId});
  if (error) throw error;
  if (!data) {savedDrawings.delete(keyFor(userId, quoteId, pieceId)); return null;}
  const record = {...data, model: validateCountertop(data.model)} as DrawingRecord;
  cache(userId, record); return record;
}
export async function saveDrawing(userId: string, quoteId: string, pieceId: string, model: CountertopModel, revision: number | null): Promise<DrawingRecord> {
  const {data, error} = await supabase.rpc('quote_piece_drawing_save', {p_quote_id: quoteId, p_piece_id: pieceId, p_model: validateCountertop(model), p_expected_revision: revision});
  if (error) throw error;
  const record = {...data, model: validateCountertop(data.model)} as DrawingRecord;
  if (!record.id || !Number.isSafeInteger(record.revision) || record.revision < 1) throw new Error('Resposta de salvamento inválida.');
  cache(userId, record); return record;
}
