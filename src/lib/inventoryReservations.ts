import {deleteDoc, doc, serverTimestamp, setDoc} from 'firebase/firestore';
import {db} from './firebase';
import {Quote, QuoteStatus} from '../types';

const normalized = (value?: string) =>
  (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const shouldReserveStock = (status?: QuoteStatus | string) => {
  const text = normalized(status);
  return !text.includes('recusado') && !text.includes('cancelado');
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
