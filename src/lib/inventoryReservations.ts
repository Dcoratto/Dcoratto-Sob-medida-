import {collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where} from './firestore';
import {db} from './firebase';
import {Quote, QuoteStatus} from '../types';
import {isQuoteApprovedOrBeyond, normalizeText} from './quoteStatus';
import {buildMaterialVariantKey} from './materialVariants';

export const shouldReserveStock = (status?: QuoteStatus | string) => {
  const text = normalizeText(status);
  return !text.includes('recusado') && !text.includes('cancelado');
};

export const isApprovedOrBeyond = (status?: QuoteStatus | string) => {
  return isQuoteApprovedOrBeyond(status);
};

export const syncQuoteReservation = async (quoteId: string, quote: Partial<Quote>) => {
  if (!quoteId) return;
  const existing = await getDocs(query(collection(db, 'inventoryReservations'), where('quoteId', '==', quoteId))).catch(() => null);
  if (existing) {
    await Promise.all(existing.docs.map((item) => deleteDoc(item.ref).catch(() => undefined)));
  }
  await deleteDoc(doc(db, 'inventoryReservations', quoteId)).catch(() => undefined);

  if (!shouldReserveStock(quote.status)) {
    return;
  }

  const areasByMaterial = new Map<string, {name: string; area: number; materialId: string; materialVariantKey?: string; materialLine?: string; materialType?: string; thicknessLabel?: string; texture?: string; provider?: string;}>();
  (quote.pieces || []).forEach((piece) => {
    if (!piece.materialId) return;
    const mainArea = piece.unit === 'cm' ?((piece.width || 0) * (piece.length || 0)) / 10000 : (piece.width || 0) * (piece.length || 0);
    const sidesArea = (piece.sides || []).reduce((sum, side) => sum + ((side.length || 0) * (side.height || 0) * (side.quantity || 1)) / (piece.unit === 'cm' ?10000 : 1), 0);
    const manualOrMain = piece.manualArea || mainArea;
    const area = manualOrMain + sidesArea;
    if (area <= 0) return;
    const materialVariantKey = piece.materialVariantKey || buildMaterialVariantKey(piece);
    const mapKey = materialVariantKey || piece.materialId;
    const current = areasByMaterial.get(mapKey) || {
      name: piece.materialId,
      area: 0,
      materialId: piece.materialId,
      materialVariantKey,
      materialLine: piece.materialLine,
      materialType: piece.materialType,
      thicknessLabel: piece.thicknessLabel,
      texture: piece.texture,
      provider: piece.provider,
    };
    areasByMaterial.set(mapKey, {
      ...current,
      name: current.name,
      area: current.area + area,
      materialId: piece.materialId,
      materialVariantKey,
      materialLine: piece.materialLine,
      materialType: piece.materialType,
      thicknessLabel: piece.thicknessLabel,
      texture: piece.texture,
      provider: piece.provider,
    });
  });

  if (areasByMaterial.size === 0 && quote.materialId && Number(quote.totalArea || 0) > 0) {
    areasByMaterial.set(quote.materialId, {name: quote.materialName || quote.materialId, area: Number(quote.totalArea || 0), materialId: quote.materialId});
  }

  await Promise.all(Array.from(areasByMaterial.entries()).map(([reservationKey, data]) => setDoc(doc(db, 'inventoryReservations', `${quoteId}_${reservationKey}`), {
    quoteId,
    materialId: data.materialId,
    materialVariantKey: data.materialVariantKey || '',
    materialLine: data.materialLine || '',
    materialType: data.materialType || '',
    thicknessLabel: data.thicknessLabel || '',
    texture: data.texture || '',
    provider: data.provider || '',
    materialName: data.name,
    area: data.area,
    quoteStatus: quote.status,
    clientName: quote.clientName || '',
    updatedAt: serverTimestamp(),
  }, {merge: true})));
};

export const releaseQuoteReservation = async (quoteId: string) => {
  if (!quoteId) return;
  await deleteDoc(doc(db, 'inventoryReservations', quoteId)).catch(() => undefined);
  const existing = await getDocs(query(collection(db, 'inventoryReservations'), where('quoteId', '==', quoteId))).catch(() => null);
  if (existing) await Promise.all(existing.docs.map((item) => deleteDoc(item.ref).catch(() => undefined)));
};

export const applyQuoteInventoryByStatusTransition = async (
  quoteId: string,
  _previousStatus: QuoteStatus | string | undefined,
  nextStatus: QuoteStatus | string | undefined,
  quote: Partial<Quote>,
) => {
  const nextQuoteStatus = (nextStatus as QuoteStatus | undefined) ?? quote.status;
  await syncQuoteReservation(quoteId, {...quote, status: nextQuoteStatus});
};
