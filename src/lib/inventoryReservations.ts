import {collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where} from 'firebase/firestore';
import {db} from './firebase';
import {Quote, QuoteStatus} from '../types';

const normalized = (value?: string) =>
  (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const shouldReserveStock = (status?: QuoteStatus | string) => {
  const text = normalized(status);
  if (text.includes('recusado') || text.includes('cancelado')) return false;
  if (isApprovedOrBeyond(status)) return false;
  return true;
};

export const isApprovedOrBeyond = (status?: QuoteStatus | string) => {
  const text = normalized(status);
  return text.includes('aprovado')
    || text.includes('em producao')
    || text.includes('pronto para entrega')
    || text.includes('entregue')
    || text.includes('concluido');
};

export const syncQuoteReservation = async (quoteId: string, quote: Partial<Quote>) => {
  if (!quoteId) return;
  const reservationRef = doc(db, 'inventoryReservations', quoteId);
  const area = Number(quote.totalArea || 0);

  if (!quote.materialId || area <= 0 || !shouldReserveStock(quote.status)) {
    await deleteDoc(reservationRef).catch(() => undefined);
    return;
  }

  await setDoc(reservationRef, {
    quoteId,
    materialId: quote.materialId,
    materialName: quote.materialName || quote.materialId,
    area,
    quoteStatus: quote.status,
    clientName: quote.clientName || '',
    updatedAt: serverTimestamp(),
  }, {merge: true});
};

export const releaseQuoteReservation = async (quoteId: string) => {
  if (!quoteId) return;
  await deleteDoc(doc(db, 'inventoryReservations', quoteId)).catch(() => undefined);
};

export const consumeInventoryForApprovedQuote = async (quoteId: string, quote: Partial<Quote>) => {
  const requiredArea = Number(quote.totalArea || 0);
  if (!quoteId || !quote.materialId || requiredArea <= 0) return;

  const q = query(collection(db, 'inventory'), where('materialId', '==', quote.materialId), orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);

  const candidates = snapshot.docs
    .map((item) => ({id: item.id, ...(item.data() as any)}))
    .filter((item) => {
      const status = normalized(item.status);
      return (status === 'disponivel' || status === 'retalho') && Number(item.area || 0) > 0;
    });

  const availableArea = candidates.reduce((sum, item) => sum + Number(item.area || 0), 0);
  if (availableArea + 0.000001 < requiredArea) {
    const missing = requiredArea - availableArea;
    throw new Error(`Estoque insuficiente para aprovar. Faltam ${missing.toFixed(2)} m² de ${quote.materialName || 'material'}.`);
  }

  let remaining = requiredArea;
  for (const item of candidates) {
    if (remaining <= 0) break;
    const currentArea = Number(item.area || 0);
    const consume = Math.min(currentArea, remaining);
    const nextArea = currentArea - consume;
    remaining -= consume;

    await updateDoc(doc(db, 'inventory', item.id), {
      area: Math.max(0, Number(nextArea.toFixed(4))),
      status: nextArea <= 0.0001 ? 'Usada' : item.status,
      updatedAt: serverTimestamp(),
    });
  }

  await releaseQuoteReservation(quoteId);
};

export const applyQuoteInventoryByStatusTransition = async (
  quoteId: string,
  previousStatus: QuoteStatus | string | undefined,
  nextStatus: QuoteStatus | string | undefined,
  quote: Partial<Quote>,
) => {
  const wasApproved = isApprovedOrBeyond(previousStatus);
  const willBeApproved = isApprovedOrBeyond(nextStatus);
  const nextQuoteStatus = (nextStatus as QuoteStatus | undefined) ?? quote.status;

  if (!wasApproved && willBeApproved) {
    await consumeInventoryForApprovedQuote(quoteId, {...quote, status: nextQuoteStatus});
    return;
  }

  await syncQuoteReservation(quoteId, {...quote, status: nextQuoteStatus});
};
